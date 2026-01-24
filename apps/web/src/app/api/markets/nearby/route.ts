import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MILES_TO_METERS = 1609.344
const DEFAULT_RADIUS_MILES = 25

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const searchParams = request.nextUrl.searchParams
    const lat = searchParams.get('lat')
    const lng = searchParams.get('lng')
    const vertical = searchParams.get('vertical')
    const radiusMiles = parseFloat(searchParams.get('radius') || String(DEFAULT_RADIUS_MILES))
    const type = searchParams.get('type') // 'traditional' or 'farm_stand'
    const city = searchParams.get('city')
    const search = searchParams.get('search')

    // Validate required params
    if (!lat || !lng) {
      return NextResponse.json(
        { error: 'Latitude and longitude are required' },
        { status: 400 }
      )
    }

    const latitude = parseFloat(lat)
    const longitude = parseFloat(lng)

    if (isNaN(latitude) || isNaN(longitude)) {
      return NextResponse.json(
        { error: 'Invalid coordinates' },
        { status: 400 }
      )
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return NextResponse.json(
        { error: 'Coordinates out of range' },
        { status: 400 }
      )
    }

    const radiusMeters = radiusMiles * MILES_TO_METERS

    console.log('[Markets Nearby] Request params:', { latitude, longitude, radiusMiles, vertical, type })

    // Use PostGIS ST_DWithin for efficient radius query
    // ST_DWithin uses a geography type for accurate distance calculations in meters
    const { data: markets, error } = await supabase.rpc('get_markets_within_radius', {
      user_lat: latitude,
      user_lng: longitude,
      radius_meters: radiusMeters,
      vertical_filter: vertical || null,
      market_type_filter: type || null
    })

    if (error) {
      // Log the actual error for debugging
      console.error('[Markets Nearby] RPC error:', error.code, error.message, error)

      // Fall back to JavaScript-based distance calculation on ANY RPC error
      // This handles: function not found, PostGIS not installed, permission errors, etc.
      console.log('[Markets Nearby] RPC failed, using fallback query')
      return await fallbackNearbyQuery(supabase, latitude, longitude, radiusMiles, vertical, type, city, search)
    }

    console.log('[Markets Nearby] PostGIS returned', markets?.length || 0, 'markets')

    return NextResponse.json({
      markets: markets || [],
      center: { latitude, longitude },
      radiusMiles
    })
  } catch (error) {
    console.error('Nearby markets API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Fallback if PostGIS function isn't set up yet
async function fallbackNearbyQuery(
  supabase: any,
  latitude: number,
  longitude: number,
  radiusMiles: number,
  vertical: string | null,
  type: string | null,
  city: string | null,
  search: string | null
) {
  // Haversine formula approximation using SQL
  // 3959 is Earth's radius in miles
  let query = supabase
    .from('markets')
    .select(`
      *,
      market_schedules(*),
      market_vendors(count)
    `)
    .eq('status', 'active')
    .eq('approval_status', 'approved')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)

  if (vertical) {
    query = query.eq('vertical_id', vertical)
  }

  if (type) {
    query = query.eq('market_type', type)
  }

  if (city) {
    query = query.ilike('city', `%${city}%`)
  }

  if (search) {
    query = query.ilike('name', `%${search}%`)
  }

  const { data: allMarkets, error } = await query

  if (error) {
    console.error('[Markets Nearby Fallback] Query error:', error)
    return NextResponse.json({ error: 'Failed to fetch markets' }, { status: 500 })
  }

  console.log('[Markets Nearby Fallback] Found', allMarkets?.length || 0, 'markets with coordinates')

  // Log each market's coordinates for debugging
  if (allMarkets && allMarkets.length > 0) {
    allMarkets.forEach((m: any) => {
      console.log(`[Markets Nearby Fallback] Market "${m.name}": lat=${m.latitude}, lng=${m.longitude}`)
    })
  }

  // Filter by distance in JavaScript (less efficient but works without PostGIS function)
  const marketsWithDistance = (allMarkets || [])
    .map((market: any) => {
      const mLat = parseFloat(market.latitude)
      const mLng = parseFloat(market.longitude)
      const distance = haversineDistance(latitude, longitude, mLat, mLng)
      console.log(`[Markets Nearby Fallback] Distance to "${market.name}": ${distance.toFixed(2)} miles`)
      return { ...market, distance_miles: Math.round(distance * 10) / 10 }
    })
    .filter((market: any) => market.distance_miles <= radiusMiles)
    .sort((a: any, b: any) => a.distance_miles - b.distance_miles)

  console.log('[Markets Nearby Fallback] Markets within radius:', marketsWithDistance.length)

  return NextResponse.json({
    markets: marketsWithDistance,
    center: { latitude, longitude },
    radiusMiles,
    fallback: true
  })
}

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
