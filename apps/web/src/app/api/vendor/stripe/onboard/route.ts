import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createConnectAccount, createAccountLink } from '@/lib/stripe/connect'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/vendor/stripe/onboard', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-stripe-onboard:${clientIp}`, rateLimits.submit)
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

    // Get vendor profile
    const { data: vendorProfile, error: vendorError } = await supabase
      .from('vendor_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (vendorError || !vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    try {
      let stripeAccountId = vendorProfile.stripe_account_id

      // Create Stripe account if doesn't exist
      if (!stripeAccountId) {
        const account = await createConnectAccount(user.email!)
        stripeAccountId = account.id

        // Save to database
        await supabase
          .from('vendor_profiles')
          .update({ stripe_account_id: stripeAccountId })
          .eq('id', vendorProfile.id)
      }

      // Create account link
      const baseUrl = request.nextUrl.origin
      const vertical = vendorProfile.vertical_id || 'fireworks'
      const refreshUrl = `${baseUrl}/${vertical}/vendor/dashboard/stripe/refresh`
      const returnUrl = `${baseUrl}/${vertical}/vendor/dashboard/stripe/complete`

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
