import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/trucks/where-today', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`trucks-where-today:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const sp = request.nextUrl.searchParams
    const lat = parseFloat(sp.get('lat') || '0')
    const lng = parseFloat(sp.get('lng') || '0')
    const radiusMiles = parseInt(sp.get('radius') || '25')
    const dayOffset = parseInt(sp.get('offset') || '0')
    const vertical = sp.get('vertical') || 'food_trucks'

    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() + dayOffset)
    const dayOfWeek = targetDate.getDay()

    // Query vendor_market_schedules joined to market_schedules (has day_of_week)
    const { data: schedules } = await supabase
      .from('vendor_market_schedules')
      .select(`
        vendor_start_time,
        vendor_end_time,
        is_active,
        vendor_profiles!inner (
          id,
          profile_data,
          profile_image_url,
          status,
          vertical_id
        ),
        markets!inner (
          id,
          name,
          address,
          city,
          state,
          zip,
          latitude,
          longitude,
          status,
          start_time,
          end_time
        ),
        market_schedules:schedule_id (
          day_of_week,
          start_time,
          end_time,
          active
        )
      `)
      .eq('is_active', true)
      .eq('markets.status', 'active')
      .eq('vendor_profiles.status', 'approved')
      .eq('vendor_profiles.vertical_id', vertical)

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({ date: targetDate.toISOString().split('T')[0], day_of_week: dayOfWeek, trucks: [], total: 0 })
    }

    // Filter by day_of_week from the joined schedule
    const todaySchedules = schedules.filter(s => {
      const sched = s.market_schedules as unknown as { day_of_week: number; active: boolean } | null
      if (!sched) return false
      return sched.day_of_week === dayOfWeek && sched.active !== false
    })

    // Distance filter
    const distanceKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
      const R = 6371
      const dLat = (lat2 - lat1) * Math.PI / 180
      const dLng = (lng2 - lng1) * Math.PI / 180
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }

    const hasLocation = lat !== 0 && lng !== 0
    const maxDistKm = radiusMiles * 1.609

    const trucks = todaySchedules
      .map(s => {
        const vp = s.vendor_profiles as unknown as { id: string; profile_data: Record<string, unknown>; profile_image_url: string | null }
        const m = s.markets as unknown as { id: string; name: string; address: string; city: string; state: string; zip: string; latitude: number; longitude: number; start_time: string; end_time: string }
        const sched = s.market_schedules as unknown as { start_time: string; end_time: string } | null

        const dist = hasLocation && m.latitude && m.longitude
          ? distanceKm(lat, lng, Number(m.latitude), Number(m.longitude))
          : null

        if (hasLocation && dist !== null && dist > maxDistKm) return null

        return {
          vendor_id: vp.id,
          truck_name: (vp.profile_data?.business_name as string) || (vp.profile_data?.farm_name as string) || 'Vendor',
          profile_image_url: vp.profile_image_url,
          location_name: m.name,
          address: [m.address, m.city, m.state].filter(Boolean).join(', ') + (m.zip ? ' ' + m.zip : ''),
          city: m.city,
          start_time: s.vendor_start_time || sched?.start_time || m.start_time,
          end_time: s.vendor_end_time || sched?.end_time || m.end_time,
          distance_miles: dist ? Math.round(dist / 1.609 * 10) / 10 : null,
          market_id: m.id,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    type TruckEntry = typeof trucks[number]

    // Sort: group by vendor, earliest start_time first within each vendor,
    // then order vendor groups by their earliest start_time
    const vendorGroups = new Map<string, TruckEntry[]>()
    for (const t of trucks) {
      const group = vendorGroups.get(t.vendor_id) || []
      group.push(t)
      vendorGroups.set(t.vendor_id, group)
    }
    // Sort within each group by start_time
    for (const group of vendorGroups.values()) {
      group.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
    }
    // Sort groups by earliest start_time of first entry
    const sortedGroups = [...vendorGroups.values()].sort((a, b) =>
      (a[0].start_time || '').localeCompare(b[0].start_time || '')
    )
    const sortedTrucks = sortedGroups.flat()

    return NextResponse.json({
      date: targetDate.toISOString().split('T')[0],
      day_of_week: dayOfWeek,
      trucks: sortedTrucks,
      total: sortedTrucks.length,
    })
  })
}
