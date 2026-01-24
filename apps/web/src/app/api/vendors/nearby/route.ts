import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const DEFAULT_RADIUS_MILES = 25
const MILES_PER_DEGREE_LAT = 69

// Calculate bounding box for database pre-filtering
function getBoundingBox(lat: number, lng: number, radiusMiles: number) {
  const buffer = 1.2 // 20% buffer for safety
  const latDelta = (radiusMiles * buffer) / MILES_PER_DEGREE_LAT
  const lngDelta = (radiusMiles * buffer) / (MILES_PER_DEGREE_LAT * Math.cos(lat * Math.PI / 180))

  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta
  }
}

// Haversine formula for distance between two points
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959 // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const searchParams = request.nextUrl.searchParams
    const lat = searchParams.get('lat')
    const lng = searchParams.get('lng')
    const vertical = searchParams.get('vertical')
    const radiusMiles = parseFloat(searchParams.get('radius') || String(DEFAULT_RADIUS_MILES))
    const market = searchParams.get('market')
    const category = searchParams.get('category')
    const search = searchParams.get('search')
    const sort = searchParams.get('sort') || 'rating'

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

    // Calculate bounding box
    const bounds = getBoundingBox(latitude, longitude, radiusMiles)

    // STEP 1: Query vendor_location_cache with bounding box filter
    // This is the key optimization - we only get vendors that are potentially nearby
    let locationQuery = supabase
      .from('vendor_location_cache')
      .select('vendor_profile_id, latitude, longitude, source_market_id')
      .gte('latitude', bounds.minLat)
      .lte('latitude', bounds.maxLat)
      .gte('longitude', bounds.minLng)
      .lte('longitude', bounds.maxLng)

    if (vertical) {
      locationQuery = locationQuery.eq('vertical_id', vertical)
    }

    const { data: nearbyLocations, error: locationError } = await locationQuery

    // If location cache doesn't exist yet, fall back to old method
    if (locationError) {
      console.log('[Vendors Nearby] Location cache not available, using fallback')
      return await fallbackNearbyQuery(supabase, latitude, longitude, radiusMiles, vertical, market, category, search, sort)
    }

    // Calculate distances and find unique vendors with their minimum distance
    const vendorDistances = new Map<string, { distance: number; marketIds: Set<string> }>()

    nearbyLocations?.forEach(loc => {
      const dist = haversineDistance(
        latitude, longitude,
        parseFloat(String(loc.latitude)),
        parseFloat(String(loc.longitude))
      )

      if (dist <= radiusMiles) {
        const existing = vendorDistances.get(loc.vendor_profile_id)
        if (!existing) {
          vendorDistances.set(loc.vendor_profile_id, {
            distance: dist,
            marketIds: loc.source_market_id ? new Set([loc.source_market_id]) : new Set()
          })
        } else {
          if (dist < existing.distance) {
            existing.distance = dist
          }
          if (loc.source_market_id) {
            existing.marketIds.add(loc.source_market_id)
          }
        }
      }
    })

    const vendorIds = Array.from(vendorDistances.keys())

    if (vendorIds.length === 0) {
      return NextResponse.json({
        vendors: [],
        center: { latitude, longitude },
        radiusMiles
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
        }
      })
    }

    // STEP 2: Fetch vendor details and listings in parallel (only for nearby vendors)
    const [vendorsResult, listingsResult, marketsResult] = await Promise.all([
      supabase
        .from('vendor_profiles')
        .select(`
          id,
          profile_data,
          description,
          profile_image_url,
          tier,
          created_at,
          average_rating,
          rating_count,
          latitude,
          longitude
        `)
        .in('id', vendorIds)
        .eq('status', 'approved'),

      supabase
        .from('listings')
        .select('vendor_profile_id, category')
        .in('vendor_profile_id', vendorIds)
        .eq('status', 'published')
        .is('deleted_at', null),

      supabase
        .from('listing_markets')
        .select(`
          listings!inner(vendor_profile_id),
          markets(id, name)
        `)
        .in('listings.vendor_profile_id', vendorIds)
    ])

    const vendors = vendorsResult.data || []
    const listings = listingsResult.data || []
    const listingMarkets = marketsResult.data || []

    // STEP 3: Enrich vendor data
    const enrichedVendors = vendors.map(vendor => {
      const profileData = vendor.profile_data as Record<string, unknown>
      const vendorName = (profileData?.business_name as string) ||
                        (profileData?.farm_name as string) ||
                        'Vendor'

      // Get listings for this vendor
      const vendorListings = listings.filter(l => l.vendor_profile_id === vendor.id)
      const listingCount = vendorListings.length
      const categories = [...new Set(vendorListings.map(l => l.category).filter(Boolean))] as string[]

      // Get markets from listing_markets
      const vendorMarketIds = vendorDistances.get(vendor.id)?.marketIds || new Set()
      const marketMap = new Map<string, { id: string; name: string }>()

      listingMarkets
        .filter(lm => {
          const listing = lm.listings as unknown as { vendor_profile_id: string }
          return listing?.vendor_profile_id === vendor.id && lm.markets
        })
        .forEach(lm => {
          const m = lm.markets as unknown as { id: string; name: string }
          if (m && !marketMap.has(m.id)) {
            marketMap.set(m.id, { id: m.id, name: m.name })
          }
        })

      const vendorMarkets = Array.from(marketMap.values())
      const distanceInfo = vendorDistances.get(vendor.id)

      return {
        id: vendor.id,
        name: vendorName,
        description: vendor.description as string | null,
        imageUrl: vendor.profile_image_url as string | null,
        tier: (vendor.tier || 'standard') as string,
        createdAt: vendor.created_at,
        averageRating: vendor.average_rating as number | null,
        ratingCount: vendor.rating_count as number | null,
        listingCount,
        categories,
        markets: vendorMarkets,
        distance_miles: distanceInfo ? Math.round(distanceInfo.distance * 10) / 10 : null,
        hasDirectLocation: vendor.latitude !== null && vendor.longitude !== null
      }
    })

    // STEP 4: Apply additional filters
    let filteredVendors = enrichedVendors.filter(v => v.listingCount > 0)

    if (market) {
      filteredVendors = filteredVendors.filter(v =>
        v.markets.some(m => m.id === market)
      )
    }

    if (category) {
      filteredVendors = filteredVendors.filter(v =>
        v.categories.includes(category)
      )
    }

    if (search) {
      const searchLower = search.toLowerCase()
      filteredVendors = filteredVendors.filter(v =>
        v.name.toLowerCase().includes(searchLower) ||
        (v.description?.toLowerCase().includes(searchLower))
      )
    }

    // STEP 5: Sort vendors
    filteredVendors.sort((a, b) => {
      const tierOrder: Record<string, number> = { featured: 0, premium: 1, standard: 2 }
      const aTier = tierOrder[a.tier] ?? 2
      const bTier = tierOrder[b.tier] ?? 2
      if (aTier !== bTier) return aTier - bTier

      switch (sort) {
        case 'distance':
          return (a.distance_miles ?? 999) - (b.distance_miles ?? 999)
        case 'rating':
          if (a.averageRating && !b.averageRating) return -1
          if (!a.averageRating && b.averageRating) return 1
          if (a.averageRating && b.averageRating) return b.averageRating - a.averageRating
          return a.name.localeCompare(b.name)
        case 'name':
          return a.name.localeCompare(b.name)
        case 'listings':
          return b.listingCount - a.listingCount
        default:
          return 0
      }
    })

    return NextResponse.json(
      {
        vendors: filteredVendors,
        center: { latitude, longitude },
        radiusMiles
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
        }
      }
    )
  } catch (error) {
    console.error('Nearby vendors API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Fallback method if vendor_location_cache doesn't exist
async function fallbackNearbyQuery(
  supabase: any,
  latitude: number,
  longitude: number,
  radiusMiles: number,
  vertical: string | null,
  market: string | null,
  category: string | null,
  search: string | null,
  sort: string
) {
  // Get all approved vendors
  let vendorQuery = supabase
    .from('vendor_profiles')
    .select(`
      id,
      profile_data,
      description,
      profile_image_url,
      tier,
      created_at,
      average_rating,
      rating_count,
      latitude,
      longitude
    `)
    .eq('status', 'approved')

  if (vertical) {
    vendorQuery = vendorQuery.eq('vertical_id', vertical)
  }

  const { data: vendors, error } = await vendorQuery

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch vendors' }, { status: 500 })
  }

  const vendorIds = (vendors || []).map((v: any) => v.id)

  if (vendorIds.length === 0) {
    return NextResponse.json({ vendors: [], center: { latitude, longitude }, radiusMiles })
  }

  // Fetch related data in parallel
  const [listingsResult, listingMarketsResult] = await Promise.all([
    supabase
      .from('listings')
      .select('vendor_profile_id, category')
      .in('vendor_profile_id', vendorIds)
      .eq('status', 'published')
      .is('deleted_at', null),

    supabase
      .from('listing_markets')
      .select(`
        market_id,
        listings!inner(vendor_profile_id),
        markets(id, name, latitude, longitude)
      `)
      .in('listings.vendor_profile_id', vendorIds)
  ])

  const listings = listingsResult.data || []
  const listingMarkets = listingMarketsResult.data || []

  // Calculate distances and enrich
  const enrichedVendors = (vendors || []).map((vendor: any) => {
    const profileData = vendor.profile_data as Record<string, unknown>
    const vendorName = (profileData?.business_name as string) ||
                      (profileData?.farm_name as string) ||
                      'Vendor'

    const vendorListings = listings.filter((l: any) => l.vendor_profile_id === vendor.id)
    const listingCount = vendorListings.length
    const categories = [...new Set(vendorListings.map((l: any) => l.category).filter(Boolean))] as string[]

    // Calculate distances
    const allDistances: number[] = []

    // Direct coordinates
    if (vendor.latitude && vendor.longitude) {
      const dist = haversineDistance(
        latitude, longitude,
        parseFloat(String(vendor.latitude)),
        parseFloat(String(vendor.longitude))
      )
      allDistances.push(dist)
    }

    // Market locations
    const marketMap = new Map<string, { id: string; name: string }>()
    listingMarkets
      .filter((lm: any) => {
        const listing = lm.listings as unknown as { vendor_profile_id: string }
        return listing?.vendor_profile_id === vendor.id && lm.markets
      })
      .forEach((lm: any) => {
        const m = lm.markets as unknown as { id: string; name: string; latitude: any; longitude: any }
        if (m && !marketMap.has(m.id)) {
          marketMap.set(m.id, { id: m.id, name: m.name })
          if (m.latitude && m.longitude) {
            const dist = haversineDistance(
              latitude, longitude,
              parseFloat(String(m.latitude)),
              parseFloat(String(m.longitude))
            )
            allDistances.push(dist)
          }
        }
      })

    const finalDistance = allDistances.length > 0 ? Math.min(...allDistances) : null

    return {
      id: vendor.id,
      name: vendorName,
      description: vendor.description as string | null,
      imageUrl: vendor.profile_image_url as string | null,
      tier: (vendor.tier || 'standard') as string,
      createdAt: vendor.created_at,
      averageRating: vendor.average_rating as number | null,
      ratingCount: vendor.rating_count as number | null,
      listingCount,
      categories,
      markets: Array.from(marketMap.values()),
      distance_miles: finalDistance !== null ? Math.round(finalDistance * 10) / 10 : null,
      hasDirectLocation: vendor.latitude !== null && vendor.longitude !== null
    }
  })

  // Filter and sort
  let filteredVendors = enrichedVendors.filter((v: any) =>
    v.distance_miles !== null && v.distance_miles <= radiusMiles && v.listingCount > 0
  )

  if (market) {
    filteredVendors = filteredVendors.filter((v: any) =>
      v.markets.some((m: any) => m.id === market)
    )
  }

  if (category) {
    filteredVendors = filteredVendors.filter((v: any) =>
      v.categories.includes(category)
    )
  }

  if (search) {
    const searchLower = search.toLowerCase()
    filteredVendors = filteredVendors.filter((v: any) =>
      v.name.toLowerCase().includes(searchLower) ||
      (v.description?.toLowerCase().includes(searchLower))
    )
  }

  filteredVendors.sort((a: any, b: any) => {
    const tierOrder: Record<string, number> = { featured: 0, premium: 1, standard: 2 }
    const aTier = tierOrder[a.tier] ?? 2
    const bTier = tierOrder[b.tier] ?? 2
    if (aTier !== bTier) return aTier - bTier

    switch (sort) {
      case 'distance':
        return (a.distance_miles ?? 999) - (b.distance_miles ?? 999)
      case 'rating':
        if (a.averageRating && !b.averageRating) return -1
        if (!a.averageRating && b.averageRating) return 1
        if (a.averageRating && b.averageRating) return b.averageRating - a.averageRating
        return a.name.localeCompare(b.name)
      default:
        return 0
    }
  })

  return NextResponse.json({
    vendors: filteredVendors,
    center: { latitude, longitude },
    radiusMiles,
    fallback: true
  })
}
