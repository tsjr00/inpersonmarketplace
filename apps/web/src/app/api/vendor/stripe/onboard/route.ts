import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createConnectAccount, createAccountLink, getAccountStatus } from '@/lib/stripe/connect'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import Stripe from 'stripe'

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/vendor/stripe/onboard', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-stripe-onboard:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // H13 FIX: Add vertical filter for multi-vertical safety
    const vertical = request.nextUrl.searchParams.get('vertical')
    let vpQuery = supabase.from('vendor_profiles').select('*').eq('user_id', user.id)
    if (vertical) vpQuery = vpQuery.eq('vertical_id', vertical)
    const { data: vendorProfile, error: vendorError } = await vpQuery.single()

    if (vendorError || !vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    try {
      let stripeAccountId = vendorProfile.stripe_account_id

      if (stripeAccountId) {
        // Validate existing account still exists on Stripe
        try {
          await getAccountStatus(stripeAccountId)
        } catch (validationError) {
          if (
            validationError instanceof Stripe.errors.StripeInvalidRequestError &&
            validationError.statusCode === 404
          ) {
            // Account doesn't exist on Stripe — clear it so we create a fresh one
            console.error(`Stripe account ${stripeAccountId} not found — clearing and creating new account`)
            stripeAccountId = null
            await supabase
              .from('vendor_profiles')
              .update({
                stripe_account_id: null,
                stripe_charges_enabled: false,
                stripe_payouts_enabled: false,
                stripe_onboarding_complete: false,
              })
              .eq('id', vendorProfile.id)
          } else {
            throw validationError
          }
        }
      }

      // Create Stripe account if doesn't exist (or was just cleared)
      if (!stripeAccountId) {
        const account = await createConnectAccount(user.email!, vendorProfile.id)
        stripeAccountId = account.id

        // Save to database
        await supabase
          .from('vendor_profiles')
          .update({ stripe_account_id: stripeAccountId })
          .eq('id', vendorProfile.id)
      }

      // Create account link
      const baseUrl = request.nextUrl.origin
      const vpVertical = vendorProfile.vertical_id || 'farmers_market'
      const refreshUrl = `${baseUrl}/${vpVertical}/vendor/dashboard/stripe/refresh`
      const returnUrl = `${baseUrl}/${vpVertical}/vendor/dashboard/stripe/complete`

      const accountLink = await createAccountLink(
        stripeAccountId,
        refreshUrl,
        returnUrl
      )

      return NextResponse.json({ url: accountLink.url })
    } catch (error) {
      console.error('Stripe onboarding error:', error)
      return NextResponse.json(
        { error: 'Failed to create onboarding link' },
        { status: 500 }
      )
    }
  })
}
