import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors/with-error-tracing'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET /api/event-approved-vendors?vertical=food_trucks&q=taco
 *
 * Public endpoint for event request form — returns event-approved vendors
 * with summary data for the type-ahead search widget.
 *
 * Only returns: id, business_name, cuisine_categories, avg_price, rating, lead_time.
 * No sensitive data exposed (no contact info, no financial details).
 *
 * Query params:
 *   vertical (required): food_trucks or farmers_market
 *   q (optional): search term to filter by business name
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/event-approved-vendors', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-vendor-search:${clientIp}`, { limit: 30, windowSeconds: 60 })
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const vertical = request.nextUrl.searchParams.get('vertical')
    const searchTerm = request.nextUrl.searchParams.get('q') || ''

    if (!vertical || !['food_trucks', 'farmers_market'].includes(vertical)) {
      return NextResponse.json({ error: 'vertical is required' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    // Get event-approved vendors for this vertical
    const { data: vendors } = await serviceClient
      .from('vendor_profiles')
      .select('id, profile_data, average_rating, rating_count, tier, pickup_lead_minutes, profile_image_url')
      .eq('vertical_id', vertical)
      .eq('status', 'approved')
      .eq('event_approved', true)

    if (!vendors || vendors.length === 0) {
      return NextResponse.json({ vendors: [] })
    }

    // Get listing categories + catering item count per vendor
    const vendorIds = vendors.map(v => v.id)
    const { data: listings } = await serviceClient
      .from('listings')
      .select('vendor_profile_id, category, price_cents, listing_data')
      .in('vendor_profile_id', vendorIds)
      .eq('status', 'published')
      .is('deleted_at', null)

    const vendorCategories: Record<string, Set<string>> = {}
    const vendorPrices: Record<string, number[]> = {}
    const vendorCateringCount: Record<string, number> = {}

    if (listings) {
      for (const l of listings) {
        const vid = l.vendor_profile_id as string
        if (!vendorCategories[vid]) vendorCategories[vid] = new Set()
        if (!vendorPrices[vid]) vendorPrices[vid] = []
        if (!vendorCateringCount[vid]) vendorCateringCount[vid] = 0

        if (l.category) vendorCategories[vid].add(l.category as string)
        if (l.price_cents) vendorPrices[vid].push(l.price_cents as number)
        const ld = l.listing_data as Record<string, unknown> | null
        if (ld?.event_menu_item) vendorCateringCount[vid]++
      }
    }

    // Build vendor summaries
    let results = vendors
      .filter(v => vendorCateringCount[v.id] >= 4) // Must have ≥4 catering items
      .map(v => {
        const pd = v.profile_data as Record<string, unknown>
        const name = (pd?.business_name as string) || (pd?.farm_name as string) || 'Vendor'
        const prices = vendorPrices[v.id] || []
        const avgPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null

        return {
          id: v.id,
          business_name: name,
          cuisine_categories: Array.from(vendorCategories[v.id] || []),
          avg_price_cents: avgPrice,
          average_rating: v.average_rating as number | null,
          rating_count: (v.rating_count || 0) as number,
          tier: (v.tier || 'free') as string,
          pickup_lead_minutes: (v.pickup_lead_minutes || 30) as number,
          catering_item_count: vendorCateringCount[v.id] || 0,
          profile_image_url: v.profile_image_url as string | null,
        }
      })

    // Filter by search term if provided
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      results = results.filter(v =>
        v.business_name.toLowerCase().includes(q) ||
        v.cuisine_categories.some(c => c.toLowerCase().includes(q))
      )
    }

    // Sort: by rating (highest first), then by name
    results.sort((a, b) => {
      const rA = a.average_rating || 0
      const rB = b.average_rating || 0
      if (rB !== rA) return rB - rA
      return a.business_name.localeCompare(b.business_name)
    })

    return NextResponse.json({ vendors: results })
  })
}
