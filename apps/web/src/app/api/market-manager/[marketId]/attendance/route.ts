import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced } from '@/lib/errors'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { marketLocalDate } from '@/lib/markets/checkin-eligibility'

/**
 * GET /api/market-manager/[marketId]/attendance?date=YYYY-MM-DD
 * Vendor check-in/out rows for THIS market on a date. Manager-gated; rows are
 * inherently scoped to the market (market_id filter). Defaults to market-local
 * today. Read-only (no counter-sign UI in v1).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> },
) {
  return withErrorTracing('/api/market-manager/[marketId]/attendance', 'GET', async () => {
    const { marketId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    if (!(await isMarketManager(supabase, marketId, user))) {
      throw traced.auth('ERR_AUTH_002', 'Not the manager of this market')
    }

    const service = createServiceClient()

    const { data: market } = await service
      .from('markets')
      .select('timezone, vertical_id')
      .eq('id', marketId)
      .maybeSingle()

    const date = request.nextUrl.searchParams.get('date')
      || marketLocalDate((market?.timezone as string) ?? null)

    const { data: rows } = await service
      .from('market_day_checkins')
      .select(`
        vendor_profile_id, market_date, checked_in_at, checked_out_at, method,
        booth_number, distance_from_market_m, within_geofence,
        vendor_profiles!market_day_checkins_vendor_profile_id_fkey ( profile_data )
      `)
      .eq('market_id', marketId)
      .eq('market_date', date)
      .order('checked_in_at', { ascending: true })

    const attendance = (rows ?? []).map((r) => {
      const vp = r.vendor_profiles as unknown as { profile_data: Record<string, unknown> | null } | null
      const pd = vp?.profile_data ?? null
      const vendorName =
        (pd?.business_name as string) || (pd?.farm_name as string) || 'Vendor'
      return {
        vendorProfileId: r.vendor_profile_id,
        vendorName,
        boothNumber: r.booth_number as string | null,
        checkedInAt: r.checked_in_at as string,
        checkedOutAt: (r.checked_out_at as string) ?? null,
        method: r.method as string,
        distanceFromMarketM: r.distance_from_market_m as number | null,
        withinGeofence: r.within_geofence as boolean | null,
      }
    })

    // FT park no-show roster (P3c): trucks with a PAID spot booking for this
    // date who have NOT checked in. FM markets don't get this (weekly model).
    const noShows: Array<{ vendorProfileId: string; vendorName: string; spotLabel: string | null }> = []
    if ((market?.vertical_id as string | null) === 'food_trucks') {
      const checkedInIds = new Set(attendance.map((a) => a.vendorProfileId))
      const { data: booked } = await service
        .from('park_spot_bookings')
        .select(`
          vendor_profile_id,
          park_spots:spot_id ( label ),
          vendor_profiles:vendor_profile_id ( profile_data )
        `)
        .eq('market_id', marketId)
        .eq('booking_date', date)
        .eq('status', 'paid')
      const seen = new Set<string>()
      for (const b of booked ?? []) {
        const vpid = b.vendor_profile_id as string
        if (checkedInIds.has(vpid) || seen.has(vpid)) continue
        seen.add(vpid)
        const vp = b.vendor_profiles as unknown as { profile_data: Record<string, unknown> | null } | null
        const pd = vp?.profile_data ?? null
        const spot = b.park_spots as unknown as { label: string } | null
        noShows.push({
          vendorProfileId: vpid,
          vendorName: (pd?.business_name as string) || (pd?.farm_name as string) || 'Food truck',
          spotLabel: spot?.label ?? null,
        })
      }
    }

    return NextResponse.json({ date, attendance, noShows })
  })
}
