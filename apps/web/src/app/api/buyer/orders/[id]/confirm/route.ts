import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { transferToVendor, getChargeIdFromPaymentIntent } from '@/lib/stripe/payments'
import { withErrorTracing, traced, crumb, TracedError, logError } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { sendNotification } from '@/lib/notifications'
import { claimVendorFeeDeduction } from '@/lib/payments/vendor-fees'
import { calculateTipShare } from '@/lib/payments/tip-math'
import { CONFIRMATION_WINDOW_SECONDS, calculateWindowExpiry } from '@/lib/cron/order-timing'

interface RouteContext {
  params: Promise<{ id: string }>
}

// POST /api/buyer/orders/[id]/confirm - Buyer acknowledges they received an item
// Normal flow: Buyer acknowledges first (item is 'ready'), then vendor clicks Fulfill within 30 seconds
// Edge case: Vendor fulfilled first (item is 'fulfilled'), now buyer acknowledges to complete
export async function POST(request: NextRequest, context: RouteContext) {
  // Rate limit buyer confirmation requests
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`buyer-confirm:${clientIp}`, { limit: 30, windowSeconds: 60 })

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
          payment_method,
          payment_model,
          tip_amount,
          tip_on_platform_fee_cents,
          status
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

    const isExternalPayment = (order as any)?.payment_method && (order as any).payment_method !== 'stripe'

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

      const isCompanyPaid = (order as any)?.payment_model === 'company_paid'
      const serviceClient = createServiceClient()

      // VOR-1 FIX: For real-money Stripe orders, prove payment BEFORE completing the
      // item and transferring. This edge path pays the vendor out directly; without
      // the gate an unpaid order (orders are created 'pending' pre-payment) transfers
      // from the platform's OWN Stripe balance. Mirrors the gate in vendor fulfill.
      if (!isExternalPayment && !isCompanyPaid) {
        const orderIsPaid = ['paid', 'completed'].includes((order as any)?.status)
        if (!orderIsPaid) {
          crumb.supabase('select', 'payments (VOR-1 paid gate)')
          const { data: paidPayment } = await serviceClient
            .from('payments')
            .select('id')
            .eq('order_id', orderItem.order_id)
            .eq('status', 'succeeded')
            .maybeSingle()

          if (!paidPayment) {
            throw traced.validation('ERR_ORDER_007', 'This order has not been paid yet, so it cannot be completed.', {
              orderStatus: (order as any)?.status
            })
          }
        }
      }

      // Update with buyer confirmation and vendor confirmation (completing transaction).
      // VOR-2 FIX (defense-in-depth): guarded update — the status check above (:81) ran
      // on a fetch that may be stale; block the race where the item was cancelled or
      // refunded since (refund webhook sets status='refunded' WITHOUT cancelled_at).
      crumb.supabase('update', 'order_items')
      const { data: confirmedRows } = await supabase
        .from('order_items')
        .update({
          buyer_confirmed_at: now.toISOString(),
          vendor_confirmed_at: now.toISOString(), // Auto-complete since vendor already fulfilled
        })
        .eq('id', orderItemId)
        .eq('status', 'fulfilled')
        .is('cancelled_at', null)
        .select('id')

      if (!confirmedRows || confirmedRows.length === 0) {
        throw traced.validation('ERR_ORDER_003', 'This item can no longer be confirmed — it may have been cancelled or refunded.', {
          statusAtFetch: orderItem.status
        })
      }

      if (isExternalPayment) {
        // External payment: no Stripe transfer needed — fees handled via ledger
        crumb.logic('External payment order — skipping Stripe transfer')
        await supabase.rpc('atomic_complete_order_if_ready', { p_order_id: orderItem.order_id })

        return NextResponse.json({
          success: true,
          message: 'Receipt acknowledged. Transaction complete!',
          buyer_confirmed_at: now.toISOString(),
          completed: true
        })
      }

      // C1 FIX: Calculate tip share for this item.
      // VOR-4 FIX: vendor gets tip on food cost only — subtract the platform-fee
      // tip portion (mirrors fulfill). Was paying the FULL tip_amount → vendor
      // overpaid the platform's tip share on this edge path.
      let tipShareCents = 0
      if ((order as any)?.tip_amount && (order as any).tip_amount > 0) {
        const vendorTipCents = (order as any).tip_amount - ((order as any).tip_on_platform_fee_cents || 0)
        const { count: totalItemsInOrder } = await supabase
          .from('order_items')
          .select('id', { count: 'exact', head: true })
          .eq('order_id', orderItem.order_id)
        tipShareCents = calculateTipShare(vendorTipCents, totalItemsInOrder)
      }

      // Check if vendor was already paid (prevents double payout on race condition)
      crumb.supabase('select', 'vendor_payouts')
      // VOR-3: vendor_payouts is default-deny RLS with no INSERT policy; the
      // buyer client silently fails inserts. Use serviceClient (matches fulfill).
      const { data: existingPayout } = await serviceClient
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

        // VOR-8/VOR-9 FIX (mig 197): atomic claim-first fee deduction —
        // replaces read-compute-deduct + post-transfer recordFeeCredit (which
        // this route never even wrote on transfer failure → guaranteed
        // double-deduct after a Phase 5 retry). All three branches below
        // insert a payout row whose amount withholds the deduction (incl.
        // pending_stripe_setup, whose cron retry pays the recorded amount),
        // so the claim covers them all. Claim failure → deduct 0 + logError;
        // the fee stays on the ledger for a later payout.
        // F3/VOR-3 lineage: serviceClient required — buyer client can't read
        // vendor fee data (mig 046 RLS).
        const { grantedCents: feeDeductionCents, error: feeClaimErr } = await claimVendorFeeDeduction(
          serviceClient,
          vendorProfile.id,
          orderItem.order_id,
          orderItem.id,
          orderItem.vendor_payout_cents
        )
        if (feeClaimErr) {
          await logError(new TracedError('ERR_FEE_002', `Fee deduction claim failed for order item ${orderItem.id}: ${feeClaimErr}`, {
            route: '/api/buyer/orders/[id]/confirm', method: 'POST',
            orderItemId: orderItem.id, orderId: orderItem.order_id, vendorProfileId: vendorProfile.id,
          }))
        }
        if (feeDeductionCents > 0) {
          crumb.logic('Fee deduction claimed', { deduction: feeDeductionCents, payout: orderItem.vendor_payout_cents })
        }

        const actualPayoutCents = orderItem.vendor_payout_cents - feeDeductionCents + tipShareCents

        if (stripeReady) {
          // M-11 FIX: Insert payout record BEFORE transfer to prevent tracking gaps.
          // Pattern: insert 'pending' -> transfer -> update to 'processing' or 'failed'
          crumb.supabase('insert', 'vendor_payouts (pending)')
          const { data: payoutRecord, error: payoutInsertErr } = await serviceClient.from('vendor_payouts').insert({
            order_item_id: orderItem.id,
            vendor_profile_id: vendorProfile.id,
            amount_cents: actualPayoutCents,
            stripe_transfer_id: null,
            status: 'pending',
          }).select('id').single()

          if (payoutInsertErr && payoutInsertErr.code === '23505') {
            crumb.logic('Vendor payout already exists (concurrent insert), skipping transfer')
          } else if (payoutInsertErr) {
            // VOR-3 FIX: a non-duplicate insert failure must be fatal — transferring
            // without a tracking record leaves the payment invisible to the retry cron
            // and to reconciliation. No money moves untracked.
            throw traced.fromSupabase(payoutInsertErr, { table: 'vendor_payouts', operation: 'insert' })
          } else {
            try {
              // VOR-18 FIX: tie the transfer to the charge (Session-74 class) —
              // mirrors fulfill. Fetched here rather than reusing the VOR-1 gate's
              // row: the gate short-circuits on orders.status and never selects
              // the payment intent.
              let chargeId: string | undefined
              const { data: chargePayment } = await serviceClient
                .from('payments')
                .select('stripe_payment_intent_id')
                .eq('order_id', orderItem.order_id)
                .eq('status', 'succeeded')
                .maybeSingle()
              if (chargePayment?.stripe_payment_intent_id) {
                chargeId = (await getChargeIdFromPaymentIntent(chargePayment.stripe_payment_intent_id)) || undefined
              }

              const transfer = await transferToVendor({
                amount: actualPayoutCents,
                destination: vendorProfile.stripe_account_id,
                orderId: orderItem.order_id,
                orderItemId: orderItem.id,
                ...(chargeId !== undefined ? { sourceTransaction: chargeId } : {}),
              })

              crumb.supabase('update', 'vendor_payouts')
              if (payoutRecord) {
                await serviceClient.from('vendor_payouts')
                  .update({ stripe_transfer_id: transfer.id, status: 'processing', updated_at: new Date().toISOString() })
                  .eq('id', payoutRecord.id)
              }

              // Fee credit already claimed atomically above (mig 197) — no
              // post-transfer ledger write remains (VOR-9 class).
            } catch (transferError) {
              console.error('Stripe transfer failed:', transferError)
              // Update to failed for retry cron -- buyer did their part
              if (payoutRecord) {
                await serviceClient.from('vendor_payouts')
                  .update({ status: 'failed', updated_at: new Date().toISOString() })
                  .eq('id', payoutRecord.id)
              }
            }
          }
        } else if (isDev) {
          console.log(`[DEV] Skipping Stripe payout for order item ${orderItemId}`)
          crumb.supabase('insert', 'vendor_payouts')
          await serviceClient.from('vendor_payouts').insert({
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
          await serviceClient.from('vendor_payouts').insert({
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
      const windowExpires = calculateWindowExpiry(now)

      crumb.supabase('update', 'order_items')
      const { error: updateError } = await supabase
        .from('order_items')
        .update({
          buyer_confirmed_at: now.toISOString(),
          confirmation_window_expires_at: windowExpires
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
        const { data: buyerProfile } = await supabase
          .from('user_profiles')
          .select('display_name')
          .eq('user_id', user.id)
          .single()
        const verticalId = (order as { vertical_id?: string }).vertical_id
        await sendNotification(vendorProfile.user_id, 'pickup_confirmation_needed', {
          orderItemId,
          orderNumber: (order as { order_number: string }).order_number,
          ...(buyerProfile?.display_name ? { buyerName: buyerProfile.display_name } : {}),
        }, verticalId !== undefined ? { vertical: verticalId } : {})
      }

      return NextResponse.json({
        success: true,
        message: 'Receipt acknowledged. Vendor has 30 seconds to fulfill.',
        buyer_confirmed_at: now.toISOString(),
        confirmation_window_expires_at: windowExpires,
        completed: false
      })
    }
  })
}
