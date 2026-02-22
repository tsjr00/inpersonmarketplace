import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/config'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/vendor/tier/downgrade', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-tier-downgrade:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    try {
      const supabase = await createClient()

      // Check auth
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { vendorId } = await request.json()

      if (!vendorId) {
        return NextResponse.json({ error: 'Vendor ID is required' }, { status: 400 })
      }

      // Verify this vendor belongs to the authenticated user
      const { data: vendorProfile, error: vendorError } = await supabase
        .from('vendor_profiles')
        .select('id, user_id, tier, stripe_subscription_id')
        .eq('id', vendorId)
        .single()

      if (vendorError || !vendorProfile) {
        return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
      }

      if (vendorProfile.user_id !== user.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }

      // Check if already standard
      if (!vendorProfile.tier || vendorProfile.tier === 'standard') {
        return NextResponse.json({ error: 'Already on Standard tier' }, { status: 400 })
      }

      // Cancel Stripe subscription if active
      if (vendorProfile.stripe_subscription_id && stripe) {
        try {
          // Cancel at period end (user keeps premium until billing period ends)
          await stripe.subscriptions.update(vendorProfile.stripe_subscription_id, {
            cancel_at_period_end: true
          })
          // Subscription set to cancel at period end
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
        .from('vendor_profiles')
        .update({
          subscription_status: 'canceling',
          updated_at: new Date().toISOString()
        })
        .eq('id', vendorId)

      if (updateError) {
        console.error('Error updating vendor subscription status:', updateError)
        return NextResponse.json({ error: 'Failed to process downgrade' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: 'Your subscription will be cancelled at the end of your billing period. You will keep your current tier until then.'
      })
    } catch (error) {
      console.error('Downgrade error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  })
}
