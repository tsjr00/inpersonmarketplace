import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe, SUBSCRIPTION_PRICES, areSubscriptionPricesConfigured, getFtPriceConfig, areFtPricesConfigured } from '@/lib/stripe/config'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { isFoodTruckTier } from '@/lib/vendor-limits'

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/subscriptions/checkout', 'POST', async () => {
    // Rate limit subscription checkout requests
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`subscription-checkout:${clientIp}`, { limit: 5, windowSeconds: 60 })

    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    // Check if Stripe is configured
    if (!stripe) {
      return NextResponse.json(
        { error: 'Stripe is not configured' },
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
      const { type, cycle, vertical, tier: requestedTier } = body as {
        type: 'vendor' | 'buyer'
        cycle: 'monthly' | 'annual'
        vertical?: string
        tier?: string // FT tier: 'basic' | 'pro' | 'boss'
      }

      // Validate input
      if (!type || !['vendor', 'buyer'].includes(type)) {
        return NextResponse.json(
          { error: 'Invalid subscription type. Must be "vendor" or "buyer".' },
          { status: 400 }
        )
      }

      // Determine if this is a food truck vendor subscription
      const isFtVendor = type === 'vendor' && vertical === 'food_trucks'

      // FT vendors must specify a tier
      if (isFtVendor) {
        if (requestedTier === 'free') {
          return NextResponse.json(
            { error: 'Free tier does not require checkout. Use the downgrade endpoint.' },
            { status: 400 }
          )
        }
        if (!requestedTier || !isFoodTruckTier(requestedTier)) {
          return NextResponse.json(
            { error: 'Food truck vendors must specify a tier: basic, pro, or boss.' },
            { status: 400 }
          )
        }
        if (!areFtPricesConfigured()) {
          return NextResponse.json(
            { error: 'Food truck subscription prices are not configured. Please contact support.' },
            { status: 500 }
          )
        }
      } else {
        // FM/buyer path: validate cycle
        if (!cycle || !['monthly', 'annual'].includes(cycle)) {
          return NextResponse.json(
            { error: 'Invalid billing cycle. Must be "monthly" or "annual".' },
            { status: 400 }
          )
        }
        if (!areSubscriptionPricesConfigured()) {
          return NextResponse.json(
            { error: 'Subscription prices are not configured. Please contact support.' },
            { status: 500 }
          )
        }
      }

      // Get the appropriate price config
      let priceId: string
      if (isFtVendor && requestedTier) {
        const ftPrice = getFtPriceConfig(requestedTier)
        if (!ftPrice || !ftPrice.priceId) {
          return NextResponse.json(
            { error: `${requestedTier} subscription is not available.` },
            { status: 400 }
          )
        }
        priceId = ftPrice.priceId
      } else {
        const priceConfig = SUBSCRIPTION_PRICES[type][cycle]
        if (!priceConfig.priceId) {
          return NextResponse.json(
            { error: `${type} ${cycle} subscription is not available.` },
            { status: 400 }
          )
        }
        priceId = priceConfig.priceId
      }

      // Get or create Stripe Customer
      let stripeCustomerId: string | null = null
      const userEmail = user.email

      if (type === 'vendor') {
        // Get vendor profile — filter by vertical if provided
        let vpQuery = supabase
          .from('vendor_profiles')
          .select('id, stripe_customer_id, tier, stripe_subscription_id, profile_data, vertical_id')
          .eq('user_id', user.id)
        if (vertical) {
          vpQuery = vpQuery.eq('vertical_id', vertical)
        }
        const { data: vendorProfile, error: vendorError } = await vpQuery.single()

        if (vendorError || !vendorProfile) {
          return NextResponse.json(
            { error: 'Vendor profile not found. Please complete vendor registration first.' },
            { status: 400 }
          )
        }

        if (isFtVendor) {
          // FT: check if already at requested tier
          if (vendorProfile.tier === requestedTier) {
            return NextResponse.json(
              { error: `You are already on the ${requestedTier} plan.` },
              { status: 400 }
            )
          }
          // If upgrading/changing tier and has existing subscription, cancel it first
          if (vendorProfile.stripe_subscription_id) {
            try {
              await stripe.subscriptions.cancel(vendorProfile.stripe_subscription_id)
            } catch (cancelErr) {
              console.warn('[subscription-checkout] Failed to cancel existing subscription:', cancelErr)
              // Continue — may already be canceled
            }
          }
        } else {
          // FM: check if already premium
          if (vendorProfile.tier === 'premium') {
            return NextResponse.json(
              { error: 'You already have a premium subscription.' },
              { status: 400 }
            )
          }
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
              vertical: vertical || '',
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
        // Buyer subscription (unchanged)
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

      // Build metadata — include tier and vertical for webhook processing
      const sessionMetadata: Record<string, string> = {
        user_id: user.id,
        type: isFtVendor ? 'food_truck_vendor' : type,
        cycle: isFtVendor ? 'monthly' : cycle,
      }
      if (requestedTier) sessionMetadata.tier = requestedTier
      if (vertical) sessionMetadata.vertical = vertical

      // Create Stripe Checkout Session for subscription
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        subscription_data: {
          metadata: sessionMetadata,
        },
        metadata: sessionMetadata,
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
  })
}
