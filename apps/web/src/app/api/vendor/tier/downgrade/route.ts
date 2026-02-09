import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/config'
import { withErrorTracing } from '@/lib/errors'

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/vendor/tier/downgrade', 'POST', async () => {
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
          console.log(`[downgrade] Cancelled subscription ${vendorProfile.stripe_subscription_id} for vendor ${vendorId}`)
        } catch (stripeError) {
          console.error('Error cancelling Stripe subscription:', stripeError)
          // Continue with downgrade even if Stripe fails
        }
      }

      // Update vendor tier to standard
      // Note: If subscription was cancelled at period end, the webhook will handle final tier change
      // For immediate downgrade, we update now
      const { error: updateError } = await supabase
        .from('vendor_profiles')
        .update({
          tier: 'standard',
          stripe_subscription_id: null,
          subscription_status: 'canceled',
          updated_at: new Date().toISOString()
        })
        .eq('id', vendorId)

      if (updateError) {
        console.error('Error downgrading vendor tier:', updateError)
        return NextResponse.json({ error: 'Failed to downgrade tier' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: 'Successfully downgraded to Standard tier'
      })
    } catch (error) {
      console.error('Downgrade error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  })
}
