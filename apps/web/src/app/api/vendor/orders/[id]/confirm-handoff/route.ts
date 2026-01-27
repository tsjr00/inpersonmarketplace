import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { transferToVendor } from '@/lib/stripe/payments'

interface RouteContext {
  params: Promise<{ id: string }>
}

// POST /api/vendor/orders/[id]/confirm-handoff
// Vendor counter-confirms that they handed off items to the buyer.
// This triggers the Stripe transfer to the vendor.
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: orderItemId } = await context.params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get vendor profile
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id, stripe_account_id')
    .eq('user_id', user.id)
    .single()

  if (!vendorProfile) {
    return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
  }

  // Get order item - must belong to this vendor and buyer must have confirmed
  const { data: orderItem, error: fetchError } = await supabase
    .from('order_items')
    .select('id, status, vendor_payout_cents, order_id, buyer_confirmed_at, vendor_confirmed_at, vendor_profile_id')
    .eq('id', orderItemId)
    .eq('vendor_profile_id', vendorProfile.id)
    .single()

  if (fetchError || !orderItem) {
    return NextResponse.json({ error: 'Order item not found' }, { status: 404 })
  }

  // Buyer must have confirmed first
  if (!orderItem.buyer_confirmed_at) {
    return NextResponse.json(
      { error: 'Buyer has not confirmed receipt yet. Wait for buyer to confirm first.' },
      { status: 400 }
    )
  }

  // Already confirmed
  if (orderItem.vendor_confirmed_at) {
    return NextResponse.json(
      { error: 'Already confirmed', vendor_confirmed_at: orderItem.vendor_confirmed_at },
      { status: 400 }
    )
  }

  const now = new Date()

  try {
    // Set vendor confirmation and clear lockdown
    await supabase
      .from('order_items')
      .update({
        vendor_confirmed_at: now.toISOString(),
        lockdown_active: false,
        lockdown_initiated_at: null,
        status: 'fulfilled' // Ensure status is fulfilled
      })
      .eq('id', orderItemId)

    // Trigger Stripe transfer to vendor
    const isDev = process.env.NODE_ENV !== 'production'
    const hasStripe = !!vendorProfile.stripe_account_id

    if (hasStripe) {
      const transfer = await transferToVendor({
        amount: orderItem.vendor_payout_cents,
        destination: vendorProfile.stripe_account_id,
        orderId: orderItem.order_id,
        orderItemId: orderItem.id,
      })

      await supabase.from('vendor_payouts').insert({
        order_item_id: orderItem.id,
        vendor_profile_id: vendorProfile.id,
        amount_cents: orderItem.vendor_payout_cents,
        stripe_transfer_id: transfer.id,
        status: 'processing',
      })
    } else if (isDev) {
      // Dev mode without Stripe
      console.log(`[DEV] Skipping Stripe payout for order item ${orderItemId}`)
      await supabase.from('vendor_payouts').insert({
        order_item_id: orderItem.id,
        vendor_profile_id: vendorProfile.id,
        amount_cents: orderItem.vendor_payout_cents,
        stripe_transfer_id: `dev_skip_${orderItemId}`,
        status: 'skipped_dev',
      })
    } else {
      return NextResponse.json({ error: 'Stripe account not connected' }, { status: 400 })
    }

    // Check if all items in order are now fully confirmed (both parties)
    const { data: allItems } = await supabase
      .from('order_items')
      .select('status, buyer_confirmed_at, vendor_confirmed_at, cancelled_at')
      .eq('order_id', orderItem.order_id)

    const activeItems = allItems?.filter(i => !i.cancelled_at) || []
    const allFullyConfirmed = activeItems.length > 0 &&
      activeItems.every(i => i.buyer_confirmed_at && i.vendor_confirmed_at)

    if (allFullyConfirmed) {
      await supabase
        .from('orders')
        .update({ status: 'completed' })
        .eq('id', orderItem.order_id)
    }

    return NextResponse.json({
      success: true,
      message: 'Handoff confirmed. Payment is being transferred to your account.',
      vendor_confirmed_at: now.toISOString()
    })
  } catch (error) {
    console.error('Confirm handoff error:', error)
    return NextResponse.json({ error: 'Failed to confirm handoff' }, { status: 500 })
  }
}
