import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe, SUBSCRIPTION_PRICES, areSubscriptionPricesConfigured } from '@/lib/stripe/config'

export async function POST(request: NextRequest) {
  // Check if Stripe is configured
  if (!stripe) {
    return NextResponse.json(
      { error: 'Stripe is not configured' },
      { status: 500 }
    )
  }

  // Check if subscription prices are configured
  if (!areSubscriptionPricesConfigured()) {
    return NextResponse.json(
      { error: 'Subscription prices are not configured. Please contact support.' },
      { status: 500 }
    )
  }

  const supabase = await createClient()

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { type, cycle, vertical } = body as {
      type: 'vendor' | 'buyer'
      cycle: 'monthly' | 'annual'
      vertical?: string
    }

    // Validate input
    if (!type || !['vendor', 'buyer'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid subscription type. Must be "vendor" or "buyer".' },
        { status: 400 }
      )
    }

    if (!cycle || !['monthly', 'annual'].includes(cycle)) {
      return NextResponse.json(
        { error: 'Invalid billing cycle. Must be "monthly" or "annual".' },
        { status: 400 }
      )
    }

    // Get the appropriate price ID
    const priceConfig = SUBSCRIPTION_PRICES[type][cycle]
    if (!priceConfig.priceId) {
      return NextResponse.json(
        { error: `${type} ${cycle} subscription is not available.` },
        { status: 400 }
      )
    }

    // Get or create Stripe Customer
    let stripeCustomerId: string | null = null
    let userEmail = user.email

    if (type === 'vendor') {
      // Get vendor profile
      const { data: vendorProfile, error: vendorError } = await supabase
        .from('vendor_profiles')
        .select('id, stripe_customer_id, tier, profile_data')
        .eq('user_id', user.id)
        .single()

      if (vendorError || !vendorProfile) {
        return NextResponse.json(
          { error: 'Vendor profile not found. Please complete vendor registration first.' },
          { status: 400 }
        )
      }

      // Check if already premium
      if (vendorProfile.tier === 'premium') {
        return NextResponse.json(
          { error: 'You already have a premium subscription.' },
          { status: 400 }
        )
      }

      stripeCustomerId = vendorProfile.stripe_customer_id

      // Get business name for Stripe customer
      const profileData = vendorProfile.profile_data as Record<string, unknown>
      const businessName = (profileData?.business_name as string) || (profileData?.farm_name as string)

      // Create Stripe customer if needed
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: userEmail,
          name: businessName || undefined,
          metadata: {
            user_id: user.id,
            vendor_profile_id: vendorProfile.id,
            type: 'vendor',
          },
        })
        stripeCustomerId = customer.id

        // Save customer ID to vendor profile
        await supabase
          .from('vendor_profiles')
          .update({ stripe_customer_id: stripeCustomerId })
          .eq('id', vendorProfile.id)
      }
    } else {
      // Buyer subscription
      const { data: userProfile, error: userError } = await supabase
        .from('user_profiles')
        .select('user_id, stripe_customer_id, buyer_tier, display_name')
        .eq('user_id', user.id)
        .single()

      if (userError || !userProfile) {
        return NextResponse.json(
          { error: 'User profile not found.' },
          { status: 400 }
        )
      }

      // Check if already premium
      if (userProfile.buyer_tier === 'premium') {
        return NextResponse.json(
          { error: 'You already have a premium membership.' },
          { status: 400 }
        )
      }

      stripeCustomerId = userProfile.stripe_customer_id

      // Create Stripe customer if needed
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: userEmail,
          name: userProfile.display_name || undefined,
          metadata: {
            user_id: user.id,
            type: 'buyer',
          },
        })
        stripeCustomerId = customer.id

        // Save customer ID to user profile
        await supabase
          .from('user_profiles')
          .update({ stripe_customer_id: stripeCustomerId })
          .eq('user_id', user.id)
      }
    }

    // Build success and cancel URLs
    const baseUrl = request.nextUrl.origin
    const verticalPrefix = vertical ? `/${vertical}` : ''
    const successUrl = `${baseUrl}${verticalPrefix}/subscription/success?session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = type === 'vendor'
      ? `${baseUrl}${verticalPrefix}/vendor/dashboard/upgrade`
      : `${baseUrl}${verticalPrefix}/buyer/upgrade`

    // Create Stripe Checkout Session for subscription
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceConfig.priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        metadata: {
          user_id: user.id,
          type: type,
          cycle: cycle,
        },
      },
      metadata: {
        user_id: user.id,
        type: type,
        cycle: cycle,
      },
      allow_promotion_codes: true,
    })

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    })
  } catch (error) {
    console.error('[subscription-checkout] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
