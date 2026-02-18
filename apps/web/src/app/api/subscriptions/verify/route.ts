import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/config'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/subscriptions/verify', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`subscriptions-verify:${clientIp}`, rateLimits.auth)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
    }

    const sessionId = request.nextUrl.searchParams.get('session_id')

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId)

      // Verify this is a subscription checkout
      if (session.mode !== 'subscription') {
        return NextResponse.json({ error: 'Invalid session type' }, { status: 400 })
      }

      // Get metadata
      const type = session.metadata?.type as 'vendor' | 'buyer' | 'food_truck_vendor' | undefined
      const cycle = session.metadata?.cycle
      const tier = session.metadata?.tier || null
      const vertical = session.metadata?.vertical || null

      return NextResponse.json({
        success: true,
        type: type || null,
        cycle: cycle || null,
        tier,
        vertical,
        subscriptionId: session.subscription,
        customerId: session.customer,
      })
    } catch (error) {
      console.error('[subscription-verify] Error:', error)
      return NextResponse.json(
        { error: 'Failed to verify session' },
        { status: 500 }
      )
    }
  })
}
