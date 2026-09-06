import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createRefund, transferToVendor, getChargeIdFromPaymentIntent } from '@/lib/stripe/payments'
import { stripe } from '@/lib/stripe/config'
import { withErrorTracing, traced, crumb, TracedError, logError, observed } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'
import { restoreInventory } from '@/lib/inventory'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { calculateBundleCancellation, CANCELLATION_FEE_PERCENT } from '@/lib/payments/cancellation-fees'
import { marginWithBuyerFeeCents } from '@/lib/bundles/core'

/**
 * POST /api/buyer/orders/[id]/cancel-bundle — [id] is the ORDER id.
 *
 * All-or-nothing bundle cancellation (owner rulings 2026-09-06):
 *  - a bundle is ONE product — no per-item cancels; this cancels every item.
 *  - fee test at BUNDLE level: within grace (order-creation clock) OR no
 *    vendor confirmed → 100% refund of everything; past grace with ANY
 *    vendor confirmed → 25% fee on the whole total (margin included).
 *    Tip always refunds in full (VOR-16 house rule).
 *  - fee's vendor share goes only to vendors who confirmed (they prepped).
 *  - available only until collection begins: any item fulfilled or
 *    manager-acknowledged closes this door (manager/support handles from
 *    there). The margin was never transferred pre-handoff (no-clawback
 *    invariant), so its refund is clean platform-side money.
 *  - releases the bundle's sold slot (atomic_release_bundle_sold).
 *
 * Math: calculateBundleCancellation (spec-tested in
 * lib/payments/__tests__/bundle-cancellation.test.ts). Refund/transfer
 * mechanics mirror the per-item buyer cancel route (guarded flips,
 * deterministic refund keys, payout-row-before-transfer).
 */
