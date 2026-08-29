import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { transferToVendor, getChargeIdFromPaymentIntent } from '@/lib/stripe/payments'
import { getAccountStatus } from '@/lib/stripe/connect'
import { withErrorTracing, traced, crumb, TracedError, logError, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import {
  claimVendorFeeDeduction,
  recordExternalPaymentFee
} from '@/lib/payments/vendor-fees'
import { sendNotification } from '@/lib/notifications'
import { calculateTipShare } from '@/lib/payments/tip-math'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'
import { scheduleBuyerAchievementEvaluation } from '@/lib/loyalty/evaluate'

// Vercel Pro: fulfill involves Stripe transfer + fee calculation + notifications
export const maxDuration = 30

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit order fulfillment requests
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`vendor-fulfill:${clientIp}`, { limit: 30, windowSeconds: 60 })

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

    // Fetch order item first — RLS restricts to this vendor's items, and the joined
    // order row gives us the vertical_id needed for multi-vertical vendor_profiles lookup
    crumb.supabase('select', 'order_items')
    const { data: orderItem } = await observed(supabase
      .from('order_items')
      .select(`
        id, status, vendor_payout_cents, order_id, subtotal_cents, vendor_profile_id,
        buyer_confirmed_at, vendor_confirmed_at, confirmation_window_expires_at,
        order:orders!inner(id, order_number, buyer_user_id, vertical_id, payment_method, payment_model, tip_amount, tip_on_platform_fee_cents, status),
        listing:listings(title, vendor_profiles(profile_data))
      `)
      .eq('id', orderItemId)
      .single(), { table: 'order_items' })

    if (!orderItem) {
      throw traced.notFound('ERR_ORDER_001', 'Order item not found', { orderItemId })
    }

    const orderData = (orderItem as any).order as any

    // Get vendor profile for the order's vertical — multi-vertical safe
    crumb.supabase('select', 'vendor_profiles')
    const { profile: vendorProfile } = await getVendorProfileForVertical<{
      id: string
      stripe_account_id: string | null
      stripe_payouts_enabled: boolean | null
    }>(supabase, user.id, orderData.vertical_id, 'id, stripe_account_id, stripe_payouts_enabled')

    if (!vendorProfile) {
      throw traced.notFound('ERR_ORDER_001', 'Vendor not found')
    }

    // Defense in depth — verify the order_item belongs to this vendor
    if (orderItem.vendor_profile_id !== vendorProfile.id) {
      throw traced.notFound('ERR_ORDER_001', 'Order item not found', { orderItemId })
    }

    // Check if already fulfilled
    if (orderItem.vendor_confirmed_at) {
      throw traced.validation('ERR_ORDER_004', 'Already fulfilled', { vendor_confirmed_at: orderItem.vendor_confirmed_at })
    }

    const now = new Date()
    const buyerAlreadyAcknowledged = !!orderItem.buyer_confirmed_at

    const isExternalPayment = orderData?.payment_method && orderData.payment_method !== 'stripe'
    const isCompanyPaid = orderData?.payment_model === 'company_paid'
    const serviceClient = createServiceClient()

    // VOR-1 FIX: For real-money Stripe orders, prove payment BEFORE marking fulfilled
    // or transferring. Orders are created 'pending' pre-payment (checkout/session),
    // and item 'ready' + buyer acknowledgment do NOT prove the buyer paid. Without
    // this gate, an unpaid order's payout transfers from the platform's OWN Stripe
    // balance (no succeeded payment = no source_transaction). External-payment and
    // company-paid orders have no Stripe payment row by design — they are exempt.
    if (!isExternalPayment && !isCompanyPaid) {
      const orderIsPaid = ['paid', 'completed'].includes(orderData?.status)
      if (!orderIsPaid) {
        crumb.supabase('select', 'payments (VOR-1 paid gate)')
        const { data: paidPayment } = await observed(serviceClient
          .from('payments')
          .select('id')
          .eq('order_id', orderItem.order_id)
          .eq('status', 'succeeded')
          .maybeSingle(), { table: 'payments' })

        if (!paidPayment) {
          throw traced.validation('ERR_ORDER_007', 'This order has not been paid yet, so it cannot be fulfilled.', {
            orderStatus: orderData?.status
          })
        }
      }
    }

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
      const isProd = process.env.NODE_ENV === 'production'
      const isDev = !isProd
      const hasStripe = !!vendorProfile.stripe_account_id

      // Skip Stripe verification for external/company-paid orders (no Stripe transfer needed)
      if (!isExternalPayment && !isCompanyPaid && isProd && hasStripe && !vendorProfile.stripe_payouts_enabled) {
        crumb.logic('Cached stripe_payouts_enabled is falsy, checking live status')
        try {
          const liveStatus = await getAccountStatus(vendorProfile.stripe_account_id!)
          await supabase
            .from('vendor_profiles')
            .update({
              stripe_charges_enabled: liveStatus.chargesEnabled,
              stripe_payouts_enabled: liveStatus.payoutsEnabled,
              stripe_onboarding_complete: liveStatus.detailsSubmitted,
            })
            .eq('id', vendorProfile.id)

          if (!liveStatus.payoutsEnabled) {
            throw traced.validation('ERR_ORDER_005', 'Your Stripe account is not yet enabled for payouts. Please complete your Stripe verification before fulfilling orders.')
          }
        } catch (err) {
          if (err && typeof err === 'object' && 'code' in err) throw err
          console.error('Stripe live status check failed:', err)
        }
      }

      // Complete the transaction and trigger payment.
      // VOR-2 FIX: guarded update — only a live 'ready' item can be fulfilled.
      // Buyer ack requires status ready/fulfilled (buyer/confirm:81) and fulfilled-with-ack
      // is rejected above, so 'ready' is the only legit state here. The guard closes the
      // race where the item was cancelled/refunded after the fetch above (refund webhook
      // sets status='refunded' WITHOUT cancelled_at, so both conditions are needed).
      crumb.supabase('update', 'order_items')
      const { data: fulfilledRows } = await observed(supabase
        .from('order_items')
        .update({
          status: 'fulfilled',
          vendor_confirmed_at: now.toISOString(),
          pickup_confirmed_at: now.toISOString(),
          confirmation_window_expires_at: null,
        })
        .eq('id', orderItemId)
        .eq('status', 'ready')
        .is('cancelled_at', null)
        .select('id'), { table: 'order_items', operation: 'update' })

      if (!fulfilledRows || fulfilledRows.length === 0) {
        throw traced.validation('ERR_ORDER_004', 'This item can no longer be fulfilled — it may have been cancelled or refunded.', {
          statusAtFetch: orderItem.status
        })
      }

      // Loyalty Layer 1 — badge/segment evaluation is scheduled to run AFTER
      // the response (never on the payout path). The scheduler swallows the
      // no-request-scope throw and the evaluator never throws, so nothing here
      // can reach the transfer below. Owner-approved per-file change 2026-08-25.
      if (orderData?.buyer_user_id && orderData?.vertical_id) {
        scheduleBuyerAchievementEvaluation(orderData.buyer_user_id, orderData.vertical_id)
      }

      // Company-paid event orders: no Stripe transfer, no external fee recording.
      // Platform fee already calculated in create_company_paid_order RPC (6.5%).
      // Vendor payout comes through organizer settlement, not Stripe transfer.
      if (isCompanyPaid) {
        crumb.logic('Company-paid event order — no Stripe transfer needed')

        await supabase.rpc('atomic_complete_order_if_ready', { p_order_id: orderItem.order_id })

        const cpListing = (orderItem as any).listing as any
        const cpVendorName = cpListing?.vendor_profiles?.profile_data?.business_name || 'Vendor'
        await sendNotification(orderData.buyer_user_id, 'order_fulfilled', {
          orderNumber: orderData.order_number,
          orderId: orderData.id,
          vendorName: cpVendorName,
          itemTitle: cpListing?.title,
        }, { vertical: orderData.vertical_id })

        return NextResponse.json({
          success: true,
          message: 'Order fulfilled. This is a company-paid event order.',
          completed: true,
          vendor_confirmed_at: now.toISOString()
        })
      }

      if (isExternalPayment) {
        // External payment: no Stripe transfer needed
        crumb.logic('External payment order — skipping Stripe transfer')

        // Cash orders: record platform fees now (deferred from confirm time)
        if (orderData.payment_method === 'cash') {
          crumb.logic('Cash order — recording deferred platform fees')
          const feeServiceClient = createServiceClient()
          await recordExternalPaymentFee(
            feeServiceClient,
            (orderItem as any).vendor_profile_id,
            orderItem.order_id,
            orderItem.id,
            (orderItem as any).subtotal_cents
          )
        }

        // Atomically mark order completed if all items are fully confirmed
        crumb.logic('Checking atomic order completion')
        await supabase.rpc('atomic_complete_order_if_ready', { p_order_id: orderItem.order_id })

        // Notify buyer that order is fulfilled
        const fulfillListing = (orderItem as any).listing as any
        const fulfillVendorName = fulfillListing?.vendor_profiles?.profile_data?.business_name || 'Vendor'
        await sendNotification(orderData.buyer_user_id, 'order_fulfilled', {
          orderNumber: orderData.order_number,
          orderId: orderData.id,
          vendorName: fulfillVendorName,
          itemTitle: fulfillListing?.title,
        }, { vertical: orderData.vertical_id })

        return NextResponse.json({
          success: true,
          message: 'Order fulfilled. External payment was already confirmed.',
          completed: true,
          vendor_confirmed_at: now.toISOString()
        })
      }

      crumb.logic('Processing vendor payout')

      // VOR-13: tip count + prior-payout check are independent reads — parallel.
      const [tipCountResult, existingPayoutResult] = await Promise.all([
        orderData?.tip_amount && orderData.tip_amount > 0
          ? supabase
              .from('order_items')
              .select('id', { count: 'exact', head: true })
              .eq('order_id', orderItem.order_id)
          : Promise.resolve({ count: null }),
        supabase
          .from('vendor_payouts')
          .select('id, status')
          .eq('order_item_id', orderItem.id)
          .neq('status', 'failed')
          .maybeSingle(),
      ])

      // C1 FIX: Calculate tip share for this item
      // Vendor gets tip on food cost only (total tip minus platform fee tip portion)
      let tipShareCents = 0
      if (orderData?.tip_amount && orderData.tip_amount > 0) {
        const vendorTipCents = orderData.tip_amount - (orderData.tip_on_platform_fee_cents || 0)
        tipShareCents = calculateTipShare(vendorTipCents, tipCountResult.count)
        crumb.logic('Tip share calculated', {
          totalTip: orderData.tip_amount,
          platformFeeTip: orderData.tip_on_platform_fee_cents || 0,
          vendorTip: vendorTipCents,
          items: tipCountResult.count,
          share: tipShareCents
        })
      }

      // C2 FIX: Check if vendor was already paid (prevents double payout).
      // Must stay BEFORE the fee claim — an already-paid item must not claim
      // a deduction it will never withhold.
      const existingPayout = existingPayoutResult.data
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

      // Moved up from the payout tail: never claim a fee deduction on a path
      // that cannot create a payout.
      if (!hasStripe && !isDev) {
        throw traced.validation('ERR_ORDER_004', 'Stripe account not connected')
      }

      // VOR-8/VOR-9 FIX (mig 197): atomic claim-first fee deduction. The RPC
      // locks the vendor's balance row, grants LEAST(balance, 50% of payout),
      // and writes the ledger credit in one transaction — concurrent payouts
      // can't double-deduct, and the credit can't be lost after the transfer.
      // Claim failure → deduct 0 (fee stays on the ledger for a later payout);
      // logError so the missed collection is visible.
      const { grantedCents: feeDeductionCents, error: feeClaimErr } = await claimVendorFeeDeduction(
        serviceClient,
        vendorProfile.id,
        orderItem.order_id,
        orderItem.id,
        orderItem.vendor_payout_cents
      )
      if (feeClaimErr) {
        await logError(new TracedError('ERR_FEE_002', `Fee deduction claim failed for order item ${orderItem.id}: ${feeClaimErr}`, {
          route: '/api/vendor/orders/[id]/fulfill', method: 'POST',
          orderItemId: orderItem.id, orderId: orderItem.order_id, vendorProfileId: vendorProfile.id,
        }))
      }
      if (feeDeductionCents > 0) {
        crumb.logic('Fee deduction claimed', { deduction: feeDeductionCents, payout: orderItem.vendor_payout_cents })
      }

      const actualPayoutCents = orderItem.vendor_payout_cents - feeDeductionCents + tipShareCents

      if (hasStripe) {
        // M-11 FIX: Insert payout record BEFORE transfer to prevent tracking gaps.
        // If transfer succeeds but DB insert fails, we'd have no record of the payment.
        // Pattern: insert 'pending' -> transfer -> update to 'processing' or 'failed'
        // Uses serviceClient — vendor_payouts has no INSERT RLS policy (system-managed table)
        crumb.supabase('insert', 'vendor_payouts (pending)')
        const { data: payoutRecord, error: payoutInsertErr } = await serviceClient.from('vendor_payouts').insert({
          order_item_id: orderItem.id,
          vendor_profile_id: vendorProfile.id,
          amount_cents: actualPayoutCents,
          stripe_transfer_id: null,
          status: 'pending',
        }).select('id').single()

        if (payoutInsertErr) {
          if (payoutInsertErr.code === '23505') {
            crumb.logic('Vendor payout already exists (concurrent insert), skipping transfer')
            return NextResponse.json({
              success: true,
              message: 'Order fulfilled. Payment was already processed.',
              completed: true,
              vendor_confirmed_at: now.toISOString()
            })
          }
          // VOR-15 FIX: a non-duplicate insert failure must be fatal — continuing
          // fired the transfer with payoutRecord=null → money moved with no
          // tracking record, invisible to the retry cron and reconciliation
          // (mirrors the VOR-3 fix in buyer-confirm). No money moves untracked.
          throw traced.fromSupabase(payoutInsertErr, { table: 'vendor_payouts', operation: 'insert' })
        }

        try {
          // Get charge ID from payment intent — allows transfer from pending funds
          let chargeId: string | undefined
          const { data: payment } = await observed(serviceClient
            .from('payments')
            .select('stripe_payment_intent_id')
            .eq('order_id', orderItem.order_id)
            .eq('status', 'succeeded')
            .maybeSingle(), { table: 'payments' })

          if (payment?.stripe_payment_intent_id) {
            chargeId = (await getChargeIdFromPaymentIntent(payment.stripe_payment_intent_id)) || undefined
          }

          const transfer = await transferToVendor({
            amount: actualPayoutCents,
            destination: vendorProfile.stripe_account_id!,
            orderId: orderItem.order_id,
            orderItemId: orderItem.id,
            ...(chargeId !== undefined ? { sourceTransaction: chargeId } : {}),
          })

          // Fee credit already claimed atomically above (mig 197) — no
          // post-transfer ledger write remains to fail or be swallowed (VOR-9).
          crumb.supabase('update', 'vendor_payouts')
          if (payoutRecord) {
            await serviceClient.from('vendor_payouts')
              .update({ stripe_transfer_id: transfer.id, status: 'processing', updated_at: new Date().toISOString() })
              .eq('id', payoutRecord.id)
          }
        } catch (transferError) {
          // H-1 FIX: Keep item 'fulfilled' — payout failure != fulfillment failure.
          // Update payout record to 'failed' so Phase 5 cron retries the transfer automatically.
          crumb.logic('Stripe transfer failed, marking payout as failed for retry')
          console.error('Stripe transfer failed:', transferError)

          if (payoutRecord) {
            await serviceClient.from('vendor_payouts')
              .update({ status: 'failed', updated_at: new Date().toISOString() })
              .eq('id', payoutRecord.id)
          }

          // Fee credit already claimed pre-transfer (mig 197); the failed
          // payout row withholds the deduction, so the Phase 5 retry pays the
          // reduced amount — semantics unchanged from the old failure path.

          // Don't notify vendor about payout failure during fulfill — it's confusing.
          // Phase 5 cron will retry the transfer and notify if it keeps failing.
          console.warn(`[PAYOUT] Transfer failed for order ${orderData?.order_number}, will retry via Phase 5 cron`)

          // Atomically mark order completed — fulfillment succeeded even though payout failed
          await supabase.rpc('atomic_complete_order_if_ready', { p_order_id: orderItem.order_id })

          // Notify buyer that order is fulfilled (payout issue is vendor-side only)
          const failedListing = (orderItem as any).listing as any
          const failedVendorName = failedListing?.vendor_profiles?.profile_data?.business_name || 'Vendor'
          await sendNotification(orderData.buyer_user_id, 'order_fulfilled', {
            orderNumber: orderData.order_number,
            orderId: orderData.id,
            vendorName: failedVendorName,
            itemTitle: failedListing?.title,
          }, { vertical: orderData.vertical_id })

          return NextResponse.json({
            success: true,
            message: 'Order fulfilled. Payment transfer failed but will be retried automatically.',
            completed: true,
            vendor_confirmed_at: now.toISOString(),
            payoutStatus: 'failed_will_retry',
          })
        }
      } else if (isDev) {
        // Dev mode without Stripe (fee credit already claimed above — mig 197)
        console.log(`[DEV] Skipping Stripe payout for order item ${orderItemId}`)
        crumb.supabase('insert', 'vendor_payouts')
        await supabase.from('vendor_payouts').insert({
          order_item_id: orderItem.id,
          vendor_profile_id: vendorProfile.id,
          amount_cents: actualPayoutCents,
          stripe_transfer_id: `dev_skip_${orderItemId}`,
          status: 'skipped_dev',
        })
      }
      // (The no-Stripe/no-dev throw moved above the fee claim — a path that
      // cannot pay out must never claim a deduction.)

      // Atomically mark order completed if all items are fully confirmed
      crumb.logic('Checking atomic order completion')
      await supabase.rpc('atomic_complete_order_if_ready', { p_order_id: orderItem.order_id })

      // Notify buyer that order is fulfilled
      const fulfillOrderData = (orderItem as any).order as any
      const fulfillListing = (orderItem as any).listing as any
      const fulfillVendorName = fulfillListing?.vendor_profiles?.profile_data?.business_name || 'Vendor'
      await sendNotification(fulfillOrderData.buyer_user_id, 'order_fulfilled', {
        orderNumber: fulfillOrderData.order_number,
        orderId: fulfillOrderData.id,
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
      // Just mark as fulfilled, buyer will acknowledge after.
      // VOR-2 FIX: guarded update — a cancelled/refunded item must not flip back to
      // 'fulfilled' (buyer keeps the refund AND the vendor gets paid at buyer-confirm).
      // 'pending' stays allowed: direct pending→fulfilled is live behavior (VOR-11).
      crumb.supabase('update', 'order_items')
      const { data: updatedRows } = await observed(supabase
        .from('order_items')
        .update({
          status: 'fulfilled',
          pickup_confirmed_at: now.toISOString(),
        })
        .eq('id', orderItemId)
        .in('status', ['pending', 'confirmed', 'ready'])
        .is('cancelled_at', null)
        .select('id'), { table: 'order_items', operation: 'update' })

      if (!updatedRows || updatedRows.length === 0) {
        throw traced.validation('ERR_ORDER_004', 'This item can no longer be fulfilled — it may have been cancelled or refunded.', {
          statusAtFetch: orderItem.status
        })
      }

      // Loyalty Layer 1 — badge/segment evaluation is scheduled to run AFTER
      // the response (never on the payout path). The scheduler swallows the
      // no-request-scope throw and the evaluator never throws, so nothing here
      // can reach the transfer below. Owner-approved per-file change 2026-08-25.
      if (orderData?.buyer_user_id && orderData?.vertical_id) {
        scheduleBuyerAchievementEvaluation(orderData.buyer_user_id, orderData.vertical_id)
      }

      return NextResponse.json({
        success: true,
        message: 'Marked as fulfilled. Waiting for buyer to acknowledge receipt.',
        completed: false
      })
    }
  })
}
