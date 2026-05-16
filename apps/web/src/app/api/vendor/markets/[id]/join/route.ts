import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb, logError } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'
import { fetchMarketOptinForVendor } from '@/lib/markets/optin-public'
import { computeAgreementVersionFromSnapshot } from '@/lib/markets/agreement-version'

/**
 * POST /api/vendor/markets/[id]/join
 *
 * Lets an EXISTING vendor self-associate with a managed market via the
 * manager's invite link flow. Vendor opens `/[vertical]/vendor-signup
 * ?market=<id>` while logged in and already having a vendor profile;
 * the page renders the "Join [Market]" landing with the agreement
 * block; clicking Join calls this endpoint.
 *
 * Slug name `[id]` matches the sibling routes at this depth
 * (/api/vendor/markets/[id]/route.ts, /[id]/prep, /[id]/schedules) —
 * Next.js requires identical slug names at the same dynamic segment level.
 *
 * The same agreement-capture path applies to new vendors via /api/submit
 * auto-association (see submit/route.ts:196-230 — extended in this
 * session to also write an acceptance row).
 *
 * Body:
 *   { agreement_accepted: true, agreement_version?: string | null }
 *
 * Auth: must be authenticated AND have a vendor_profile in the market's
 * vertical.
 *
 * Behavior:
 *   1. Look up market (get vertical_id).
 *   2. Find caller's vendor profile in that vertical.
 *   3. Fetch the market's selected opt-in statements (rendered + snapshot).
 *   4. If `agreement_accepted !== true`, return 400. (We always require
 *      explicit acceptance, even when the manager has no statements
 *      selected yet — acceptance is the gate, not the statement count.)
 *   5. Upsert market_vendors row with approved=false (idempotent on
 *      (market_id, vendor_profile_id) via existing UNIQUE constraint).
 *   6. Insert vendor_market_agreement_acceptances row with the snapshot.
 *      Not atomic with step 5 — if this fails, market_vendors is already
 *      created and the inconsistency is logged. Vendor can be re-prompted
 *      via the dashboard's next-load mechanism (deferred polish).
 *
 * Returns:
 *   200 → { success, market_vendor_id, acceptance_id, approved }
 *   400 → agreement_accepted missing/false
 *   401 → not authenticated
 *   404 → market not found or vendor profile missing for market's vertical
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/vendor/markets/[id]/join', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-mkt-join:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    // Slug is `id` to satisfy Next.js sibling-route constraint; alias
    // to marketId internally so function body reads naturally.
    const { id: marketId } = await params

    crumb.auth('Checking vendor authentication')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const body = await request.json().catch(() => ({}))
    if (body?.agreement_accepted !== true) {
      throw traced.validation('ERR_VALIDATION_001', 'agreement_accepted must be true')
    }
    // B-close-3 (2026-05-16): agreement_version is now AUTO-COMPUTED from
    // the current statements snapshot — caller's body.agreement_version
    // (if supplied) is ignored. Deterministic hash makes re-acceptance
    // of the same statement set idempotent (UNIQUE conflict caught
    // below as 23505 → treated as success). Different statements → new
    // hash → new row inserted, audit trail preserved.
    const _ignoredClientVersion: string | null =
      typeof body?.agreement_version === 'string' && body.agreement_version.length > 0
        ? body.agreement_version
        : null
    void _ignoredClientVersion
    // Phase B State C captures a second consent: info-sharing
    // authorization (the existing-vendor "we can fast-track by sharing
    // your onboarding docs with the manager — authorize us"). Recorded
    // as a synthetic entry in statements_snapshot JSONB so no schema
    // change is required. Future code can scan for this id to find
    // vendors who consented to info sharing.
    const infoSharingAccepted: boolean = body?.info_sharing_accepted === true

    crumb.supabase('select', 'markets')
    const { data: market, error: marketErr } = await supabase
      .from('markets')
      .select('id, vertical_id, name')
      .eq('id', marketId)
      .maybeSingle()

    if (marketErr) {
      throw traced.fromSupabase(marketErr, { table: 'markets', operation: 'select' })
    }
    if (!market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    // Find vendor profile scoped to this market's vertical.
    const { profile, error: profErr } = await getVendorProfileForVertical<{
      id: string
      vertical_id: string
    }>(supabase, user.id, market.vertical_id, 'id, vertical_id')

    if (profErr || !profile) {
      return NextResponse.json(
        { error: profErr || 'Vendor profile not found for this market\'s vertical' },
        { status: 404 }
      )
    }

    // Build the acceptance snapshot from the manager's current selections.
    const { snapshot } = await fetchMarketOptinForVendor(marketId)

    // Auto-compute agreement version from the snapshot's statement IDs.
    // Synthetic entries (statement_id starting with '_') are excluded
    // from the hash so info-sharing-only changes don't trigger
    // re-acceptance of the agreement itself.
    const agreementVersion = computeAgreementVersionFromSnapshot(snapshot)

    // If info-sharing was authorized, append a synthetic snapshot entry
    // so the consent is captured in the same JSONB record as the opt-in
    // acceptance. Schema unchanged; future queries:
    //   WHERE statements_snapshot @> '[{"statement_id":"_info_sharing_consent"}]'
    const finalSnapshot = infoSharingAccepted
      ? [
          ...snapshot,
          {
            statement_id: '_info_sharing_consent',
            category: '_meta',
            statement_text: 'Vendor authorizes the platform to share their onboarding documentation with the market manager.',
            placeholder_values: {},
          },
        ]
      : snapshot

    const serviceClient = createServiceClient()

    // 1) Upsert market_vendors row (idempotent on existing UNIQUE).
    crumb.supabase('insert', 'market_vendors')
    const { data: mvData, error: mvErr } = await serviceClient
      .from('market_vendors')
      .upsert(
        {
          market_id: marketId,
          vendor_profile_id: profile.id,
          approved: false,
        },
        { onConflict: 'market_id,vendor_profile_id' }
      )
      .select('id, approved')
      .single()

    if (mvErr) {
      throw traced.fromSupabase(mvErr, { table: 'market_vendors', operation: 'insert' })
    }

    // 2) Insert acceptance row. Non-atomic with step 1; if this fails the
    //    market_vendors row stands and we log the inconsistency. Vendor
    //    can re-confirm later via dashboard prompt-on-next-load (future).
    crumb.supabase('insert', 'vendor_market_agreement_acceptances')
    const { data: vmaaData, error: vmaaErr } = await serviceClient
      .from('vendor_market_agreement_acceptances')
      .insert({
        vendor_profile_id: profile.id,
        market_id: marketId,
        statements_snapshot: finalSnapshot,
        agreement_version: agreementVersion,
      })
      .select('id')
      .single()

    if (vmaaErr) {
      // If unique violation on (vendor_profile_id, market_id, agreement_version),
      // treat as success — they've already accepted this version. Otherwise log.
      const isUnique = vmaaErr.code === '23505'
      if (!isUnique) {
        logError(traced.fromSupabase(vmaaErr, {
          table: 'vendor_market_agreement_acceptances',
          operation: 'insert',
        }))
      }
      return NextResponse.json({
        success: true,
        market_vendor_id: mvData.id,
        acceptance_id: null,
        acceptance_existed: isUnique,
        approved: mvData.approved,
      })
    }

    return NextResponse.json({
      success: true,
      market_vendor_id: mvData.id,
      acceptance_id: vmaaData.id,
      approved: mvData.approved,
    })
  })
}
