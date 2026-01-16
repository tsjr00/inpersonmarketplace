import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
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

    // In a full implementation, we would:
    // 1. Cancel the Stripe subscription if active
    // 2. Log the downgrade for analytics
    // For now, just update the tier

    // TODO: Cancel Stripe subscription
    // if (vendorProfile.stripe_subscription_id) {
    //   await stripe.subscriptions.cancel(vendorProfile.stripe_subscription_id)
    // }

    // Update vendor tier to standard
    const { error: updateError } = await supabase
      .from('vendor_profiles')
      .update({
        tier: 'standard',
        // Clear subscription ID since they're downgrading
        stripe_subscription_id: null,
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
}
