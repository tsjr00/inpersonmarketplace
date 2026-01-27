import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { transferToVendor } from '@/lib/stripe/payments'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: orderItemId } = await params

  const {
    data: { user },
  } = await supabase.auth.getUser()

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

  // Get order item
  const { data: orderItem } = await supabase
    .from('order_items')
    .select('*, order:orders(*)')
    .eq('id', orderItemId)
    .eq('vendor_profile_id', vendorProfile.id)
    .single()

  if (!orderItem) {
    return NextResponse.json({ error: 'Order item not found' }, { status: 404 })
  }

  const isDev = process.env.NODE_ENV !== 'production'
  const hasStripe = !!vendorProfile.stripe_account_id

  if (!hasStripe && !isDev) {
    return NextResponse.json({ error: 'Stripe account not connected' }, { status: 400 })
  }

  try {
    // Update status
    await supabase
      .from('order_items')
      .update({
        status: 'fulfilled',
        pickup_confirmed_at: new Date().toISOString(),
      })
      .eq('id', orderItemId)

    // Initiate payout to vendor (skip in dev mode if no Stripe account)
    if (hasStripe) {
      const transfer = await transferToVendor({
        amount: orderItem.vendor_payout_cents,
        destination: vendorProfile.stripe_account_id,
        orderId: orderItem.order_id,
        orderItemId: orderItem.id,
      })

      // Create payout record
      await supabase.from('vendor_payouts').insert({
        order_item_id: orderItem.id,
        vendor_profile_id: vendorProfile.id,
        amount_cents: orderItem.vendor_payout_cents,
        stripe_transfer_id: transfer.id,
        status: 'processing',
      })
    } else {
      // Dev mode without Stripe - create placeholder payout record
      console.log(`[DEV] Skipping Stripe payout for order item ${orderItemId} - no Stripe account`)
      await supabase.from('vendor_payouts').insert({
        order_item_id: orderItem.id,
        vendor_profile_id: vendorProfile.id,
        amount_cents: orderItem.vendor_payout_cents,
        stripe_transfer_id: `dev_skip_${orderItemId}`,
        status: 'skipped_dev',
      })
    }

    // Check if all non-cancelled items in order are fulfilled
    const { data: allItems } = await supabase
      .from('order_items')
      .select('status')
      .eq('order_id', orderItem.order_id)

    // Filter out cancelled items and check if remaining are all fulfilled
    const activeItems = allItems?.filter((item) => item.status !== 'cancelled') || []
    const allFulfilled = activeItems.length > 0 && activeItems.every((item) => item.status === 'fulfilled')

    if (allFulfilled) {
      await supabase
        .from('orders')
        .update({ status: 'completed' })
        .eq('id', orderItem.order_id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Fulfill error:', error)
    return NextResponse.json({ error: 'Failed to fulfill order' }, { status: 500 })
  }
}
