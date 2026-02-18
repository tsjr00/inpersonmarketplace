import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getTierSortPriority } from '@/lib/vendor-limits'

const DEFAULT_RADIUS_MILES = 25
const DEFAULT_PAGE_SIZE = 35
const METERS_PER_MILE = 1609.344

// Haversine formula for distance between two points in miles
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
  return withErrorTracing('/api/vendors/nearby', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendors-nearby:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    try {
      const supabase = await createClient()

      const searchParams = request.nextUrl.searchParams
      const lat = searchParams.get('lat')
      const lng = searchParams.get('lng')
      const vertical = searchParams.get('vertical')
      const radiusMiles = parseFloat(searchParams.get('radius') || String(DEFAULT_RADIUS_MILES))
      const limit = parseInt(searchParams.get('limit') || String(DEFAULT_PAGE_SIZE), 10)
      const offset = parseInt(searchParams.get('offset') || '0', 10)
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

      // Convert miles to meters for PostGIS function
      const radiusMeters = radiusMiles * METERS_PER_MILE

      // STEP 1: Use PostGIS function for efficient geographic query
      // This does the distance calculation at the database level
      const { data: nearbyVendors, error: postgisError } = await supabase.rpc(
        'get_vendors_within_radius',
        {
          user_lat: latitude,
          user_lng: longitude,
          radius_meters: radiusMeters,
          vertical_filter: vertical || null
        }
      )

      // If PostGIS function fails (e.g., not available), fall back to cache-based method
      if (postgisError) {
        console.log('[Vendors Nearby] PostGIS function failed, using fallback:', postgisError.message)
        return await fallbackNearbyQuery(supabase, latitude, longitude, radiusMiles, limit, offset, vertical, market, category, search, sort)
      }

      if (!nearbyVendors || nearbyVendors.length === 0) {
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

      // Get vendor IDs from PostGIS results
      const vendorIds = nearbyVendors.map((v: { id: string }) => v.id)

      // Create a map of distances from PostGIS results
      const distanceMap = new Map<string, number>()
      nearbyVendors.forEach((v: { id: string; distance_miles: number }) => {
        distanceMap.set(v.id, v.distance_miles)
      })

      // STEP 2: Fetch additional vendor data in parallel (only for nearby vendors)
      const [vendorProfilesResult, listingsResult, marketsResult] = await Promise.all([
        // Get full vendor profiles with ratings
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
            rating_count
          `)
          .in('id', vendorIds)
          .eq('status', 'approved')
          .is('deleted_at', null),

        // Get listings for categories and counts
        supabase
          .from('listings')
          .select('vendor_profile_id, category')
          .in('vendor_profile_id', vendorIds)
          .eq('status', 'published')
          .is('deleted_at', null),

        // Get market associations with lat/lng for per-market distance calculation
        supabase
          .from('listing_markets')
          .select(`
            listings!inner(vendor_profile_id),
            markets(id, name, market_type, latitude, longitude)
          `)
          .in('listings.vendor_profile_id', vendorIds)
      ])

      const vendorProfiles = vendorProfilesResult.data || []
      const listings = listingsResult.data || []
      const listingMarkets = marketsResult.data || []

      // STEP 3: Enrich vendor data
      const enrichedVendors = vendorProfiles.map(vendor => {
        const profileData = vendor.profile_data as Record<string, unknown>
        const vendorName = (profileData?.business_name as string) ||
                          (profileData?.farm_name as string) ||
                          'Vendor'

        // Get listings for this vendor
        const vendorListings = listings.filter(l => l.vendor_profile_id === vendor.id)
        const listingCount = vendorListings.length
        const categories = [...new Set(vendorListings.map(l => l.category).filter(Boolean))] as string[]

        // Get markets from listing_markets with per-market distance calculation
        const marketMap = new Map<string, { id: string; name: string; market_type: string; distance_miles: number }>()
        listingMarkets
          .filter(lm => {
            const listing = lm.listings as unknown as { vendor_profile_id: string }
            return listing?.vendor_profile_id === vendor.id && lm.markets
          })
          .forEach(lm => {
            const m = lm.markets as unknown as {
              id: string
              name: string
              market_type: string
              latitude: number | null
              longitude: number | null
            }
            if (m && !marketMap.has(m.id)) {
              // Calculate distance from user to this specific market
              let marketDistance = 999 // Default if no coordinates
              if (m.latitude && m.longitude) {
                marketDistance = Math.round(haversineDistance(latitude, longitude, m.latitude, m.longitude) * 10) / 10
              }
              marketMap.set(m.id, {
                id: m.id,
                name: m.name,
                market_type: m.market_type || 'traditional',
                distance_miles: marketDistance
              })
            }
          })

        // Sort markets by distance
        const vendorMarkets = Array.from(marketMap.values()).sort((a, b) => a.distance_miles - b.distance_miles)

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
          distance_miles: distanceMap.get(vendor.id) ?? null
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

      // STEP 5: Sort vendors (always by distance first for location-based queries, then by selected sort within tier)
      filteredVendors.sort((a, b) => {
        // Higher-tier vendors first (works for both FM and FT tiers)
        const aTier = getTierSortPriority(a.tier, vertical || '')
        const bTier = getTierSortPriority(b.tier, vertical || '')
        if (aTier !== bTier) return aTier - bTier

        // Within same tier, sort by distance (closest first for location-based search)
        const distA = a.distance_miles ?? 999
        const distB = b.distance_miles ?? 999
        if (distA !== distB) return distA - distB

        // Then apply secondary sort
        switch (sort) {
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

      // STEP 6: Apply pagination
      const total = filteredVendors.length
      const paginatedVendors = filteredVendors.slice(offset, offset + limit)
      const hasMore = offset + paginatedVendors.length < total

      return NextResponse.json(
        {
          vendors: paginatedVendors,
          total,
          hasMore,
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
  })
}

// Fallback method if PostGIS function doesn't work
async function fallbackNearbyQuery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  latitude: number,
  longitude: number,
  radiusMiles: number,
  limit: number,
  offset: number,
  vertical: string | null,
  market: string | null,
  category: string | null,
  search: string | null,
  sort: string
) {
  // Haversine formula for distance between two points
  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
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

  // Calculate bounding box for database pre-filtering
  const MILES_PER_DEGREE_LAT = 69
  const buffer = 1.2
  const latDelta = (radiusMiles * buffer) / MILES_PER_DEGREE_LAT
  const lngDelta = (radiusMiles * buffer) / (MILES_PER_DEGREE_LAT * Math.cos(latitude * Math.PI / 180))
  const bounds = {
    minLat: latitude - latDelta,
    maxLat: latitude + latDelta,
    minLng: longitude - lngDelta,
    maxLng: longitude + lngDelta
  }

  // Query vendor_location_cache with bounding box
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

  if (locationError || !nearbyLocations) {
    return NextResponse.json({ vendors: [], center: { latitude, longitude }, radiusMiles, fallback: true })
  }

  // Calculate distances and find unique vendors
  const vendorDistances = new Map<string, number>()
  nearbyLocations.forEach(loc => {
    const dist = haversineDistance(
      latitude, longitude,
      parseFloat(String(loc.latitude)),
      parseFloat(String(loc.longitude))
    )
    if (dist <= radiusMiles) {
      const existing = vendorDistances.get(loc.vendor_profile_id)
      if (!existing || dist < existing) {
        vendorDistances.set(loc.vendor_profile_id, dist)
      }
    }
  })

  const vendorIds = Array.from(vendorDistances.keys())
  if (vendorIds.length === 0) {
    return NextResponse.json({ vendors: [], center: { latitude, longitude }, radiusMiles, fallback: true })
  }

  // Fetch vendor details
  const [vendorsResult, listingsResult, marketsResult] = await Promise.all([
    supabase
      .from('vendor_profiles')
      .select('id, profile_data, description, profile_image_url, tier, created_at, average_rating, rating_count')
      .in('id', vendorIds)
      .eq('status', 'approved')
      .is('deleted_at', null),
    supabase
      .from('listings')
      .select('vendor_profile_id, category')
      .in('vendor_profile_id', vendorIds)
      .eq('status', 'published')
      .is('deleted_at', null),
    supabase
      .from('listing_markets')
      .select('listings!inner(vendor_profile_id), markets(id, name, market_type, latitude, longitude)')
      .in('listings.vendor_profile_id', vendorIds)
  ])

  const vendors = vendorsResult.data || []
  const listings = listingsResult.data || []
  const listingMarkets = marketsResult.data || []

  // Enrich and filter
  const enrichedVendors = vendors.map(vendor => {
    const profileData = vendor.profile_data as Record<string, unknown>
    const vendorName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Vendor'
    const vendorListings = listings.filter(l => l.vendor_profile_id === vendor.id)
    const categories = [...new Set(vendorListings.map(l => l.category).filter(Boolean))] as string[]

    const marketMap = new Map<string, { id: string; name: string; market_type: string; distance_miles: number }>()
    listingMarkets
      .filter(lm => {
        const listing = lm.listings as unknown as { vendor_profile_id: string }
        return listing?.vendor_profile_id === vendor.id && lm.markets
      })
      .forEach(lm => {
        const m = lm.markets as unknown as {
          id: string
          name: string
          market_type: string
          latitude: number | null
          longitude: number | null
        }
        if (m && !marketMap.has(m.id)) {
          let marketDistance = 999
          if (m.latitude && m.longitude) {
            marketDistance = Math.round(haversineDistance(latitude, longitude, m.latitude, m.longitude) * 10) / 10
          }
          marketMap.set(m.id, {
            id: m.id,
            name: m.name,
            market_type: m.market_type || 'traditional',
            distance_miles: marketDistance
          })
        }
      })

    return {
      id: vendor.id,
      name: vendorName,
      description: vendor.description as string | null,
      imageUrl: vendor.profile_image_url as string | null,
      tier: (vendor.tier || 'standard') as string,
      createdAt: vendor.created_at,
      averageRating: vendor.average_rating as number | null,
      ratingCount: vendor.rating_count as number | null,
      listingCount: vendorListings.length,
      categories,
      markets: Array.from(marketMap.values()).sort((a, b) => a.distance_miles - b.distance_miles),
      distance_miles: Math.round((vendorDistances.get(vendor.id) ?? 0) * 10) / 10
    }
  })

  let filteredVendors = enrichedVendors.filter(v => v.listingCount > 0)
  if (market) filteredVendors = filteredVendors.filter(v => v.markets.some(m => m.id === market))
  if (category) filteredVendors = filteredVendors.filter(v => v.categories.includes(category))
  if (search) {
    const searchLower = search.toLowerCase()
    filteredVendors = filteredVendors.filter(v =>
      v.name.toLowerCase().includes(searchLower) || v.description?.toLowerCase().includes(searchLower)
    )
  }

  // Sort (always by distance first, then secondary sort)
  filteredVendors.sort((a, b) => {
    // Higher-tier vendors first (works for both FM and FT tiers)
    const aTier = getTierSortPriority(a.tier, vertical || '')
    const bTier = getTierSortPriority(b.tier, vertical || '')
    if (aTier !== bTier) return aTier - bTier

    // Distance first (closest first)
    const distA = a.distance_miles ?? 999
    const distB = b.distance_miles ?? 999
    if (distA !== distB) return distA - distB

    switch (sort) {
      case 'rating':
        if (a.averageRating && !b.averageRating) return -1
        if (!a.averageRating && b.averageRating) return 1
        if (a.averageRating && b.averageRating) return b.averageRating - a.averageRating
        return a.name.localeCompare(b.name)
      default: return 0
    }
  })

  // Apply pagination
  const total = filteredVendors.length
  const paginatedVendors = filteredVendors.slice(offset, offset + limit)
  const hasMore = offset + paginatedVendors.length < total

  return NextResponse.json({
    vendors: paginatedVendors,
    total,
    hasMore,
    center: { latitude, longitude },
    radiusMiles,
    fallback: true
  })
}
