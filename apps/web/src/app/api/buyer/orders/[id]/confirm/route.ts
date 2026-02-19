import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { transferToVendor } from '@/lib/stripe/payments'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { sendNotification } from '@/lib/notifications'

interface RouteContext {
  params: Promise<{ id: string }>
}

// Vendor has 30 seconds to click Fulfill after buyer acknowledges
const CONFIRMATION_WINDOW_SECONDS = 30

// POST /api/buyer/orders/[id]/confirm - Buyer acknowledges they received an item
// Normal flow: Buyer acknowledges first (item is 'ready'), then vendor clicks Fulfill within 30 seconds
// Edge case: Vendor fulfilled first (item is 'fulfilled'), now buyer acknowledges to complete
export async function POST(request: NextRequest, context: RouteContext) {
  // Rate limit buyer confirmation requests
  const clientIp = getClientIp(request)
  const rateLimitResult = checkRateLimit(`buyer-confirm:${clientIp}`, { limit: 30, windowSeconds: 60 })

  if (!rateLimitResult.success) {
    return rateLimitResponse(rateLimitResult)
  }

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
          order_number,
          buyer_user_id,
          vertical_id,
          tip_amount
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

      // Get vendor profile with Stripe account status
      crumb.supabase('select', 'vendor_profiles')
      const { data: vendorProfile } = await supabase
        .from('vendor_profiles')
        .select('id, stripe_account_id, stripe_payouts_enabled, user_id')
        .eq('id', orderItem.vendor_profile_id)
        .single()

      if (!vendorProfile) {
        throw traced.notFound('ERR_ORDER_001', 'Vendor not found')
      }

      // Check if vendor's Stripe account is ready for payouts
      const isProd = process.env.NODE_ENV === 'production'
      const stripeReady = vendorProfile.stripe_account_id && vendorProfile.stripe_payouts_enabled

      // Update with buyer confirmation and vendor confirmation (completing transaction)
      crumb.supabase('update', 'order_items')
      await supabase
        .from('order_items')
        .update({
          buyer_confirmed_at: now.toISOString(),
          vendor_confirmed_at: now.toISOString(), // Auto-complete since vendor already fulfilled
        })
        .eq('id', orderItemId)

      // C1 FIX: Calculate tip share for this item
      let tipShareCents = 0
      if ((order as any)?.tip_amount && (order as any).tip_amount > 0) {
        const { count: totalItemsInOrder } = await supabase
          .from('order_items')
          .select('id', { count: 'exact', head: true })
          .eq('order_id', orderItem.order_id)
        tipShareCents = totalItemsInOrder
          ? Math.round((order as any).tip_amount / totalItemsInOrder)
          : 0
      }
      const actualPayoutCents = orderItem.vendor_payout_cents + tipShareCents

      // Check if vendor was already paid (prevents double payout on race condition)
      crumb.supabase('select', 'vendor_payouts')
      const { data: existingPayout } = await supabase
        .from('vendor_payouts')
        .select('id, status')
        .eq('order_item_id', orderItem.id)
        .neq('status', 'failed')
        .maybeSingle()

      if (existingPayout) {
        crumb.logic('Vendor payout already exists, skipping transfer', { payoutId: existingPayout.id, status: existingPayout.status })
      } else {
        // Trigger Stripe transfer to vendor (only if Stripe is fully ready)
        crumb.logic('Processing vendor payout')
        const isDev = process.env.NODE_ENV !== 'production'

        if (stripeReady) {
          try {
            const transfer = await transferToVendor({
              amount: actualPayoutCents,
              destination: vendorProfile.stripe_account_id,
              orderId: orderItem.order_id,
              orderItemId: orderItem.id,
            })

            crumb.supabase('insert', 'vendor_payouts')
            await supabase.from('vendor_payouts').insert({
              order_item_id: orderItem.id,
              vendor_profile_id: vendorProfile.id,
              amount_cents: actualPayoutCents,
              stripe_transfer_id: transfer.id,
              status: 'processing',
            })
          } catch (transferError) {
            console.error('Stripe transfer failed:', transferError)
            // Record failed payout for retry cron — buyer did their part
            crumb.supabase('insert', 'vendor_payouts (failed)')
            await supabase.from('vendor_payouts').insert({
              order_item_id: orderItem.id,
              vendor_profile_id: vendorProfile.id,
              amount_cents: actualPayoutCents,
              stripe_transfer_id: null,
              status: 'failed',
            })
          }
        } else if (isDev) {
          console.log(`[DEV] Skipping Stripe payout for order item ${orderItemId}`)
          crumb.supabase('insert', 'vendor_payouts')
          await supabase.from('vendor_payouts').insert({
            order_item_id: orderItem.id,
            vendor_profile_id: vendorProfile.id,
            amount_cents: actualPayoutCents,
            stripe_transfer_id: `dev_skip_${orderItemId}`,
            status: 'skipped_dev',
          })
        } else if (isProd && !stripeReady) {
          // Vendor's Stripe not ready - record pending payout for admin follow-up
          console.warn(`[WARN] Vendor Stripe not ready for payout on order item ${orderItemId}`)
          crumb.supabase('insert', 'vendor_payouts')
          await supabase.from('vendor_payouts').insert({
            order_item_id: orderItem.id,
            vendor_profile_id: vendorProfile.id,
            amount_cents: actualPayoutCents,
            stripe_transfer_id: `pending_stripe_${orderItemId}`,
            status: 'pending_stripe_setup',
          })
        }
      }

      // Atomically mark order completed if all items are fully confirmed
      crumb.logic('Checking atomic order completion')
      await supabase.rpc('atomic_complete_order_if_ready', { p_order_id: orderItem.order_id })

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

      // Notify vendor to fulfill (multi-channel via notification service)
      crumb.supabase('select', 'vendor_profiles')
      const { data: vendorProfile } = await supabase
        .from('vendor_profiles')
        .select('user_id')
        .eq('id', orderItem.vendor_profile_id)
        .single()

      if (vendorProfile?.user_id) {
        await sendNotification(vendorProfile.user_id, 'pickup_confirmation_needed', {
          orderItemId,
        }, { vertical: (order as { vertical_id?: string }).vertical_id })
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
