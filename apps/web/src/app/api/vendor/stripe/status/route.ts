import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAccountStatus } from '@/lib/stripe/connect'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'
import Stripe from 'stripe'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/stripe/status', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-stripe-status:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const vertical = request.nextUrl.searchParams.get('vertical')
    const { profile: vendorProfile, error: vpError } = await getVendorProfileForVertical<{
      id: string
      stripe_account_id: string | null
    }>(supabase, user.id, vertical, 'id, stripe_account_id')

    if (vpError) {
      console.error('[/api/vendor/stripe/status] vendor profile lookup error:', vpError)
    }

    if (!vendorProfile?.stripe_account_id) {
      return NextResponse.json({ connected: false })
    }

    try {
      const status = await getAccountStatus(vendorProfile.stripe_account_id)

      // Update database with latest Stripe state
      await supabase
        .from('vendor_profiles')
        .update({
          stripe_charges_enabled: status.chargesEnabled,
          stripe_payouts_enabled: status.payoutsEnabled,
          stripe_onboarding_complete: status.detailsSubmitted,
        })
        .eq('id', vendorProfile.id)

      return NextResponse.json({
        connected: true,
        ...status,
      })
    } catch (error) {
      // If Stripe says the account doesn't exist, clear the invalid ID
      // so the vendor can re-onboard with a fresh account
      if (
        error instanceof Stripe.errors.StripeInvalidRequestError &&
        error.statusCode === 404
      ) {
        console.error(`Stripe account ${vendorProfile.stripe_account_id} not found on Stripe — clearing invalid reference`)
        await supabase
          .from('vendor_profiles')
          .update({
            stripe_account_id: null,
            stripe_charges_enabled: false,
            stripe_payouts_enabled: false,
            stripe_onboarding_complete: false,
          })
          .eq('id', vendorProfile.id)

        return NextResponse.json({ connected: false })
      }

      console.error('Stripe status check error:', error)
      return NextResponse.json(
        { error: 'Failed to check Stripe account status. Please try again.' },
        { status: 500 }
      )
    }
  })
}
