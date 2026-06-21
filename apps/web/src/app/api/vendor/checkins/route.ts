import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'
import {
  getEligibleCheckInMarkets,
  metersBetween,
  CHECKIN_GEOFENCE_RADIUS_M,
} from '@/lib/markets/checkin-eligibility'

export const CHECKIN_ATTESTATION_VERSION = 'checkin-2026-06-v1'
const CHECKIN_ATTESTATION_TEXT =
  'I confirm I am present and operating at this market today in accordance with my applicable permits/licenses and the platform vendor terms.'

/**
 * GET /api/vendor/checkins?vertical=<v>
 * Markets the vendor can check into today + their current check-in status.
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/checkins', 'GET', async () => {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const vertical = request.nextUrl.searchParams.get('vertical') || 'farmers_market'
    const { profile } = await getVendorProfileForVertical<{ id: string }>(
      supabase, user.id, vertical, 'id',
    )
    if (!profile) return NextResponse.json({ markets: [] })

    const service = createServiceClient()
    const eligible = await getEligibleCheckInMarkets(service, profile.id)
    if (eligible.length === 0) return NextResponse.json({ markets: [] })

    const { data: existing } = await service
      .from('market_day_checkins')
      .select('market_id, market_date, checked_in_at, checked_out_at')
      .eq('vendor_profile_id', profile.id)
      .in('market_id', eligible.map((e) => e.marketId))

    const byKey = new Map<string, { checked_in_at: string; checked_out_at: string | null }>()
    for (const r of existing ?? []) {
      byKey.set(`${r.market_id}|${r.market_date}`, {
        checked_in_at: r.checked_in_at as string,
        checked_out_at: (r.checked_out_at as string) ?? null,
      })
    }

    return NextResponse.json({
      markets: eligible.map((e) => {
        const c = byKey.get(`${e.marketId}|${e.marketDate}`)
        return {
          marketId: e.marketId,
          marketName: e.marketName,
          marketType: e.marketType,
          boothNumber: e.boothNumber,
          checkedInAt: c?.checked_in_at ?? null,
          checkedOutAt: c?.checked_out_at ?? null,
        }
      }),
    })
  })
}

/**
 * POST /api/vendor/checkins
 * Body: { action: 'checkin' | 'checkout', vertical, marketId, latitude?, longitude?, accuracy? }
 */
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/vendor/checkins', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`checkin:${clientIp}`, rateLimits.api)
    if (!rl.success) return rateLimitResponse(rl)

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const body = await request.json().catch(() => ({}))
    const action = body.action === 'checkout' ? 'checkout' : 'checkin'
    const vertical = (body.vertical as string) || 'farmers_market'
    const marketId = body.marketId as string | undefined
    if (!marketId) throw traced.validation('ERR_CHECKIN_001', 'marketId is required')

    const { profile } = await getVendorProfileForVertical<{ id: string }>(
      supabase, user.id, vertical, 'id',
    )
    if (!profile) throw traced.notFound('ERR_VENDOR_001', 'Vendor profile not found')

    const service = createServiceClient()
    const eligible = await getEligibleCheckInMarkets(service, profile.id)
    const target = eligible.find((e) => e.marketId === marketId)
    if (!target) {
      throw traced.validation('ERR_CHECKIN_002',
        "You can't check in to this market right now. Check-in is available on a market day at a market you're associated with.")
    }

    const lat = typeof body.latitude === 'number' ? body.latitude : null
    const lng = typeof body.longitude === 'number' ? body.longitude : null
    const accuracy = typeof body.accuracy === 'number' ? body.accuracy : null

    if (action === 'checkout') {
      crumb.supabase('update', 'market_day_checkins')
      const { error: updErr } = await service
        .from('market_day_checkins')
        .update({
          checked_out_at: new Date().toISOString(),
          ...(lat !== null ? { checkout_latitude: lat } : {}),
          ...(lng !== null ? { checkout_longitude: lng } : {}),
        })
        .eq('vendor_profile_id', profile.id)
        .eq('market_id', marketId)
        .eq('market_date', target.marketDate)
        .is('checked_out_at', null)
      if (updErr) throw traced.fromSupabase(updErr, { table: 'market_day_checkins', operation: 'update' })
      return NextResponse.json({ ok: true, action: 'checkout' })
    }

    // check-in: compute advisory distance/geofence if we have both ends
    let distance: number | null = null
    let withinGeofence: boolean | null = null
    if (lat !== null && lng !== null && target.latitude !== null && target.longitude !== null) {
      distance = Math.round(metersBetween(lat, lng, target.latitude, target.longitude))
      withinGeofence = distance <= CHECKIN_GEOFENCE_RADIUS_M
    }

    crumb.supabase('insert', 'market_day_checkins')
    const { error: insErr } = await service
      .from('market_day_checkins')
      .insert({
        market_id: marketId,
        vendor_profile_id: profile.id,
        market_date: target.marketDate,
        method: lat !== null && lng !== null ? 'geolocation' : 'self_attest',
        self_attested: true,
        attestation_text: CHECKIN_ATTESTATION_TEXT,
        attestation_version: CHECKIN_ATTESTATION_VERSION,
        booth_number: target.boothNumber,
        captured_latitude: lat,
        captured_longitude: lng,
        location_accuracy_m: accuracy,
        distance_from_market_m: distance,
        within_geofence: withinGeofence,
      })

    // 23505 = already checked in today → idempotent success
    if (insErr && insErr.code !== '23505') {
      throw traced.fromSupabase(insErr, { table: 'market_day_checkins', operation: 'insert' })
    }
    return NextResponse.json({ ok: true, action: 'checkin', alreadyCheckedIn: insErr?.code === '23505' })
  })
}
