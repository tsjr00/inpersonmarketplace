import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { transferToVendor } from '@/lib/stripe/payments'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

interface RouteContext {
  params: Promise<{ id: string }>
}

// Vendor has 30 seconds to click Fulfill after buyer acknowledges
const CONFIRMATION_WINDOW_SECONDS = 30

// POST /api/buyer/orders/[id]/confirm - Buyer acknowledges they received an item
// Normal flow: Buyer acknowledges first (item is 'ready'), then vendor clicks Fulfill within 30 seconds
// Edge case: Vendor fulfilled first (item is 'fulfilled'), now buyer acknowledges to complete
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: orderItemId } = await context.params

  return withErrorTracing('/api/buyer/orders/[id]/confirm', 'POST', async () => {
    const supabase = await createClient()

    // Verify authentication
    crumb.auth('Checking user authentication')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Get the order item with payment info for edge case handling
    crumb.supabase('select', 'order_items')
    const { data: orderItem, error: fetchError } = await supabase
      .from('order_items')
      .select(`
        id,
        status,
        buyer_confirmed_at,
        vendor_confirmed_at,
        vendor_profile_id,
        vendor_payout_cents,
        order_id,
        order:orders!inner (
          id,
          buyer_user_id
        )
      `)
      .eq('id', orderItemId)
      .single()

    if (fetchError || !orderItem) {
      throw traced.notFound('ERR_ORDER_001', 'Order item not found', { orderItemId })
    }

    // Verify this order belongs to the current user
    crumb.auth('Verifying order ownership')
    const orderData = orderItem.order as unknown
    const order = Array.isArray(orderData) ? orderData[0] : orderData
    if (!order || (order as { buyer_user_id: string }).buyer_user_id !== user.id) {
      throw traced.auth('ERR_AUTH_002', 'Not authorized to confirm this order item')
    }

    // Check if item is in a confirmable state (ready or fulfilled by vendor)
    crumb.logic('Checking confirmation eligibility')
    if (!['ready', 'fulfilled'].includes(orderItem.status)) {
      throw traced.validation('ERR_ORDER_003', 'Item is not ready for pickup confirmation', { status: orderItem.status })
    }

    // Check if already confirmed by buyer
    if (orderItem.buyer_confirmed_at) {
      throw traced.validation('ERR_ORDER_003', 'Already acknowledged', { buyer_confirmed_at: orderItem.buyer_confirmed_at })
    }

    const now = new Date()
    const vendorAlreadyFulfilled = orderItem.status === 'fulfilled'

    if (vendorAlreadyFulfilled) {
      // EDGE CASE: Vendor fulfilled first, now buyer acknowledges
      // Complete the transaction and trigger payment

      // Get vendor profile for Stripe account
      crumb.supabase('select', 'vendor_profiles')
      const { data: vendorProfile } = await supabase
        .from('vendor_profiles')
        .select('id, stripe_account_id, user_id')
        .eq('id', orderItem.vendor_profile_id)
        .single()

      if (!vendorProfile) {
        throw traced.notFound('ERR_ORDER_001', 'Vendor not found')
      }

      // Update with buyer confirmation and vendor confirmation (completing transaction)
      crumb.supabase('update', 'order_items')
      await supabase
        .from('order_items')
        .update({
          buyer_confirmed_at: now.toISOString(),
          vendor_confirmed_at: now.toISOString(), // Auto-complete since vendor already fulfilled
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
          // Don't throw - buyer did their part, payment issue is admin concern
        }
      } else if (isDev) {
        console.log(`[DEV] Skipping Stripe payout for order item ${orderItemId}`)
        crumb.supabase('insert', 'vendor_payouts')
        await supabase.from('vendor_payouts').insert({
          order_item_id: orderItem.id,
          vendor_profile_id: vendorProfile.id,
          amount_cents: orderItem.vendor_payout_cents,
          stripe_transfer_id: `dev_skip_${orderItemId}`,
          status: 'skipped_dev',
        })
      }

      // Check if all items in order are now complete
      crumb.supabase('select', 'order_items')
      const { data: allItems } = await supabase
        .from('order_items')
        .select('status, buyer_confirmed_at, vendor_confirmed_at, cancelled_at')
        .eq('order_id', orderItem.order_id)

      const activeItems = allItems?.filter(i => !i.cancelled_at) || []
      const allComplete = activeItems.length > 0 &&
        activeItems.every(i => i.buyer_confirmed_at && i.vendor_confirmed_at)

      if (allComplete) {
        crumb.supabase('update', 'orders')
        await supabase
          .from('orders')
          .update({ status: 'completed' })
          .eq('id', orderItem.order_id)
      }

      return NextResponse.json({
        success: true,
        message: 'Receipt acknowledged. Transaction complete!',
        buyer_confirmed_at: now.toISOString(),
        completed: true
      })
    } else {
      // NORMAL FLOW: Buyer acknowledges first (item is 'ready')
      // Vendor has 30 seconds to click Fulfill to complete
      const windowExpires = new Date(now.getTime() + CONFIRMATION_WINDOW_SECONDS * 1000)

      crumb.supabase('update', 'order_items')
      const { error: updateError } = await supabase
        .from('order_items')
        .update({
          buyer_confirmed_at: now.toISOString(),
          confirmation_window_expires_at: windowExpires.toISOString()
        })
        .eq('id', orderItemId)

      if (updateError) {
        throw traced.fromSupabase(updateError, { table: 'order_items', operation: 'update' })
      }

      // Create notification for vendor to fulfill
      crumb.supabase('select', 'vendor_profiles')
      const { data: vendorProfile } = await supabase
        .from('vendor_profiles')
        .select('user_id')
        .eq('id', orderItem.vendor_profile_id)
        .single()

      if (vendorProfile?.user_id) {
        crumb.supabase('insert', 'notifications')
        await supabase.from('notifications').insert({
          user_id: vendorProfile.user_id,
          type: 'pickup_confirmation_needed',
          title: 'Buyer Acknowledged Receipt',
          message: 'A buyer acknowledged they received their order. Please tap Fulfill within 30 seconds.',
          data: {
            order_item_id: orderItemId,
            confirmation_window_expires_at: windowExpires.toISOString()
          }
        })
      }

      return NextResponse.json({
        success: true,
        message: 'Receipt acknowledged. Vendor has 30 seconds to fulfill.',
        buyer_confirmed_at: now.toISOString(),
        confirmation_window_expires_at: windowExpires.toISOString(),
        completed: false
      })
    }
  })
}
