import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getEventShopData } from '@/lib/events/shop-data'

/**
 * GET /api/events/[token]/shop
 *
 * Public endpoint — returns event details, vendors, listings (full detail),
 * and schedule info for the event shopping page. No auth required to browse.
 * Prices are included in the response but the client hides them until auth.
 *
 * Session 70: the query logic was extracted to `src/lib/events/shop-data.ts`
 * so the server-component version of the page (`[vertical]/events/[token]/shop/page.tsx`)
 * can call it directly at request time, avoiding the client-side
 * post-hydration fetch waterfall that was the main cause of perceived
 * page slowness. This route now stays as an HTTP wrapper for any client
 * code that still needs to refetch after mutations.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  return withErrorTracing('/api/events/[token]/shop', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-shop:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { token } = await params

    // Optional auth — the shop page is public, but auth state gates
    // price_cents and inventory visibility inside the lib.
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()

    const serviceClient = createServiceClient()
    const result = await getEventShopData(serviceClient, token, user ? { id: user.id } : null)

    if (result.reason === 'not_found') {
      return NextResponse.json(
        { error: 'Event not found or not yet open for pre-orders' },
        { status: 404 }
      )
    }

    // Strip internal debug fields before returning. The public response
    // shape stays identical to pre-Session-70 so the client component
    // contract is unchanged.
    const { reason: _reason, errorMessage: _errorMessage, ...payload } = result
    void _reason
    void _errorMessage

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    })
  })
}
