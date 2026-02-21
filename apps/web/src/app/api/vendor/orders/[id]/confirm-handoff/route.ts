import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { transferToVendor } from '@/lib/stripe/payments'
import { getAccountStatus } from '@/lib/stripe/connect'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { sendNotification } from '@/lib/notifications'
import {
  getVendorFeeBalance,
  calculateAutoDeductAmount,
  recordFeeCredit
} from '@/lib/payments/vendor-fees'

interface RouteContext {
  params: Promise<{ id: string }>
}

// POST /api/vendor/orders/[id]/confirm-handoff
// Vendor counter-confirms that they handed off items to the buyer.
// This triggers the Stripe transfer to the vendor.
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: orderItemId } = await context.params

  return withErrorTracing('/api/vendor/orders/[id]/confirm-handoff', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-confirm-handoff:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

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

    // Get order item with buyer/order info for notification
    crumb.supabase('select', 'order_items')
    const { data: orderItem, error: fetchError } = await supabase
      .from('order_items')
      .select(`
        id, status, vendor_payout_cents, order_id,
        buyer_confirmed_at, vendor_confirmed_at, vendor_profile_id,
        order:orders!inner(id, order_number, buyer_user_id, vertical_id, payment_method, tip_amount, tip_on_platform_fee_cents),
        listing:listings(title, vendor_profiles(profile_data))
      `)
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
    const handoffOrderData = (orderItem as any).order as any
    const isExternalPayment = handoffOrderData?.payment_method && handoffOrderData.payment_method !== 'stripe'

    // Verify Stripe is ready BEFORE marking fulfilled (skip for external payment orders)
    const isProd = process.env.NODE_ENV === 'production'
    const isDev = !isProd
    const hasStripe = !!vendorProfile.stripe_account_id

    if (!isExternalPayment && isProd && hasStripe && !vendorProfile.stripe_payouts_enabled) {
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
          throw traced.validation('ERR_ORDER_005', 'Your Stripe account is not yet enabled for payouts. Please complete your Stripe verification before confirming handoffs.')
        }
      } catch (err) {
        if (err && typeof err === 'object' && 'code' in err) throw err
        console.error('Stripe live status check failed:', err)
      }
    }

    // Set vendor confirmation and clear lockdown
    crumb.supabase('update', 'order_items')
    await supabase
      .from('order_items')
      .update({
        vendor_confirmed_at: now.toISOString(),
        lockdown_active: false,
        lockdown_initiated_at: null,
        status: 'fulfilled'
      })
      .eq('id', orderItemId)

    if (isExternalPayment) {
      // External payment: no Stripe transfer needed — fees handled via ledger
      crumb.logic('External payment order — skipping Stripe transfer')
      await supabase.rpc('atomic_complete_order_if_ready', { p_order_id: orderItem.order_id })

      const handoffListing = (orderItem as any).listing as any
      const handoffVendorName = handoffListing?.vendor_profiles?.profile_data?.business_name || 'Vendor'
      await sendNotification(handoffOrderData.buyer_user_id, 'order_fulfilled', {
        orderNumber: handoffOrderData.order_number,
        vendorName: handoffVendorName,
        itemTitle: handoffListing?.title,
      }, { vertical: handoffOrderData.vertical_id })

      return NextResponse.json({
        success: true,
        message: 'Handoff confirmed. External payment was already confirmed.',
        vendor_confirmed_at: now.toISOString()
      })
    }

    // Trigger Stripe transfer to vendor
    crumb.logic('Processing vendor payout')

    // C1 FIX: Calculate tip share for this item
    // Vendor gets tip on food cost only (total tip minus platform fee tip portion)
    let tipShareCents = 0
    if (handoffOrderData?.tip_amount && handoffOrderData.tip_amount > 0) {
      const vendorTipCents = handoffOrderData.tip_amount - (handoffOrderData.tip_on_platform_fee_cents || 0)
      const { count: totalItemsInOrder } = await supabase
        .from('order_items')
        .select('id', { count: 'exact', head: true })
        .eq('order_id', orderItem.order_id)
      tipShareCents = totalItemsInOrder
        ? Math.round(vendorTipCents / totalItemsInOrder)
        : 0
      crumb.logic('Tip share calculated', {
        totalTip: handoffOrderData.tip_amount,
        platformFeeTip: handoffOrderData.tip_on_platform_fee_cents || 0,
        vendorTip: vendorTipCents,
        items: totalItemsInOrder,
        share: tipShareCents
      })
    }

    // F3 FIX: Check for outstanding fee balance and calculate deduction (consistent with fulfill route)
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

    const actualPayoutCents = orderItem.vendor_payout_cents - feeDeductionCents + tipShareCents

    // C3 FIX: Check if vendor was already paid (prevents double payout)
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
        message: 'Handoff confirmed. Payment was already processed.',
        vendor_confirmed_at: now.toISOString()
      })
    }

    let payoutFailed = false
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

        // F3 FIX: Record fee credit if deduction was made
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
        console.error('Stripe transfer failed:', transferError)
        payoutFailed = true
        // Record failed payout for retry cron — handoff already happened
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
    } else {
      throw traced.validation('ERR_ORDER_004', 'Stripe account not connected')
    }

    // Atomically mark order completed if all items are fully confirmed
    crumb.logic('Checking atomic order completion')
    await supabase.rpc('atomic_complete_order_if_ready', { p_order_id: orderItem.order_id })

    // Notify buyer that order is fulfilled
    const stripeHandoffListing = (orderItem as any).listing as any
    const stripeHandoffVendorName = stripeHandoffListing?.vendor_profiles?.profile_data?.business_name || 'Vendor'
    await sendNotification(handoffOrderData.buyer_user_id, 'order_fulfilled', {
      orderNumber: handoffOrderData.order_number,
      vendorName: stripeHandoffVendorName,
      itemTitle: stripeHandoffListing?.title,
    }, { vertical: handoffOrderData.vertical_id })

    return NextResponse.json({
      success: true,
      message: payoutFailed
        ? 'Handoff confirmed. Payment transfer encountered an issue and will be retried automatically.'
        : 'Handoff confirmed. Payment is being transferred to your account.',
      payoutFailed,
      vendor_confirmed_at: now.toISOString()
    })
  })
}