export const maxDuration = 60

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: orderId } = await context.params

  return withErrorTracing('/api/buyer/orders/[id]/cancel-bundle', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`buyer-bundle-cancel:${clientIp}`, rateLimits.submit)
    if (!rl.success) return rateLimitResponse(rl)

    const supabase = await createClient()
    crumb.auth('Checking user authentication')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    let reason = ''
    try { reason = ((await request.json())?.reason as string) || '' } catch { /* no body */ }

    const serviceClient = createServiceClient()

    crumb.supabase('select', 'orders (cancel-bundle)')
    const { data: order } = await observed(serviceClient
      .from('orders')
      .select('id, buyer_user_id, status, small_order_fee_cents, tip_amount, stripe_checkout_session_id, created_at, order_number, vertical_id, bundle_id, bundle_margin_cents, bundle_handed_off_at')
      .eq('id', orderId)
      .maybeSingle(), { table: 'orders' })
    if (!order || order.buyer_user_id !== user.id) {
      throw traced.auth('ERR_AUTH_002', 'Not authorized for this order')
    }
    if (!order.bundle_id) {
      return NextResponse.json({ error: 'Not a bundle order' }, { status: 404 })
    }
    if (order.status === 'cancelled') {
      return NextResponse.json({ error: 'This order is already cancelled.' }, { status: 409 })
    }
    if (order.bundle_handed_off_at) {
      return NextResponse.json({ error: 'This bundle has already been handed off — it can no longer be cancelled.' }, { status: 409 })
    }

    crumb.supabase('select', 'order_items (cancel-bundle)')
    const { data: allItems } = await observed(serviceClient
      .from('order_items')
      .select('id, status, quantity, subtotal_cents, cancelled_at, buyer_confirmed_at, listing_id, vendor_profile_id')
      .eq('order_id', orderId), { table: 'order_items' })
    const liveItems = (allItems ?? []).filter(i => !i.cancelled_at)
    if (liveItems.length === 0) {
      return NextResponse.json({ error: 'Nothing left to cancel on this order.' }, { status: 409 })
    }
    // Collection cutoff: once the manager has started receiving items (any
    // fulfilled, or any manager acknowledge in flight), the buyer's window
    // is closed — one product, and its parts are physically in motion.
    if (liveItems.some(i => i.status === 'fulfilled' || i.buyer_confirmed_at)) {
      return NextResponse.json(
        { error: 'The market manager has started collecting this bundle — it can no longer be cancelled from here. Contact the market for help.' },
        { status: 409 }
      )
    }

    // Bundle-level fee math (spec-tested).
    const marginAddendCents = marginWithBuyerFeeCents((order.bundle_margin_cents as number) || 0)
    const calc = calculateBundleCancellation({
      items: liveItems.map(i => ({ id: i.id as string, subtotalCents: i.subtotal_cents as number, status: i.status as string })),
      totalItemsInOrder: (allItems ?? []).length || 1,
      orderCreatedAt: order.created_at ? new Date(order.created_at as string) : new Date(),
      vertical: order.vertical_id as string,
      smallOrderFeeCents: (order.small_order_fee_cents as number) || 0,
      marginAddendCents,
    })

    // Guarded per-item flips — only items that win the race proceed.
    const nowIso = new Date().toISOString()
    const flippedIds: string[] = []
    for (const item of liveItems) {
      const per = calc.perItem.find(p => p.id === item.id)!
      const { data: flipped, error: flipErr } = await serviceClient
        .from('order_items')
        .update({
          status: 'cancelled',
          cancelled_at: nowIso,
          cancelled_by: 'buyer',
          cancellation_reason: reason || 'Bundle cancelled by buyer',
          refund_amount_cents: per.refundCents,
          cancellation_fee_cents: per.feeCents,
        })
        .eq('id', item.id)
        .is('cancelled_at', null)
        .select('id')
      if (flipErr) throw traced.fromSupabase(flipErr, { table: 'order_items', operation: 'update' })
      if (flipped && flipped.length > 0) {
        flippedIds.push(item.id as string)
        if (item.listing_id) {
          await restoreInventory(serviceClient, item.listing_id as string, (item.quantity as number) || 1)
        }
      }
    }
    if (flippedIds.length === 0) {
      return NextResponse.json({ error: 'This bundle has already been cancelled.' }, { status: 409 })
    }

    // Release the bundle's sold slot (v1: one copy per order; floor-at-0 RPC).
    crumb.supabase('rpc', 'atomic_release_bundle_sold')
    const { error: releaseErr } = await serviceClient.rpc('atomic_release_bundle_sold', {
      p_bundle_id: order.bundle_id,
      p_quantity: 1,
    })
    if (releaseErr) console.error('[cancel-bundle] slot release failed:', releaseErr.message)

    // Order-level wrap-up: expire a live session on a still-pending order
    // BEFORE cancelling (VOR-19 pattern), then flip the order.
    let skipOrderCancel = false
    if (order.status === 'pending' && order.stripe_checkout_session_id) {
      try {
        await stripe.checkout.sessions.expire(order.stripe_checkout_session_id as string)
      } catch (expireErr) {
        await logError(new TracedError('ERR_CHECKOUT_005', `Session expire failed on bundle cancel of pending order ${orderId}: ${expireErr instanceof Error ? expireErr.message : String(expireErr)}`, {
          route: '/api/buyer/orders/[id]/cancel-bundle', method: 'POST',
        }))
        skipOrderCancel = true
      }
    }
    if (!skipOrderCancel) {
      // Guarded flip — never clobber a webhook race (refunded/completed).
      await serviceClient.from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId)
        .in('status', ['pending', 'paid'])
    }

    // Refunds — only with a real succeeded payment (pay-later/pending orders
    // have nothing to refund).
    let refundFailures = 0
    crumb.supabase('select', 'payments (cancel-bundle)')
    const { data: payment } = await observed(serviceClient
      .from('payments')
      .select('stripe_payment_intent_id')
      .eq('order_id', orderId)
      .eq('status', 'succeeded')
      .maybeSingle(), { table: 'payments' })

    if (payment?.stripe_payment_intent_id) {
      // Per-item refunds (deterministic key = item id, same as single cancel).
      for (const per of calc.perItem) {
        if (!flippedIds.includes(per.id) || per.refundCents <= 0) continue
        try {
          await createRefund(payment.stripe_payment_intent_id, per.id, per.refundCents)
          // Guarded: only the cancelled row this route just flipped.
          await serviceClient.from('order_items')
            .update({ status: 'refunded' })
            .eq('id', per.id)
            .eq('status', 'cancelled')
        } catch (refundErr) {
          refundFailures++
          await logError(new TracedError('ERR_REFUND_001', `Bundle-cancel item refund failed (item ${per.id}, ${per.refundCents}¢): ${refundErr instanceof Error ? refundErr.message : String(refundErr)}`, {
            route: '/api/buyer/orders/[id]/cancel-bundle', method: 'POST', orderId, orderItemId: per.id, amountCents: per.refundCents,
          }))
        }
      }
      // Margin refund — never transferred pre-handoff, so this returns
      // platform-held money. Deterministic key dedups any retry.
      if (calc.marginRefundCents > 0) {
        try {
          await createRefund(payment.stripe_payment_intent_id, `${orderId}-bundle-margin`, calc.marginRefundCents)
        } catch (marginErr) {
          refundFailures++
          await logError(new TracedError('ERR_REFUND_001', `Bundle-cancel margin refund failed (${calc.marginRefundCents}¢): ${marginErr instanceof Error ? marginErr.message : String(marginErr)}`, {
            route: '/api/buyer/orders/[id]/cancel-bundle', method: 'POST', orderId, amountCents: calc.marginRefundCents,
          }))
        }
      }
      // Tip — always refunds in full (VOR-16), same deterministic key as the
      // other last-item paths so cross-path races dedup at Stripe.
      const tipCents = (order.tip_amount as number | null) || 0
      if (tipCents > 0) {
        try {
          await createRefund(payment.stripe_payment_intent_id, `${orderId}-order-fees`, tipCents)
        } catch (tipErr) {
          refundFailures++
          await logError(new TracedError('ERR_REFUND_001', `Bundle-cancel tip refund failed (${tipCents}¢): ${tipErr instanceof Error ? tipErr.message : String(tipErr)}`, {
            route: '/api/buyer/orders/[id]/cancel-bundle', method: 'POST', orderId, amountCents: tipCents,
          }))
        }
      }

      // Fee vendor shares — only vendors who confirmed (payout row BEFORE
      // transfer; failures land in Phase 5 retry, mirrors the single cancel).
      const confirmedShares = calc.perItem.filter(p => flippedIds.includes(p.id) && p.vendorShareCents > 0)
      if (confirmedShares.length > 0) {
        let chargeId: string | undefined
        try {
          chargeId = (await getChargeIdFromPaymentIntent(payment.stripe_payment_intent_id)) || undefined
        } catch { /* transfer falls back to platform balance guard below */ }
        for (const per of confirmedShares) {
          const item = liveItems.find(i => i.id === per.id)
          if (!item?.vendor_profile_id) continue
          const { data: vp } = await observed(serviceClient
            .from('vendor_profiles')
            .select('id, stripe_account_id, stripe_payouts_enabled')
            .eq('id', item.vendor_profile_id)
            .maybeSingle(), { table: 'vendor_profiles' })
          if (!vp?.stripe_account_id || !vp.stripe_payouts_enabled) continue
          const { data: payoutRecord } = await observed(serviceClient.from('vendor_payouts').insert({
            order_item_id: per.id,
            vendor_profile_id: vp.id,
            amount_cents: per.vendorShareCents,
            stripe_transfer_id: null,
            status: 'pending',
          }).select('id').single(), { table: 'vendor_payouts', operation: 'insert' })
          try {
            const transfer = await transferToVendor({
              amount: per.vendorShareCents,
              destination: vp.stripe_account_id as string,
              orderId,
              orderItemId: per.id,
              ...(chargeId !== undefined ? { sourceTransaction: chargeId } : {}),
            })
            if (payoutRecord) {
              await serviceClient.from('vendor_payouts')
                .update({ stripe_transfer_id: transfer.id, status: 'processing', updated_at: new Date().toISOString() })
                .eq('id', payoutRecord.id)
            }
          } catch (transferErr) {
            await logError(new TracedError('ERR_REFUND_001', `Bundle-cancel fee vendor-share transfer failed (item ${per.id}, ${per.vendorShareCents}¢): ${transferErr instanceof Error ? transferErr.message : String(transferErr)}`, {
              route: '/api/buyer/orders/[id]/cancel-bundle', method: 'POST', orderId, orderItemId: per.id, amountCents: per.vendorShareCents,
            }))
            if (payoutRecord) {
              await serviceClient.from('vendor_payouts')
                .update({ status: 'failed', updated_at: new Date().toISOString() })
                .eq('id', payoutRecord.id)
            }
          }
        }
      }
    }

    // Notifications — vendors (their items vanished) + the market manager.
    try {
      const { data: bundle } = await observed(serviceClient
        .from('market_bundles')
        .select('id, name, market_id')
        .eq('id', order.bundle_id)
        .maybeSingle(), { table: 'market_bundles' })
      const vendorProfileIds = [...new Set(liveItems.filter(i => flippedIds.includes(i.id as string)).map(i => i.vendor_profile_id as string).filter(Boolean))]
      const { data: vps } = vendorProfileIds.length
        ? await observed(serviceClient.from('vendor_profiles').select('id, user_id').in('id', vendorProfileIds), { table: 'vendor_profiles' })
        : { data: [] }
      await Promise.all([
        ...((vps ?? []) as Array<{ user_id: string | null }>).filter(v => v.user_id).map(v =>
          sendNotification(v.user_id as string, 'order_cancelled_by_buyer', {
            itemTitle: bundle?.name ? `Bundle: ${bundle.name}` : 'Market bundle',
            ...(order.order_number ? { orderNumber: order.order_number as string } : {}),
            ...(reason ? { reason } : {}),
          }, { vertical: order.vertical_id as string })),
        (async () => {
          if (!bundle) return
          const { data: market } = await observed(serviceClient
            .from('markets')
            .select('id, name, manager_user_id')
            .eq('id', bundle.market_id)
            .maybeSingle(), { table: 'markets' })
          if (market?.manager_user_id) {
            await sendNotification(market.manager_user_id as string, 'bundle_cancelled', {
              orderNumber: (order.order_number as string) || '',
              bundleName: (bundle.name as string) || 'Bundle',
              marketId: market.id as string,
              ...(reason ? { reason } : {}),
            }, { vertical: order.vertical_id as string })
          }
        })(),
      ])
    } catch (notifErr) {
      console.error('[cancel-bundle] notification block failed:', notifErr instanceof Error ? notifErr.message : 'Unknown')
    }

    return NextResponse.json({
      success: true,
      message: calc.feeApplied
        ? `Bundle cancelled. A ${CANCELLATION_FEE_PERCENT}% cancellation fee was applied — you'll be refunded $${((calc.totalRefundCents + ((order.tip_amount as number | null) || 0)) / 100).toFixed(2)}.`
        : 'Bundle cancelled. Your full refund is on the way.',
      fee_applied: calc.feeApplied,
      within_grace_period: calc.withinGracePeriod,
      items_cancelled: flippedIds.length,
      refund_total_cents: calc.totalRefundCents + ((order.tip_amount as number | null) || 0),
      fee_total_cents: calc.totalFeeCents,
      refund_failures: refundFailures,
    })
  })
}
