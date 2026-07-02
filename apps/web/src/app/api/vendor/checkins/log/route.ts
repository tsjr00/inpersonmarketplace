import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'

/**
 * GET /api/vendor/checkins/log?vertical=<v>
 *
 * The authenticated vendor's OWN market-day check-in history (all dates),
 * newest first — the FT compliance "location log": date → park → address →
 * in/out times, plus whether location was captured. Vendor-self only (auth
 * gate + own vendor_profile_id filter). Reuses market_day_checkins (mig 160).
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/checkins/log', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`checkin-log:${clientIp}`, rateLimits.api)
    if (!rl.success) return rateLimitResponse(rl)

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const vertical = request.nextUrl.searchParams.get('vertical') || 'food_trucks'
    const { profile } = await getVendorProfileForVertical<{ id: string }>(supabase, user.id, vertical, 'id')
    if (!profile) return NextResponse.json({ log: [] })

    const service = createServiceClient()
    const { data, error } = await service
      .from('market_day_checkins')
      .select('market_date, checked_in_at, checked_out_at, booth_number, within_geofence, captured_latitude, attestation_version, markets:market_id ( name, address, city, state, zip )')
      .eq('vendor_profile_id', profile.id)
      .order('market_date', { ascending: false })
      .limit(1000)

    if (error) {
      throw traced.fromSupabase(error, { table: 'market_day_checkins', operation: 'select' })
    }

    const log = (data ?? []).map((r) => {
      const m = r.markets as unknown as { name: string; address: string; city: string; state: string; zip: string } | null
      const hasLocation = r.captured_latitude !== null && r.captured_latitude !== undefined
      return {
        date: r.market_date as string,
        parkName: m?.name ?? null,
        address: m
          ? [m.address, m.city, m.state].filter(Boolean).join(', ') + (m.zip ? ' ' + m.zip : '')
          : null,
        checkedInAt: (r.checked_in_at as string | null) ?? null,
        checkedOutAt: (r.checked_out_at as string | null) ?? null,
        boothNumber: (r.booth_number as string | null) ?? null,
        locationCaptured: hasLocation,
        withinGeofence: (r.within_geofence as boolean | null) ?? null,
        attestationVersion: (r.attestation_version as string | null) ?? null,
      }
    })

    return NextResponse.json({ log })
  })
}
