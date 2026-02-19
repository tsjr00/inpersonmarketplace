import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/config'
import { createServiceClient } from '@/lib/supabase/server'
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
      const userId = session.metadata?.user_id
      const subscriptionId = session.subscription as string | null

      // Fallback tier activation: if session is paid, ensure DB is updated
      // This is idempotent — safe to run even if the webhook already fired
      if (session.payment_status === 'paid' && userId && subscriptionId) {
        const supabase = createServiceClient()

        // Retrieve subscription from Stripe for period end date
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const currentPeriodEnd = new Date((subscription as any).current_period_end * 1000).toISOString()

        if (type === 'vendor' || type === 'food_truck_vendor') {
          const targetTier = tier || 'premium'

          let vpQuery = supabase
            .from('vendor_profiles')
            .update({
              tier: targetTier,
              stripe_subscription_id: subscriptionId,
              subscription_status: 'active',
              subscription_cycle: cycle || 'monthly',
              tier_started_at: new Date().toISOString(),
              tier_expires_at: currentPeriodEnd,
            })
            .eq('user_id', userId)
          if (vertical) {
            vpQuery = vpQuery.eq('vertical_id', vertical)
          }
          await vpQuery
        } else if (type === 'buyer') {
          await supabase
            .from('user_profiles')
            .update({
              buyer_tier: 'premium',
              stripe_subscription_id: subscriptionId,
              subscription_status: 'active',
              subscription_cycle: cycle || 'monthly',
              tier_started_at: new Date().toISOString(),
              tier_expires_at: currentPeriodEnd,
            })
            .eq('user_id', userId)
        }
      }

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
