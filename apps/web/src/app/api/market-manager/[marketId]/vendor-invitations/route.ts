import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

/**
 * GET  /api/market-manager/[marketId]/vendor-invitations
 *   Returns pending invitations at this market —
 *   market_vendors rows where response_status='invited' AND approved=false.
 *
 * POST /api/market-manager/[marketId]/vendor-invitations
 *   Bulk-invite platform vendors to this market.
 *   Body: { vendor_profile_ids: string[] }
 *
 *   For each vendor:
 *     - Skip if a market_vendors row already exists (any status) — counts
 *       returned as `skipped`.
 *     - Otherwise INSERT row with response_status='invited', invited_at=NOW(),
 *       approved=false. Fire `market_vendor_invited` notification with
 *       in-app + email channels (template includes link to market profile).
 *
 *   Auth: assigned manager of the market.
 *
 *   On vendor acceptance (separate endpoint /api/vendor/markets/[id]/respond),
 *   approved auto-flips to true since the manager initiated. State machine:
 *
 *     response_status   approved   meaning
 *     NULL              false      self-joined, awaiting manager approval (legacy)
 *     NULL              true       self-joined + manager approved (legacy)
 *     'invited'         false      THIS ROUTE creates — awaiting vendor response
 *     'accepted'        true       vendor accepted (auto-approved on accept)
 *     'declined'        false      vendor declined; row stays for audit
 *
 *   NO REVOKE ENDPOINT in v1 — managers cannot uninvite once a vendor is
 *   in 'invited' state. Backlogged for future review: the broader
 *   permission boundary (managers cannot disassociate vendors from markets
 *   via the manager API; src/lib/__tests__/flow-integrity.test.ts:340-397)
 *   needs revising before a revoke path can ship. Vendor non-response is
 *   handled by cron Phase 17 — auto-flips to 'declined' after 30 days.
 *
 *   Pattern mirrors the catering event invite at
 *   src/app/api/admin/events/[id]/invite/route.ts (admin-initiated event
 *   invitation) — same column usage, different notification type.
 */

interface VendorInvitationRow {
  market_vendor_id: string
  vendor_profile_id: string
  business_name: string
  invited_at: string | null
  response_status: string | null
}

