import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { transferToVendor } from '@/lib/stripe/payments'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

interface RouteContext {
  params: Promise<{ id: string }>
}

// POST /api/vendor/orders/[id]/confirm-handoff
// Vendor counter-confirms that they handed off items to the buyer.
// This triggers the Stripe transfer to the vendor.
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: orderItemId } = await context.params

  return withErrorTracing('/api/vendor/orders/[id]/confirm-handoff', 'POST', async () => {
    const supabase = await createClient()

    crumb.auth('Checking user authentication')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Get vendor profile with Stripe account status
    crumb.supabase('select', 'vendor_profiles')
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('id, stripe_account_id, stripe_payouts_enabled')
      .eq('user_id', user.id)
      .single()

    if (!vendorProfile) {
      throw traced.notFound('ERR_ORDER_001', 'Vendor not found')
    }

    // Verify Stripe account is ready for payouts before proceeding
    const isProd = process.env.NODE_ENV === 'production'
    if (isProd && vendorProfile.stripe_account_id && !vendorProfile.stripe_payouts_enabled) {
      throw traced.validation('ERR_ORDER_005', 'Your Stripe account is not yet enabled for payouts. Please complete your Stripe verification before confirming handoffs.')
    }

    // Get order item - must belong to this vendor and buyer must have confirmed
    crumb.supabase('select', 'order_items')
    const { data: orderItem, error: fetchError } = await supabase
      .from('order_items')
      .select('id, status, vendor_payout_cents, order_id, buyer_confirmed_at, vendor_confirmed_at, vendor_profile_id')
      .eq('id', orderItemId)
      .eq('vendor_profile_id', vendorProfile.id)
      .single()

    if (fetchError || !orderItem) {
      throw traced.notFound('ERR_ORDER_001', 'Order item not found', { orderItemId })
    }

    // Buyer must have confirmed first
    crumb.logic('Checking buyer confirmation status')
    if (!orderItem.buyer_confirmed_at) {
      throw traced.validation('ERR_ORDER_004', 'Buyer has not acknowledged receipt yet. Wait for buyer to acknowledge first.')
    }

    // Already confirmed
    if (orderItem.vendor_confirmed_at) {
      throw traced.validation('ERR_ORDER_004', 'Already confirmed', { vendor_confirmed_at: orderItem.vendor_confirmed_at })
    }

    const now = new Date()

    // Set vendor confirmation and clear lockdown
    crumb.supabase('update', 'order_items')
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
    crumb.logic('Processing vendor payout')
    const isDev = process.env.NODE_ENV !== 'production'
    const hasStripe = !!vendorProfile.stripe_account_id

    if (hasStripe) {
      try {
        const transfer = await transferToVendor({
          amount: orderItem.vendor_payout_cents,
          destination: vendorProfile.stripe_account_id,
          orderId: orderItem.order_id,
          orderItemId: orderItem.id,
        })

        crumb.supabase('insert', 'vendor_payouts')
        await supabase.from('vendor_payouts').insert({
          order_item_id: orderItem.id,
          vendor_profile_id: vendorProfile.id,
          amount_cents: orderItem.vendor_payout_cents,
          stripe_transfer_id: transfer.id,
          status: 'processing',
        })
      } catch (transferError) {
        console.error('Stripe transfer failed:', transferError)
        throw traced.external('ERR_ORDER_004', 'Failed to process vendor payout', { orderItemId })
      }
    } else if (isDev) {
      // Dev mode without Stripe
      console.log(`[DEV] Skipping Stripe payout for order item ${orderItemId}`)
      crumb.supabase('insert', 'vendor_payouts')
      await supabase.from('vendor_payouts').insert({
        order_item_id: orderItem.id,
        vendor_profile_id: vendorProfile.id,
        amount_cents: orderItem.vendor_payout_cents,
        stripe_transfer_id: `dev_skip_${orderItemId}`,
        status: 'skipped_dev',
      })
    } else {
      throw traced.validation('ERR_ORDER_004', 'Stripe account not connected')
    }

    // Check if all items in order are now fully confirmed (both parties)
    crumb.supabase('select', 'order_items')
    const { data: allItems } = await supabase
      .from('order_items')
      .select('status, buyer_confirmed_at, vendor_confirmed_at, cancelled_at')
      .eq('order_id', orderItem.order_id)

    const activeItems = allItems?.filter(i => !i.cancelled_at) || []
    const allFullyConfirmed = activeItems.length > 0 &&
      activeItems.every(i => i.buyer_confirmed_at && i.vendor_confirmed_at)

    if (allFullyConfirmed) {
      crumb.supabase('update', 'orders')
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
  })
}
