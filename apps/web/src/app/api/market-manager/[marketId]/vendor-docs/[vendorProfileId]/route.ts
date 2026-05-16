import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

/**
 * GET /api/market-manager/[marketId]/vendor-docs/[vendorProfileId]
 *
 * Manager-side read of a vendor's onboarding documentation. Closes the
 * loop opened by the State C info-sharing consent checkbox (G3 from the
 * 2026-05-16 build): vendor authorized share → manager can now actually
 * see the docs.
 *
 * Auth chain (three gates):
 *   1. Caller is the assigned manager of this market (isMarketManager).
 *   2. Vendor is associated with this market (market_vendors row exists).
 *   3. Vendor has consented via `_info_sharing_consent` synthetic entry
 *      in their vendor_market_agreement_acceptances.statements_snapshot
 *      for THIS market. Without consent, return 403 — even the manager
 *      can't see docs they're not authorized for.
 *
 * Response: passes through the relevant `vendor_verifications` fields +
 * the vendor's business_name. Storage URLs are public-ish (signed via
 * Supabase Storage policy); the manager can click to view.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string; vendorProfileId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/vendor-docs/[vendorProfileId]', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`mm-docs:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { marketId, vendorProfileId } = await params

    crumb.auth('Checking market manager auth')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const allowed = await isMarketManager(supabase, marketId, user)
    if (!allowed) {
      return NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 })
    }

    const serviceClient = createServiceClient()

    // Gate 2: vendor must be at this market.
    crumb.supabase('select', 'market_vendors')
    const { data: mvRow } = await serviceClient
      .from('market_vendors')
      .select('id, approved')
      .eq('market_id', marketId)
      .eq('vendor_profile_id', vendorProfileId)
      .maybeSingle()
    if (!mvRow) {
      return NextResponse.json({ error: 'Vendor is not at this market' }, { status: 404 })
    }

    // Gate 3: vendor must have given info-sharing consent for this market.
    // The synthetic snapshot entry written by the State C join flow
    // (or by /api/submit when market_agreement_accepted=true alongside
    // info_sharing_accepted=true — TODO for new-vendor path).
    crumb.supabase('select', 'vendor_market_agreement_acceptances')
    const { data: acceptances } = await serviceClient
      .from('vendor_market_agreement_acceptances')
      .select('statements_snapshot')
      .eq('vendor_profile_id', vendorProfileId)
      .eq('market_id', marketId)
    const hasConsent = (acceptances || []).some((row) => {
      const snap = row.statements_snapshot as Array<{ statement_id?: string }> | null
      return Array.isArray(snap) && snap.some((s) => s?.statement_id === '_info_sharing_consent')
    })
    if (!hasConsent) {
      return NextResponse.json(
        { error: 'Vendor has not authorized info sharing for this market' },
        { status: 403 }
      )
    }

    // Fetch vendor's business name + verification record
    crumb.supabase('select', 'vendor_profiles')
    const { data: vp } = await serviceClient
      .from('vendor_profiles')
      .select('id, status, profile_data, vertical_id')
      .eq('id', vendorProfileId)
      .maybeSingle()
    if (!vp) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    const profileData = (vp.profile_data || {}) as Record<string, unknown>
    const businessName =
      (profileData.business_name as string | undefined) ||
      (profileData.farm_name as string | undefined) ||
      'Unknown vendor'

    crumb.supabase('select', 'vendor_verifications')
    const { data: verification } = await serviceClient
      .from('vendor_verifications')
      .select('requested_categories, category_verifications, documents, coi_status, coi_documents, coi_verified_at, prohibited_items_acknowledged_at, onboarding_completed_at, submitted_at')
      .eq('vendor_profile_id', vendorProfileId)
      .maybeSingle()

    return NextResponse.json({
      vendor_profile_id: vendorProfileId,
      business_name: businessName,
      vendor_status: vp.status,
      market_vendor_approved: !!mvRow.approved,
      // Verification data (may be empty if vendor hasn't onboarded yet)
      requested_categories: (verification?.requested_categories as string[] | null) ?? [],
      category_verifications: (verification?.category_verifications as Record<string, string> | null) ?? {},
      documents: (verification?.documents as Array<Record<string, unknown>> | null) ?? [],
      coi_status: (verification?.coi_status as string | null) ?? 'not_submitted',
      coi_documents: (verification?.coi_documents as Array<Record<string, unknown>> | null) ?? [],
      coi_verified_at: (verification?.coi_verified_at as string | null) ?? null,
      prohibited_items_acknowledged_at:
        (verification?.prohibited_items_acknowledged_at as string | null) ?? null,
      onboarding_completed_at: (verification?.onboarding_completed_at as string | null) ?? null,
      submitted_at: (verification?.submitted_at as string | null) ?? null,
    })
  })
}
