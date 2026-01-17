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
      // If RPC doesn't exist yet, fall back to basic distance calculation
      if (error.message?.includes('function') || error.code === '42883') {
        console.log('PostGIS function not found, using fallback query')
        return await fallbackNearbyQuery(supabase, latitude, longitude, radiusMiles, vertical, type)
      }

      console.error('Nearby markets query error:', error)
      return NextResponse.json({ error: 'Failed to fetch nearby markets' }, { status: 500 })
    }

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
  type: string | null
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
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)

  if (vertical) {
    query = query.eq('vertical_id', vertical)
  }

  if (type) {
    query = query.eq('market_type', type)
  }

  const { data: allMarkets, error } = await query

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch markets' }, { status: 500 })
  }

  // Filter by distance in JavaScript (less efficient but works without PostGIS function)
  const marketsWithDistance = (allMarkets || [])
    .map((market: any) => {
      const distance = haversineDistance(
        latitude, longitude,
        parseFloat(market.latitude), parseFloat(market.longitude)
      )
      return { ...market, distance_miles: Math.round(distance * 10) / 10 }
    })
    .filter((market: any) => market.distance_miles <= radiusMiles)
    .sort((a: any, b: any) => a.distance_miles - b.distance_miles)

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
