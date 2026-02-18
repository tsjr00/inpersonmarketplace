import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/config'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/vendor/subscription/downgrade-free', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-downgrade-free:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { vertical } = body as { vertical?: string }

    if (vertical !== 'food_trucks') {
      return NextResponse.json({ error: 'Free tier is only available for food truck vendors.' }, { status: 400 })
    }

    // Get vendor profile
    const { data: vendorProfile, error: vendorError } = await supabase
      .from('vendor_profiles')
      .select('id, tier, stripe_subscription_id')
      .eq('user_id', user.id)
      .eq('vertical_id', 'food_trucks')
      .single()

    if (vendorError || !vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found.' }, { status: 404 })
    }

    if (vendorProfile.tier === 'free') {
      return NextResponse.json({ error: 'You are already on the Free plan.' }, { status: 400 })
    }

    // Cancel Stripe subscription if exists
    if (vendorProfile.stripe_subscription_id && stripe) {
      try {
        await stripe.subscriptions.cancel(vendorProfile.stripe_subscription_id)
      } catch (cancelErr) {
        console.warn('[downgrade-free] Failed to cancel Stripe subscription:', cancelErr)
        // Continue — subscription may already be canceled
      }
    }

    // Update vendor profile to free tier
    const { error: updateError } = await supabase
      .from('vendor_profiles')
      .update({
        tier: 'free',
        stripe_subscription_id: null,
        subscription_status: 'canceled',
      })
      .eq('id', vendorProfile.id)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update tier.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, tier: 'free' })
  })
}