async function authorize(
  marketId: string,
  request: NextRequest
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`mm-invite:${clientIp}`, rateLimits.submit)
  if (!rateLimitResult.success) {
    return { ok: false, response: rateLimitResponse(rateLimitResult) }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

  const allowed = await isMarketManager(supabase, marketId, user)
  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 }),
    }
  }
  return { ok: true }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/vendor-invitations', 'GET', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const serviceClient = createServiceClient()
    crumb.supabase('select', 'market_vendors')
    const { data, error } = await serviceClient
      .from('market_vendors')
      .select(`
        id,
        vendor_profile_id,
        invited_at,
        response_status,
        vendor_profiles!market_vendors_vendor_profile_id_fkey ( profile_data )
      `)
      .eq('market_id', marketId)
      .eq('response_status', 'invited')
      .eq('approved', false)
      .order('invited_at', { ascending: false })

    if (error) {
      throw traced.fromSupabase(error, { table: 'market_vendors', operation: 'select' })
    }

    const rows: VendorInvitationRow[] = (data || []).map((row) => {
      const vp = row.vendor_profiles as unknown as
        | { profile_data: Record<string, unknown> | null }
        | { profile_data: Record<string, unknown> | null }[]
        | null
      const profile = Array.isArray(vp) ? vp[0] : vp
      const profileData = profile?.profile_data as { business_name?: string; farm_name?: string } | null
      const businessName =
        profileData?.business_name || profileData?.farm_name || 'Unknown vendor'
      return {
        market_vendor_id: row.id as string,
        vendor_profile_id: row.vendor_profile_id as string,
        business_name: businessName,
        invited_at: (row.invited_at as string | null) ?? null,
        response_status: (row.response_status as string | null) ?? null,
      }
    })

    return NextResponse.json({ invitations: rows })
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/vendor-invitations', 'POST', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    const rawIds = body?.vendor_profile_ids
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      throw traced.validation(
        'ERR_VALIDATION_001',
        'vendor_profile_ids must be a non-empty array of UUIDs'
      )
    }
    // De-dupe + filter to non-empty strings
    const vendorProfileIds = Array.from(
      new Set(
        rawIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    )
    if (vendorProfileIds.length === 0) {
      throw traced.validation(
        'ERR_VALIDATION_002',
        'vendor_profile_ids must contain at least one valid id'
      )
    }
    // Bulk-invite sanity cap — prevents accidental "select all" disasters.
    if (vendorProfileIds.length > 50) {
      throw traced.validation(
        'ERR_VALIDATION_003',
        'Cannot invite more than 50 vendors at once. Send a smaller batch.'
      )
    }

    const serviceClient = createServiceClient()

    // Resolve market metadata for the notification payload + the vertical
    // filter on vendor_profiles below (only same-vertical vendors are
    // eligible — FT vendors can't be invited to FM markets and vice versa).
    crumb.supabase('select', 'markets')
    const { data: market, error: marketErr } = await serviceClient
      .from('markets')
      .select('id, name, vertical_id')
      .eq('id', marketId)
      .maybeSingle()

    if (marketErr) {
      throw traced.fromSupabase(marketErr, { table: 'markets', operation: 'select' })
    }
    if (!market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }
    const marketName = (market.name as string) || 'the market'
    const verticalId = (market.vertical_id as string) || 'farmers_market'

    // Skip vendors who already have ANY market_vendors row at this market
    // (regardless of status). Same idempotency check as the catering
    // event invite route.
    crumb.supabase('select', 'market_vendors')
    const { data: existingRows } = await serviceClient
      .from('market_vendors')
      .select('vendor_profile_id')
      .eq('market_id', marketId)
      .in('vendor_profile_id', vendorProfileIds)

    const alreadyAtMarket = new Set(
      (existingRows || []).map((r) => r.vendor_profile_id as string)
    )
    const candidateIds = vendorProfileIds.filter((id) => !alreadyAtMarket.has(id))

    if (candidateIds.length === 0) {
      return NextResponse.json({
        invited: 0,
        skipped: vendorProfileIds.length,
        skipped_reason: 'All selected vendors are already at this market.',
      })
    }

    // Fetch the eligible vendor profiles (must be same vertical + approved).
    // Invitation should not work on suspended/deleted vendors.
    crumb.supabase('select', 'vendor_profiles')
    const { data: vendorProfiles } = await serviceClient
      .from('vendor_profiles')
      .select('id, user_id, profile_data')
      .in('id', candidateIds)
      .eq('vertical_id', verticalId)
      .eq('status', 'approved')
      .is('deleted_at', null)

    const eligibleIds = new Set((vendorProfiles || []).map((vp) => vp.id as string))
    const eligibleProfiles = vendorProfiles || []

    if (eligibleIds.size === 0) {
      return NextResponse.json({
        invited: 0,
        skipped: vendorProfileIds.length,
        skipped_reason: 'No selected vendors are eligible (must be approved vendors in this market\'s vertical).',
      })
    }

    // Bulk INSERT — array of rows with response_status='invited' + invited_at.
    // No approved flip yet (that happens on vendor accept). Distinct from
    // existing self-join path which leaves response_status NULL.
    const nowIso = new Date().toISOString()
    const rowsToInsert = Array.from(eligibleIds).map((vpId) => ({
      market_id: marketId,
      vendor_profile_id: vpId,
      response_status: 'invited',
      invited_at: nowIso,
      approved: false,
    }))

    crumb.supabase('insert', 'market_vendors')
    const { data: inserted, error: insertErr } = await serviceClient
      .from('market_vendors')
      .insert(rowsToInsert)
      .select('id, vendor_profile_id')

    if (insertErr) {
      // 23505 on (market_id, vendor_profile_id) UNIQUE means a row was
      // created concurrently between our existence-check and INSERT.
      // Treat the whole batch as racy and ask the caller to retry —
      // safer than half-applying.
      if (insertErr.code === '23505') {
        return NextResponse.json(
          { error: 'Some vendors were just invited by another session. Refresh and try again.' },
          { status: 409 }
        )
      }
      throw traced.fromSupabase(insertErr, { table: 'market_vendors', operation: 'insert' })
    }

    // Fire notifications. Best-effort — wrap each in its own try/catch so a
    // single failure doesn't abort the rest of the batch. sendNotification
    // is non-throwing by contract, but belt-and-suspender.
    let notifiedCount = 0
    for (const vp of eligibleProfiles) {
      try {
        if (!vp.user_id) continue
        // Look up the vendor's auth email for the email channel.
        let vendorEmail: string | null = null
        try {
          const { data: authUser } = await serviceClient.auth.admin.getUserById(
            vp.user_id as string
          )
          vendorEmail = authUser?.user?.email ?? null
        } catch {
          // Email lookup failure → in-app channel still fires.
        }
        await sendNotification(
          vp.user_id as string,
          'market_vendor_invited',
          {
            marketName,
            marketId,
          },
          {
            vertical: verticalId,
            ...(vendorEmail ? { userEmail: vendorEmail } : {}),
          }
        )
        notifiedCount++
      } catch (notifErr) {
        // Non-blocking log — same pattern as the catering event invite
        // fanout at src/app/api/admin/events/[id]/invite/route.ts.
        console.error(
          '[mm-invite] Notification fanout failed:',
          notifErr instanceof Error ? notifErr.message : 'Unknown'
        )
      }
    }

    return NextResponse.json({
      invited: inserted?.length ?? 0,
      notified: notifiedCount,
      skipped:
        vendorProfileIds.length - (inserted?.length ?? 0),
    })
  })
}
