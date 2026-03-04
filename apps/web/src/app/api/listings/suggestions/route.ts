import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/listings/suggestions', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`listing-suggestions:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    try {
      const supabase = await createClient()
      const { vendorIds, excludeIds, marketIds, limit = 4, vertical } = await request.json()

      if (!vendorIds || vendorIds.length === 0) {
        return NextResponse.json({ listings: [] })
      }

      // Fetch published listings from vendors in cart, excluding items already in cart
      // When marketIds is provided, filter to only listings available at those markets
      let query = supabase
        .from('listings')
        .select(`
          id,
          title,
          price_cents,
          image_urls,
          vendor_profile_id,
          vendor_profiles (
            id,
            business_name:profile_data->business_name,
            tier
          ),
          listing_markets!inner (
            market_id
          )
        `)
        .in('vendor_profile_id', vendorIds)
        .eq('status', 'published')
        .eq('vertical_id', vertical)
        .is('deleted_at', null)

      // Filter by marketIds if provided — only show items available at buyer's selected markets
      if (marketIds && marketIds.length > 0) {
        query = query.in('listing_markets.market_id', marketIds)
      }

      const { data: listings, error } = await query.limit(limit * 2) // Get more than needed to filter

      if (error) {
        console.error('Suggestions API error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // Filter out excluded IDs, deduplicate (inner join may return dupes), and limit
      const seen = new Set<string>()
      const filtered = (listings || [])
        .filter(listing => {
          if (excludeIds.includes(listing.id)) return false
          if (seen.has(listing.id)) return false
          seen.add(listing.id)
          return true
        })
        .slice(0, limit)

      return NextResponse.json({ listings: filtered })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error('Suggestions API error:', message)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  })
}
