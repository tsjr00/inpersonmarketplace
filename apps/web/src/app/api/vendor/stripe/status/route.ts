import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAccountStatus } from '@/lib/stripe/connect'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/stripe/status', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-stripe-status:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // H13 FIX: Add vertical filter for multi-vertical safety
    const vertical = request.nextUrl.searchParams.get('vertical')
    let vpQuery = supabase.from('vendor_profiles').select('id, stripe_account_id').eq('user_id', user.id)
    if (vertical) vpQuery = vpQuery.eq('vertical_id', vertical)
    const { data: vendorProfile } = await vpQuery.single()

    if (!vendorProfile?.stripe_account_id) {
      return NextResponse.json({ connected: false })
    }

    try {
      const status = await getAccountStatus(vendorProfile.stripe_account_id)

      // Update database
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
      console.error('Stripe status check error:', error)
      return NextResponse.json(
        { error: 'Failed to check status' },
        { status: 500 }
      )
    }
  })
}
