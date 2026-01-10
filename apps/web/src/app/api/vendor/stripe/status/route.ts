import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAccountStatus } from '@/lib/stripe/connect'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('stripe_account_id')
    .eq('user_id', user.id)
    .single()

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
      .eq('user_id', user.id)

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
}
