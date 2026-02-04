import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMarketVendorCounts } from '@/lib/db/markets'

const MILES_TO_METERS = 1609.344
const DEFAULT_RADIUS_MILES = 25
const DEFAULT_PAGE_SIZE = 35
const MILES_PER_DEGREE_LAT = 69

// Calculate bounding box for pre-filtering
function getBoundingBox(lat: number, lng: number, radiusMiles: number) {
  const buffer = 1.2 // 20% buffer
  const latDelta = (radiusMiles * buffer) / MILES_PER_DEGREE_LAT
  const lngDelta = (radiusMiles * buffer) / (MILES_PER_DEGREE_LAT * Math.cos(lat * Math.PI / 180))

  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const searchParams = request.nextUrl.searchParams
    const lat = searchParams.get('lat')
    const lng = searchParams.get('lng')
    const vertical = searchParams.get('vertical')
    const radiusMiles = parseFloat(searchParams.get('radius') || String(DEFAULT_RADIUS_MILES))
    const limit = parseInt(searchParams.get('limit') || String(DEFAULT_PAGE_SIZE), 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const type = searchParams.get('type')
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

    // Try PostGIS RPC first (fastest)
    const { data: markets, error } = await supabase.rpc('get_markets_within_radius', {
      user_lat: latitude,
      user_lng: longitude,
      radius_meters: radiusMeters,
      vertical_filter: vertical || null,
      market_type_filter: type || null
    })

    if (error) {
      // Fall back to JavaScript-based calculation
      return await fallbackNearbyQuery(supabase, latitude, longitude, radiusMiles, limit, offset, vertical, type, city, search)
    }

    // Apply pagination to PostGIS results (already sorted by distance)
    const allMarkets = markets || []
    const total = allMarkets.length
    const paginatedMarkets = allMarkets.slice(offset, offset + limit)
    const hasMore = offset + paginatedMarkets.length < total

    // Cache key for edge caching
    const cacheKey = `${Math.round(latitude * 10) / 10},${Math.round(longitude * 10) / 10}`

    return NextResponse.json(
      {
        markets: paginatedMarkets,
        total,
        hasMore,
        center: { latitude, longitude },
        radiusMiles
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          'X-Cache-Key': cacheKey
        }
      }
    )
  } catch (error) {
    console.error('Nearby markets API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Fallback with bounding box optimization
async function fallbackNearbyQuery(
  supabase: any,
  latitude: number,
  longitude: number,
  radiusMiles: number,
  limit: number,
  offset: number,
  vertical: string | null,
  type: string | null,
  city: string | null,
  search: string | null
) {
  // Calculate bounding box for database pre-filter
  const bounds = getBoundingBox(latitude, longitude, radiusMiles)

  // OPTIMIZATION: Pre-filter by bounding box at database level
  let query = supabase
    .from('markets')
    .select(`
      *,
      market_schedules(*)
    `)
    .eq('status', 'active')
    .eq('approval_status', 'approved')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .gte('latitude', bounds.minLat)
    .lte('latitude', bounds.maxLat)
    .gte('longitude', bounds.minLng)
    .lte('longitude', bounds.maxLng)

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

  // Calculate exact distances and filter by radius
  const marketsWithDistance = (allMarkets || [])
    .map((market: any) => {
      const mLat = parseFloat(market.latitude)
      const mLng = parseFloat(market.longitude)
      const distance = haversineDistance(latitude, longitude, mLat, mLng)
      return { ...market, distance_miles: Math.round(distance * 10) / 10 }
    })
    .filter((market: any) => market.distance_miles <= radiusMiles)
    .sort((a: any, b: any) => a.distance_miles - b.distance_miles)

  // Fetch vendor counts
  const marketIds = marketsWithDistance.map((m: any) => m.id)
  const vendorCounts = marketIds.length > 0
    ? await getMarketVendorCounts(supabase, marketIds)
    : new Map<string, number>()

  const marketsWithVendorCounts = marketsWithDistance.map((market: any) => ({
    ...market,
    vendor_count: vendorCounts.get(market.id) || 0
  }))

  // Apply pagination
  const total = marketsWithVendorCounts.length
  const paginatedMarkets = marketsWithVendorCounts.slice(offset, offset + limit)
  const hasMore = offset + paginatedMarkets.length < total

  // Cache key for edge caching
  const cacheKey = `${Math.round(latitude * 10) / 10},${Math.round(longitude * 10) / 10}`

  return NextResponse.json(
    {
      markets: paginatedMarkets,
      total,
      hasMore,
      center: { latitude, longitude },
      radiusMiles,
      fallback: true
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'X-Cache-Key': cacheKey
      }
    }
  )
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
