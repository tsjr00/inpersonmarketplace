import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/trucks/where-today', 'GET', async () => {
    const supabase = await createClient()
    const sp = request.nextUrl.searchParams
    const lat = parseFloat(sp.get('lat') || '0')
    const lng = parseFloat(sp.get('lng') || '0')
    const radiusMiles = parseInt(sp.get('radius') || '25')
    const dayOffset = parseInt(sp.get('offset') || '0') // 0=today, 1=tomorrow, etc.
    const vertical = sp.get('vertical') || 'food_trucks'

    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() + dayOffset)
    const dayOfWeek = targetDate.getDay() // 0=Sun, 6=Sat

    const { data: schedules } = await supabase
      .from('vendor_market_schedules')
      .select(`
        vendor_start_time,
        vendor_end_time,
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
          market_type,
          start_time,
          end_time
        )
      `)
      .eq('day_of_week', dayOfWeek)
      .eq('active', true)
      .eq('markets.status', 'active')
      .eq('vendor_profiles.status', 'approved')
      .eq('vendor_profiles.vertical_id', vertical)

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({ date: targetDate.toISOString().split('T')[0], day_of_week: dayOfWeek, trucks: [], total: 0 })
    }

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

    const trucks = schedules
      .map(s => {
        const vp = s.vendor_profiles as unknown as { id: string; profile_data: Record<string, unknown>; profile_image_url: string | null }
        const m = s.markets as unknown as { id: string; name: string; address: string; city: string; state: string; zip: string; latitude: number; longitude: number; start_time: string; end_time: string }

        const dist = hasLocation && m.latitude && m.longitude
          ? distanceKm(lat, lng, Number(m.latitude), Number(m.longitude))
          : null

        if (hasLocation && dist !== null && dist > maxDistKm) return null

        return {
          vendor_id: vp.id,
          truck_name: (vp.profile_data?.business_name as string) || (vp.profile_data?.farm_name as string) || 'Vendor',
          profile_image_url: vp.profile_image_url,
          location_name: m.name,
          address: `${m.address}, ${m.city}, ${m.state}${m.zip ? ' ' + m.zip : ''}`,
          city: m.city,
          start_time: s.vendor_start_time || m.start_time,
          end_time: s.vendor_end_time || m.end_time,
          distance_miles: dist ? Math.round(dist / 1.609 * 10) / 10 : null,
          market_id: m.id,
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a!.distance_miles !== null && b!.distance_miles !== null) return a!.distance_miles - b!.distance_miles
        return (a!.start_time || '').localeCompare(b!.start_time || '')
      })

    return NextResponse.json({
      date: targetDate.toISOString().split('T')[0],
      day_of_week: dayOfWeek,
      trucks,
      total: trucks.length,
    })
  })
}
