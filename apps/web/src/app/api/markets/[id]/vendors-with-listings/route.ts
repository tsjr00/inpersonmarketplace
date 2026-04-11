import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getMarketVendorsWithListings } from '@/lib/markets/vendors-with-listings'

// GET /api/markets/[id]/vendors-with-listings
// Returns vendors with published listings at this market.
// Session 70: the query + filter logic lives in src/lib/markets/vendors-with-listings.ts
// so the server-rendered market detail page can call it directly (avoiding a
// self-HTTP fetch that gets blocked by Vercel Deployment Protection on previews).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/markets/[id]/vendors-with-listings', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`market-vendors-listings:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { id: marketId } = await params

    const result = await getMarketVendorsWithListings(supabase, marketId)

    if (result.reason === 'not_found') {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    if (result.reason === 'not_active') {
      return NextResponse.json({ error: 'Market is not active' }, { status: 400 })
    }

    if (result.reason === 'query_error') {
      return NextResponse.json(
        { error: result.errorMessage || 'Failed to fetch vendors' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        market: result.market,
        vendors: result.vendors,
        categories: result.categories,
        vendor_count: result.vendor_count,
      },
      {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
      }
    )
  })
}
