import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { transferToVendor } from '@/lib/stripe/payments'
import { getAccountStatus } from '@/lib/stripe/connect'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import {
  getVendorFeeBalance,
  calculateAutoDeductAmount,
  recordFeeCredit
} from '@/lib/payments/vendor-fees'
import { sendNotification } from '@/lib/notifications'
import { calculateTipShare } from '@/lib/payments/tip-math'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit order fulfillment requests
  const clientIp = getClientIp(request)
  const rateLimitResult = checkRateLimit(`vendor-fulfill:${clientIp}`, { limit: 30, windowSeconds: 60 })

  if (!rateLimitResult.success) {
    return rateLimitResponse(rateLimitResult)
  }

  const { id: orderItemId } = await params

  return withErrorTracing('/api/vendor/orders/[id]/fulfill', 'POST', async () => {
    const supabase = await createClient()

    crumb.auth('Checking user authentication')
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Get vendor profile with Stripe account status for payment processing
    crumb.supabase('select', 'vendor_profiles')
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('id, stripe_account_id, stripe_payouts_enabled')
      .eq('user_id', user.id)
      .single()

    if (!vendorProfile) {
      throw traced.notFound('ERR_ORDER_001', 'Vendor not found')
    }

    // Get order item with payment info, confirmation window, and buyer/order info for notification
    crumb.supabase('select', 'order_items')
    const { data: orderItem } = await supabase
      .from('order_items')
      .select(`
        id, status, vendor_payout_cents, order_id,
        buyer_confirmed_at, vendor_confirmed_at, confirmation_window_expires_at,
        order:orders!inner(id, order_number, buyer_user_id, vertical_id, tip_amount, tip_on_platform_fee_cents),
        listing:listings(title, vendor_profiles(profile_data))
      `)
      .eq('id', orderItemId)
      .eq('vendor_profile_id', vendorProfile.id)
      .single()

    if (!orderItem) {
      throw traced.notFound('ERR_ORDER_001', 'Order item not found', { orderItemId })
    }

    // Check if already fulfilled
    if (orderItem.vendor_confirmed_at) {
      throw traced.validation('ERR_ORDER_004', 'Already fulfilled', { vendor_confirmed_at: orderItem.vendor_confirmed_at })
    }

    const now = new Date()
    const buyerAlreadyAcknowledged = !!orderItem.buyer_confirmed_at

    if (buyerAlreadyAcknowledged) {
      // Check if 30-second confirmation window has expired
      const windowExpires = orderItem.confirmation_window_expires_at
        ? new Date(orderItem.confirmation_window_expires_at)
        : null

      if (windowExpires && now > windowExpires) {
        // Window expired - reset buyer acknowledgment, they must re-acknowledge
        crumb.logic('Confirmation window expired, resetting buyer acknowledgment')
        await supabase
          .from('order_items')
          .update({
            buyer_confirmed_at: null,
            confirmation_window_expires_at: null
          })
          .eq('id', orderItemId)

        throw traced.validation('ERR_ORDER_006', 'Confirmation window expired. Please ask the buyer to acknowledge receipt again.', {
          window_expired_at: windowExpires.toISOString()
        })
      }

      // NORMAL FLOW: Buyer acknowledged first, vendor fulfills within 30-second window
      // Verify Stripe is ready BEFORE marking fulfilled (so we don't get fulfilled + no payout)
      const isProd = process.env.NODE_ENV === 'production'
      const isDev = !isProd
      const hasStripe = !!vendorProfile.stripe_account_id

      if (isProd && hasStripe && !vendorProfile.stripe_payouts_enabled) {
        crumb.logic('Cached stripe_payouts_enabled is falsy, checking live status')
        try {
          const liveStatus = await getAccountStatus(vendorProfile.stripe_account_id)
          await supabase
            .from('vendor_profiles')
            .update({
              stripe_charges_enabled: liveStatus.chargesEnabled,
              stripe_payouts_enabled: liveStatus.payoutsEnabled,
              stripe_onboarding_complete: liveStatus.detailsSubmitted,
            })
            .eq('user_id', user.id)

          if (!liveStatus.payoutsEnabled) {
            throw traced.validation('ERR_ORDER_005', 'Your Stripe account is not yet enabled for payouts. Please complete your Stripe verification before fulfilling orders.')
          }
        } catch (err) {
          if (err && typeof err === 'object' && 'code' in err) throw err
          console.error('Stripe live status check failed:', err)
        }
      }

      // Complete the transaction and trigger payment
      crumb.supabase('update', 'order_items')
      await supabase
        .from('order_items')
        .update({
          status: 'fulfilled',
          vendor_confirmed_at: now.toISOString(),
          pickup_confirmed_at: now.toISOString(),
          confirmation_window_expires_at: null,
        })
        .eq('id', orderItemId)

      crumb.logic('Processing vendor payout')

      // Check for outstanding fee balance and calculate deduction
      let feeDeductionCents = 0
      const serviceClient = createServiceClient()

      try {
        const { balanceCents } = await getVendorFeeBalance(supabase, vendorProfile.id)
        if (balanceCents > 0) {
          feeDeductionCents = calculateAutoDeductAmount(
            orderItem.vendor_payout_cents,
            balanceCents
          )
          crumb.logic('Fee deduction calculated', {
            balance: balanceCents,
            deduction: feeDeductionCents,
            payout: orderItem.vendor_payout_cents
          })
        }
      } catch (feeError) {
        // Don't block payout if fee check fails
        console.error('Fee balance check failed:', feeError)
      }

      // C1 FIX: Calculate tip share for this item
      // Vendor gets tip on food cost only (total tip minus platform fee tip portion)
      const orderData = (orderItem as any).order as any
      let tipShareCents = 0
      if (orderData?.tip_amount && orderData.tip_amount > 0) {
        const vendorTipCents = orderData.tip_amount - (orderData.tip_on_platform_fee_cents || 0)
        const { count: totalItemsInOrder } = await supabase
          .from('order_items')
          .select('id', { count: 'exact', head: true })
          .eq('order_id', orderItem.order_id)
        tipShareCents = calculateTipShare(vendorTipCents, totalItemsInOrder)
        crumb.logic('Tip share calculated', {
          totalTip: orderData.tip_amount,
          platformFeeTip: orderData.tip_on_platform_fee_cents || 0,
          vendorTip: vendorTipCents,
          items: totalItemsInOrder,
          share: tipShareCents
        })
      }

      const actualPayoutCents = orderItem.vendor_payout_cents - feeDeductionCents + tipShareCents

      // C2 FIX: Check if vendor was already paid (prevents double payout)
      crumb.supabase('select', 'vendor_payouts')
      const { data: existingPayout } = await supabase
        .from('vendor_payouts')
        .select('id, status')
        .eq('order_item_id', orderItem.id)
        .neq('status', 'failed')
        .maybeSingle()

      if (existingPayout) {
        crumb.logic('Vendor payout already exists, skipping transfer', {
          payoutId: existingPayout.id,
          status: existingPayout.status
        })
        return NextResponse.json({
          success: true,
          message: 'Order fulfilled. Payment was already processed.',
          completed: true,
          vendor_confirmed_at: now.toISOString()
        })
      }

      if (hasStripe) {
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

          // Record fee credit if deduction was made
          if (feeDeductionCents > 0) {
            await recordFeeCredit(
              serviceClient,
              vendorProfile.id,
              feeDeductionCents,
              `Auto-deducted from Stripe payout`,
              orderItem.order_id
            )
          }
        } catch (transferError) {
          // C2 FIX: Revert status on failed transfer to prevent orphaned fulfillment
          crumb.logic('Stripe transfer failed, reverting order item status')
          await supabase
            .from('order_items')
            .update({
              status: 'ready',
              vendor_confirmed_at: null,
              pickup_confirmed_at: null,
            })
            .eq('id', orderItemId)

          console.error('Stripe transfer failed:', transferError)
          throw traced.external('ERR_ORDER_004', 'Failed to process vendor payout. Order status has been reverted — please try again.', { orderItemId })
        }
      } else if (isDev) {
        // Dev mode without Stripe
        console.log(`[DEV] Skipping Stripe payout for order item ${orderItemId}`)
        crumb.supabase('insert', 'vendor_payouts')
        await supabase.from('vendor_payouts').insert({
          order_item_id: orderItem.id,
          vendor_profile_id: vendorProfile.id,
          amount_cents: actualPayoutCents,
          stripe_transfer_id: `dev_skip_${orderItemId}`,
          status: 'skipped_dev',
        })

        // Still record fee credit in dev mode
        if (feeDeductionCents > 0) {
          await recordFeeCredit(
            serviceClient,
            vendorProfile.id,
            feeDeductionCents,
            `Auto-deducted from payout (dev mode)`,
            orderItem.order_id
          )
        }
      } else {
        throw traced.validation('ERR_ORDER_004', 'Stripe account not connected')
      }

      // Atomically mark order completed if all items are fully confirmed
      crumb.logic('Checking atomic order completion')
      await supabase.rpc('atomic_complete_order_if_ready', { p_order_id: orderItem.order_id })

      // Notify buyer that order is fulfilled
      const fulfillOrderData = (orderItem as any).order as any
      const fulfillListing = (orderItem as any).listing as any
      const fulfillVendorName = fulfillListing?.vendor_profiles?.profile_data?.business_name || 'Vendor'
      await sendNotification(fulfillOrderData.buyer_user_id, 'order_fulfilled', {
        orderNumber: fulfillOrderData.order_number,
        vendorName: fulfillVendorName,
        itemTitle: fulfillListing?.title,
      }, { vertical: fulfillOrderData.vertical_id })

      return NextResponse.json({
        success: true,
        message: 'Order fulfilled. Payment is being transferred to your account.',
        completed: true,
        vendor_confirmed_at: now.toISOString()
      })
    } else {
      // EDGE CASE: Vendor fulfilling before buyer acknowledged
      // Just mark as fulfilled, buyer will acknowledge after
      crumb.supabase('update', 'order_items')
      await supabase
        .from('order_items')
        .update({
          status: 'fulfilled',
          pickup_confirmed_at: now.toISOString(),
        })
        .eq('id', orderItemId)

      return NextResponse.json({
        success: true,
        message: 'Marked as fulfilled. Waiting for buyer to acknowledge receipt.',
        completed: false
      })
    }
  })
}
