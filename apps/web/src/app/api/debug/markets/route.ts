import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

// Haversine formula for distance between two points
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959 // Earth's radius in miles
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}

// Debug endpoint to check market data - remove after debugging
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const searchParams = request.nextUrl.searchParams
    const vertical = searchParams.get('vertical') || 'farmers_market'

    // Get user's saved location
    let savedLocation = null
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('latitude, longitude, location_text')
        .eq('user_id', user.id)
        .single()
      if (profile?.latitude && profile?.longitude) {
        savedLocation = {
          source: 'user_profile',
          lat: profile.latitude,
          lng: profile.longitude,
          text: profile.location_text
        }
      }
    }

    if (!savedLocation) {
      const cookieStore = await cookies()
      const lat = cookieStore.get('buyer_lat')?.value
      const lng = cookieStore.get('buyer_lng')?.value
      const text = cookieStore.get('buyer_location_text')?.value
      if (lat && lng) {
        savedLocation = {
          source: 'cookie',
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          text
        }
      }
    }

    // Get ALL markets for this vertical (no filters)
    const { data: allMarkets, error: allError } = await supabase
      .from('markets')
      .select('id, name, market_type, status, approval_status, latitude, longitude, vertical_id')
      .eq('vertical_id', vertical)

    if (allError) {
      return NextResponse.json({ error: 'Failed to fetch markets', details: allError }, { status: 500 })
    }

    // Get traditional markets with all required fields
    const { data: traditionalMarkets, error: tradError } = await supabase
      .from('markets')
      .select('id, name, market_type, status, approval_status, latitude, longitude, vertical_id')
      .eq('vertical_id', vertical)
      .eq('market_type', 'traditional')

    // Get markets that WOULD match the nearby query filters
    const { data: filteredMarkets, error: filtError } = await supabase
      .from('markets')
      .select('id, name, market_type, status, approval_status, latitude, longitude, vertical_id')
      .eq('vertical_id', vertical)
      .eq('market_type', 'traditional')
      .eq('status', 'active')
      .eq('approval_status', 'approved')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)

    // Calculate distances if we have saved location
    const marketsWithDistance = filteredMarkets?.map(m => {
      if (savedLocation && m.latitude && m.longitude) {
        const distance = haversineDistance(
          savedLocation.lat,
          savedLocation.lng,
          parseFloat(m.latitude),
          parseFloat(m.longitude)
        )
        return { ...m, distance_miles: Math.round(distance * 100) / 100 }
      }
      return { ...m, distance_miles: null }
    })

    return NextResponse.json({
      saved_location: savedLocation,
      summary: {
        total_markets_in_vertical: allMarkets?.length || 0,
        traditional_markets: traditionalMarkets?.length || 0,
        markets_matching_nearby_filters: filteredMarkets?.length || 0,
      },
      all_markets: allMarkets?.map(m => ({
        id: m.id,
        name: m.name,
        market_type: m.market_type,
        status: m.status,
        approval_status: m.approval_status,
        has_lat: m.latitude !== null,
        has_lng: m.longitude !== null,
        lat: m.latitude,
        lng: m.longitude,
        issues: [
          m.status !== 'active' ? `status=${m.status}` : null,
          m.approval_status !== 'approved' ? `approval_status=${m.approval_status}` : null,
          m.latitude === null ? 'missing latitude' : null,
          m.longitude === null ? 'missing longitude' : null,
          m.market_type !== 'traditional' ? `market_type=${m.market_type}` : null,
        ].filter(Boolean)
      })),
      markets_ready_for_search_with_distance: marketsWithDistance,
    })
  } catch (error) {
    console.error('Debug markets error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
