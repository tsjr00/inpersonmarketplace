import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const DEFAULT_RADIUS_MILES = 25

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

    // Get all approved vendors for this vertical
    let query = supabase
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
      .eq('status', 'approved')

    if (vertical) {
      query = query.eq('vertical_id', vertical)
    }

    const { data: vendors, error } = await query

    if (error) {
      console.error('Error fetching vendors:', error)
      return NextResponse.json({ error: 'Failed to fetch vendors' }, { status: 500 })
    }

    const vendorIds = (vendors || []).map(v => v.id)

    if (vendorIds.length === 0) {
      return NextResponse.json({ vendors: [], center: { latitude, longitude }, radiusMiles })
    }

    // Get listings for categories
    const { data: listings } = await supabase
      .from('listings')
      .select('vendor_profile_id, category')
      .in('vendor_profile_id', vendorIds)
      .eq('status', 'published')
      .is('deleted_at', null)

    // Get market associations with locations
    const { data: marketVendors } = await supabase
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
      .eq('status', 'approved')

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

      // Get markets with their distances
      const vendorMarkets = (marketVendors || [])
        .filter(mv => mv.vendor_profile_id === vendor.id && mv.markets)
        .map(mv => {
          const m = mv.markets as unknown as { id: string; name: string; latitude: string | number | null; longitude: string | number | null }
          // Parse lat/lng - DECIMAL types from PostgreSQL can come back as strings
          const mLat = m.latitude ? parseFloat(String(m.latitude)) : null
          const mLng = m.longitude ? parseFloat(String(m.longitude)) : null
          const distance = (mLat && mLng && !isNaN(mLat) && !isNaN(mLng))
            ? haversineDistance(latitude, longitude, mLat, mLng)
            : null
          return { id: m.id, name: m.name, distance }
        })

      // Get minimum distance to any of vendor's markets
      const distances = vendorMarkets
        .map(m => m.distance)
        .filter((d): d is number => d !== null)
      const minDistance = distances.length > 0 ? Math.min(...distances) : null

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
        distance_miles: minDistance !== null ? Math.round(minDistance * 10) / 10 : null
      }
    })

    // Filter by distance (vendors with at least one market within radius)
    // Also exclude vendors with no active listings (they have nothing to sell)
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
      // Premium/featured vendors first
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

    return NextResponse.json({
      vendors: filteredVendors,
      center: { latitude, longitude },
      radiusMiles
    })
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
