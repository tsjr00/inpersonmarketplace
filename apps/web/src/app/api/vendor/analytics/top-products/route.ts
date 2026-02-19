import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getFtTierExtras } from '@/lib/vendor-limits'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/analytics/top-products', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-analytics-top-products:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    // Check auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get query params
    const searchParams = request.nextUrl.searchParams
    const vendorId = searchParams.get('vendor_id')
    let startDate = searchParams.get('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0]
    const limit = parseInt(searchParams.get('limit') || '10')

    if (!vendorId) {
      return NextResponse.json({ error: 'vendor_id is required' }, { status: 400 })
    }

    // Verify the user owns this vendor profile
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('id, user_id, tier, vertical_id')
      .eq('id', vendorId)
      .single()

    if (!vendorProfile || vendorProfile.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized to view this vendor analytics' }, { status: 403 })
    }

    // FT tier-based analytics day clamping
    if (vendorProfile.vertical_id === 'food_trucks') {
      const extras = getFtTierExtras(vendorProfile.tier || 'free')
      if (extras.analyticsDays === 0) {
        return NextResponse.json([])
      }
      const earliest = new Date(Date.now() - extras.analyticsDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      if (startDate < earliest) startDate = earliest
    }

    // C7 FIX: Query order_items instead of legacy transactions table
    const { data: orderItems, error } = await supabase
      .from('order_items')
      .select(`
        id,
        listing_id,
        quantity,
        subtotal_cents,
        listing:listings(
          id,
          title,
          listing_images(url, is_primary)
        )
      `)
      .eq('vendor_profile_id', vendorId)
      .in('status', ['fulfilled', 'completed'])
      .gte('created_at', `${startDate}T00:00:00`)
      .lte('created_at', `${endDate}T23:59:59`)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Aggregate by listing
    const productStats: Record<string, {
      listing_id: string
      title: string
      image_url: string | null
      total_sold: number
      revenue: number
    }> = {}

    for (const item of orderItems || []) {
      const listingData = item.listing as unknown
      const listing = Array.isArray(listingData) ? listingData[0] : listingData

      if (!listing) continue

      const typedListing = listing as {
        id: string
        title: string
        listing_images: Array<{ url: string; is_primary: boolean }>
      }

      const listingId = item.listing_id
      if (!productStats[listingId]) {
        const images = typedListing.listing_images || []
        const primaryImage = images.find(img => img.is_primary)
        const imageUrl = primaryImage?.url || images[0]?.url || null

        productStats[listingId] = {
          listing_id: listingId,
          title: typedListing.title || 'Untitled',
          image_url: imageUrl,
          total_sold: 0,
          revenue: 0
        }
      }

      productStats[listingId].total_sold += item.quantity || 1
      productStats[listingId].revenue += item.subtotal_cents || 0
    }

    // Sort by total sold and limit
    const topProducts = Object.values(productStats)
      .sort((a, b) => b.total_sold - a.total_sold)
      .slice(0, limit)

    return NextResponse.json(topProducts)
  })
}
