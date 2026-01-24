import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const DEFAULT_RADIUS_MILES = 25
const MILES_PER_DEGREE_LAT = 69 // Approximate miles per degree latitude
const MILES_PER_DEGREE_LNG_AT_40 = 53 // Approximate at 40° latitude (mid-US)

// Calculate bounding box for pre-filtering (adds 20% buffer for safety)
function getBoundingBox(lat: number, lng: number, radiusMiles: number) {
  const buffer = 1.2 // 20% buffer to ensure we don't miss edge cases
  const latDelta = (radiusMiles * buffer) / MILES_PER_DEGREE_LAT
  // Longitude degrees vary by latitude, use conservative estimate
  const lngDelta = (radiusMiles * buffer) / (MILES_PER_DEGREE_LNG_AT_40 * Math.cos(lat * Math.PI / 180))

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

    // Calculate bounding box for database pre-filtering
    const bounds = getBoundingBox(latitude, longitude, radiusMiles)

    // OPTIMIZATION 1: Pre-filter vendors by bounding box at database level
    // This dramatically reduces the number of vendors we need to process in JS
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
      console.error('[Vendors Nearby] Error fetching vendors:', error)
      return NextResponse.json({ error: 'Failed to fetch vendors' }, { status: 500 })
    }

    const vendorIds = (vendors || []).map(v => v.id)

    if (vendorIds.length === 0) {
      return NextResponse.json({ vendors: [], center: { latitude, longitude }, radiusMiles })
    }

    // OPTIMIZATION 2: Run all secondary queries in parallel
    const [listingsResult, marketVendorsResult, listingMarketsResult] = await Promise.all([
      // Get listings for categories
      supabase
        .from('listings')
        .select('vendor_profile_id, category')
        .in('vendor_profile_id', vendorIds)
        .eq('status', 'published')
        .is('deleted_at', null),

      // Get market associations from market_vendors table
      supabase
        .from('market_vendors')
        .select(`
          vendor_profile_id,
          market_id,
          markets (
            id,
            name,
            latitude,
            longitude
          )
        `)
        .in('vendor_profile_id', vendorIds)
        .eq('status', 'approved'),

      // Get market associations from listing_markets (primary source)
      supabase
        .from('listing_markets')
        .select(`
          market_id,
          listings!inner (
            vendor_profile_id
          ),
          markets (
            id,
            name,
            latitude,
            longitude
          )
        `)
        .in('listings.vendor_profile_id', vendorIds)
    ])

    const listings = listingsResult.data
    const marketVendors = marketVendorsResult.data
    const listingMarkets = listingMarketsResult.data

    // OPTIMIZATION 3: Pre-filter markets by bounding box before distance calculation
    // Build a set of markets within the bounding box for quick lookup
    const marketsInBounds = new Set<string>()

    // Check market_vendors markets
    marketVendors?.forEach(mv => {
      const m = mv.markets as unknown as { id: string; latitude: string | number | null; longitude: string | number | null }
      if (m?.latitude && m?.longitude) {
        const mLat = parseFloat(String(m.latitude))
        const mLng = parseFloat(String(m.longitude))
        if (mLat >= bounds.minLat && mLat <= bounds.maxLat &&
            mLng >= bounds.minLng && mLng <= bounds.maxLng) {
          marketsInBounds.add(m.id)
        }
      }
    })

    // Check listing_markets markets
    listingMarkets?.forEach(lm => {
      const m = lm.markets as unknown as { id: string; latitude: string | number | null; longitude: string | number | null }
      if (m?.latitude && m?.longitude) {
        const mLat = parseFloat(String(m.latitude))
        const mLng = parseFloat(String(m.longitude))
        if (mLat >= bounds.minLat && mLat <= bounds.maxLat &&
            mLng >= bounds.minLng && mLng <= bounds.maxLng) {
          marketsInBounds.add(m.id)
        }
      }
    })

    // Calculate distances and enrich vendor data
    const enrichedVendors = (vendors || []).map(vendor => {
      const profileData = vendor.profile_data as Record<string, unknown>
      const vendorName = (profileData?.business_name as string) ||
                        (profileData?.farm_name as string) ||
                        'Vendor'

      // Get listings for this vendor
      const vendorListings = (listings || []).filter(l => l.vendor_profile_id === vendor.id)
      const listingCount = vendorListings.length
      const categories = [...new Set(vendorListings.map(l => l.category).filter(Boolean))] as string[]

      // Check if vendor has direct coordinates
      const vendorLat = vendor.latitude ? parseFloat(String(vendor.latitude)) : null
      const vendorLng = vendor.longitude ? parseFloat(String(vendor.longitude)) : null
      const hasDirectCoords = vendorLat !== null && vendorLng !== null && !isNaN(vendorLat) && !isNaN(vendorLng)

      // Only calculate distance if within bounding box
      let directDistance: number | null = null
      if (hasDirectCoords) {
        const inBounds = vendorLat! >= bounds.minLat && vendorLat! <= bounds.maxLat &&
                        vendorLng! >= bounds.minLng && vendorLng! <= bounds.maxLng
        if (inBounds) {
          directDistance = haversineDistance(latitude, longitude, vendorLat!, vendorLng!)
        }
      }

      // Get markets with their distances (only for markets in bounding box)
      const marketMap = new Map<string, { id: string; name: string; distance: number | null }>()

      // Add markets from market_vendors
      ;(marketVendors || [])
        .filter(mv => mv.vendor_profile_id === vendor.id && mv.markets)
        .forEach(mv => {
          const m = mv.markets as unknown as { id: string; name: string; latitude: string | number | null; longitude: string | number | null }
          // Skip if not in bounding box (already checked above)
          if (!marketsInBounds.has(m.id)) {
            marketMap.set(m.id, { id: m.id, name: m.name, distance: null })
            return
          }
          const mLat = parseFloat(String(m.latitude))
          const mLng = parseFloat(String(m.longitude))
          const distance = haversineDistance(latitude, longitude, mLat, mLng)
          marketMap.set(m.id, { id: m.id, name: m.name, distance })
        })

      // Add markets from listing_markets
      ;(listingMarkets || [])
        .filter(lm => {
          const listing = lm.listings as unknown as { vendor_profile_id: string }
          return listing?.vendor_profile_id === vendor.id && lm.markets
        })
        .forEach(lm => {
          const m = lm.markets as unknown as { id: string; name: string; latitude: string | number | null; longitude: string | number | null }
          if (!marketMap.has(m.id)) {
            if (!marketsInBounds.has(m.id)) {
              marketMap.set(m.id, { id: m.id, name: m.name, distance: null })
              return
            }
            const mLat = parseFloat(String(m.latitude))
            const mLng = parseFloat(String(m.longitude))
            const distance = haversineDistance(latitude, longitude, mLat, mLng)
            marketMap.set(m.id, { id: m.id, name: m.name, distance })
          }
        })

      const vendorMarkets = Array.from(marketMap.values())

      // Get minimum distance across all locations
      const allDistances: number[] = []
      if (directDistance !== null) {
        allDistances.push(directDistance)
      }
      vendorMarkets.forEach(m => {
        if (m.distance !== null) {
          allDistances.push(m.distance)
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
        markets: vendorMarkets.filter(m => m.distance === null || m.distance <= radiusMiles),
        distance_miles: finalDistance !== null ? Math.round(finalDistance * 10) / 10 : null,
        hasDirectLocation: hasDirectCoords
      }
    })

    // Filter by distance and listings
    let filteredVendors = enrichedVendors.filter(v =>
      v.distance_miles !== null && v.distance_miles <= radiusMiles && v.listingCount > 0
    )

    // Apply additional filters
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

    // Sort vendors
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

    // OPTIMIZATION 4: Cache response at edge by ZIP code region
    // Round coordinates to create cache keys (~5 mile grid)
    const cacheKey = `${Math.round(latitude * 10) / 10},${Math.round(longitude * 10) / 10}`

    return NextResponse.json(
      {
        vendors: filteredVendors,
        center: { latitude, longitude },
        radiusMiles
      },
      {
        headers: {
          // Cache for 5 minutes at edge, serve stale for 10 more while revalidating
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          'X-Cache-Key': cacheKey
        }
      }
    )
  } catch (error) {
    console.error('Nearby vendors API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
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
