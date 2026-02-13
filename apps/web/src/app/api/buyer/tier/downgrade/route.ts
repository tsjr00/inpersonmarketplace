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

      // Update user profile to standard tier
      // Note: If subscription was cancelled at period end, the webhook will handle final tier change
      // For immediate downgrade, we update now
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          buyer_tier: 'standard',
          stripe_subscription_id: null,
          subscription_status: 'canceled',
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)

      if (updateError) {
        console.error('Error downgrading buyer tier:', updateError)
        return NextResponse.json({ error: 'Failed to downgrade tier' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: 'Successfully downgraded to Standard tier'
      })
    } catch (error) {
      console.error('Buyer downgrade error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  })
}
