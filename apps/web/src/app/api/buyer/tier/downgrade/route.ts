import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/config'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/buyer/tier/downgrade', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`buyer-tier-downgrade:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    try {
      const supabase = await createClient()

      // Check auth
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // Get user profile with subscription info
      const { data: userProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, user_id, buyer_tier, stripe_subscription_id')
        .eq('user_id', user.id)
        .single()

      if (profileError || !userProfile) {
        return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
      }

      // Check if already standard
      if (!userProfile.buyer_tier || userProfile.buyer_tier === 'standard') {
        return NextResponse.json({ error: 'Already on Standard tier' }, { status: 400 })
      }

      // Cancel Stripe subscription if active
      if (userProfile.stripe_subscription_id && stripe) {
        try {
          // Cancel at period end (user keeps premium until billing period ends)
          await stripe.subscriptions.update(userProfile.stripe_subscription_id, {
            cancel_at_period_end: true
          })
          console.log(`[buyer-downgrade] Cancelled subscription ${userProfile.stripe_subscription_id} for user ${user.id}`)
        } catch (stripeError) {
          console.error('Error cancelling Stripe subscription:', stripeError)
          // Continue with downgrade even if Stripe fails
        }
      }

      // H16 FIX: Don't downgrade DB tier immediately — keep access until billing period ends.
      // Mark subscription as canceling so UI can show "expires on [date]".
      // The actual tier downgrade happens in handleSubscriptionDeleted webhook
      // when Stripe fires customer.subscription.deleted at period end.
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          subscription_status: 'canceling',
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)

      if (updateError) {
        console.error('Error updating buyer subscription status:', updateError)
        return NextResponse.json({ error: 'Failed to process downgrade' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: 'Your subscription will be cancelled at the end of your billing period. You will keep premium access until then.'
      })
    } catch (error) {
      console.error('Buyer downgrade error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  })
}
