import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

/**
 * GET /api/market-manager/[marketId]/vendors
 *
 * Returns the list of vendors at this market with their current booth
 * number assignment, attendance status, and basic profile info. Used by
 * the manager dashboard "Vendors" card.
 *
 * Auth: caller must be the assigned manager of the market (dual-key
 * via isMarketManager helper). 403 otherwise.
 *
 * Response shape:
 *   { vendors: Array<{
 *       market_vendor_id, vendor_profile_id, business_name,
 *       booth_number, approved, response_status, on_platform: true
 *     }> }
 *
 * Off-platform vendor placeholders (manager-tracked spots that aren't
 * tied to a real vendor) live in a separate table — not in this list.
 * That endpoint ships with the off-platform-vendor placeholder migration.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/vendors', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`mm:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { marketId } = await params

    crumb.auth('Checking market manager auth')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const allowed = await isMarketManager(supabase, marketId, user)
    if (!allowed) {
      return NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 })
    }

    // Service client to bypass RLS — manager has been verified
    const serviceClient = createServiceClient()

    crumb.supabase('select', 'market_vendors')
    const { data: rows, error } = await serviceClient
      .from('market_vendors')
      .select(`
        id,
        vendor_profile_id,
        approved,
        response_status,
        booth_number,
        created_at,
        vendor_profiles!market_vendors_vendor_profile_id_fkey (
          id,
          status,
          profile_data
        )
      `)
      .eq('market_id', marketId)
      .order('booth_number', { ascending: true, nullsFirst: false })

    if (error) {
      throw traced.fromSupabase(error, { table: 'market_vendors', operation: 'select' })
    }

    // Fetch which vendors at this market have an active schedule entry.
    // Used by manager UI to filter "active" vendors (approved + scheduled).
    // Two queries instead of a join because market_vendors and
    // vendor_market_schedules share vendor_profile_id + market_id but have
    // no FK relationship for Supabase to auto-join. Both queries are
    // indexed and cheap (~2-5ms each on staging).
    crumb.supabase('select', 'vendor_market_schedules')
    const { data: scheduleRows, error: schedErr } = await serviceClient
      .from('vendor_market_schedules')
      .select('vendor_profile_id')
      .eq('market_id', marketId)
      .eq('is_active', true)

    if (schedErr) {
      throw traced.fromSupabase(schedErr, { table: 'vendor_market_schedules', operation: 'select' })
    }

    const activeScheduleSet = new Set(
      (scheduleRows ?? []).map((r) => r.vendor_profile_id as string)
    )

    // Phase B A1 (2026-05-16): fetch which vendors have authorized
    // info-sharing for this market (synthetic `_info_sharing_consent`
    // entry in the snapshot). Drives the "View docs" link in the
    // manager UI vendor row + access gate to /vendor-docs/...
    crumb.supabase('select', 'vendor_market_agreement_acceptances')
    const { data: acceptanceRows } = await serviceClient
      .from('vendor_market_agreement_acceptances')
      .select('vendor_profile_id, statements_snapshot')
      .eq('market_id', marketId)

    const consentSet = new Set<string>()
    for (const r of acceptanceRows ?? []) {
      const snap = r.statements_snapshot as Array<{ statement_id?: string }> | null
      if (Array.isArray(snap) && snap.some((s) => s?.statement_id === '_info_sharing_consent')) {
        consentSet.add(r.vendor_profile_id as string)
      }
    }

    const vendors = (rows || []).map((row) => {
      const vp = row.vendor_profiles as unknown as
        | { id: string; status: string; profile_data: Record<string, unknown> | null }
        | { id: string; status: string; profile_data: Record<string, unknown> | null }[]
        | null
      const profile = Array.isArray(vp) ? vp[0] : vp
      const profileData = profile?.profile_data as { business_name?: string; farm_name?: string } | null
      const businessName =
        profileData?.business_name || profileData?.farm_name || 'Unknown vendor'

      return {
        market_vendor_id: row.id as string,
        vendor_profile_id: row.vendor_profile_id as string,
        business_name: businessName,
        booth_number: (row.booth_number as string | null) ?? null,
        approved: !!row.approved,
        response_status: (row.response_status as string | null) ?? null,
        vendor_status: (profile?.status as string | null) ?? null,
        on_platform: true as const,
        is_active_schedule: activeScheduleSet.has(row.vendor_profile_id as string),
        has_info_sharing_consent: consentSet.has(row.vendor_profile_id as string),
        created_at: row.created_at as string,
      }
    })

    return NextResponse.json({ vendors })
  })
}
