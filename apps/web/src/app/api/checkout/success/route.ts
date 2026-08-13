import { NextRequest, NextResponse, after } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/config'
import { createRefund } from '@/lib/stripe/payments'
import { FEES } from '@/lib/pricing'
import { processMarketBoxPayout } from '@/lib/stripe/market-box-payout'
import { withErrorTracing, traced, crumb, TracedError, logError } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { LOW_STOCK_THRESHOLD } from '@/lib/constants'
import { sendNotification } from '@/lib/notifications'
import { logPublicActivityEvent } from '@/lib/marketing/activity-events'
import { defaultBranding } from '@/lib/branding/defaults'
import { formatPickupTime } from '@/types/pickup'

export const maxDuration = 30

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/checkout/success', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`checkout-success:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const sessionId = request.nextUrl.searchParams.get('session_id')

    if (!sessionId) {
      throw traced.validation('ERR_CHECKOUT_003', 'Missing session_id')
    }

    // Verify authenticated user before any processing
    crumb.auth('Verifying user authentication')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Verify session with Stripe
    crumb.logic('Retrieving Stripe checkout session')
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.payment_status !== 'paid') {
      throw traced.external('ERR_CHECKOUT_003', 'Payment not completed', { paymentStatus: session.payment_status })
    }

    const orderId = session.metadata?.order_id
    const paymentIntentId = session.payment_intent as string

    crumb.logic('Processing payment for order')

    if (!orderId) {
      throw traced.validation('ERR_CHECKOUT_004', 'Missing order_id in session metadata')
    }

    // Use service client for payment operations (buyers don't have RLS insert permission on payments)
    const serviceClient = createServiceClient()

    // Verify order ownership - the authenticated user must own this order
    crumb.supabase('select', 'orders')
    const { data: order, error: orderError } = await serviceClient
      .from('orders')
      .select('status, platform_fee_cents, buyer_user_id, order_number, vertical_id')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      throw traced.validation('ERR_CHECKOUT_004', 'Order not found')
    }

    if (order.buyer_user_id !== user.id) {
      throw traced.auth('ERR_AUTH_002', 'Not authorized for this order')
    }

    // CHK-1 (3-way status branch): only a PENDING order flips to paid; if the
    // webhook already finalized it (paid/completed) we just backfill below; if
    // the order died before payment landed (stale tab paid a cancelled order)
    // we record the payment, auto-refund in full, and tell the buyer the truth.
    let deadOrderStatus: string | null =
      ['cancelled', 'refunded'].includes(order.status) ? order.status : null

    if (order.status === 'pending') {
      crumb.supabase('update', 'orders')
      const { data: flippedRows, error: statusError } = await serviceClient
        .from('orders')
        .update({ status: 'paid' })
        .eq('id', orderId)
        .eq('status', 'pending')
        .select('id')

      if (statusError) {
        crumb.logic('Failed to update order status')
      } else if (!flippedRows || flippedRows.length === 0) {
        // Lost the race between our status read and the flip — re-read; a
        // cancel winning that race is THE CHK-1 race. A webhook flip winning
        // it just means the order is paid — continue normally.
        const { data: raceOrder } = await serviceClient
          .from('orders')
          .select('status')
          .eq('id', orderId)
          .single()
        if (raceOrder && ['cancelled', 'refunded'].includes(raceOrder.status)) {
          deadOrderStatus = raceOrder.status
        }
      }
    }

    if (deadOrderStatus) {
      // Money moved — record the payment row (idempotent vs the webhook's
      // insert), then refund the full charge. Deterministic key shared with
      // the webhook's dead-order path — the two can never double-refund. The
      // buyer notification comes from the webhook path only (single sender).
      crumb.supabase('insert', 'payments (dead order)')
      const { error: deadInsertErr } = await serviceClient.from('payments').insert({
        order_id: orderId,
        stripe_payment_intent_id: paymentIntentId,
        amount_cents: session.amount_total!,
        platform_fee_cents: order.platform_fee_cents || 0,
        status: 'succeeded',
        paid_at: new Date().toISOString(),
      })
      if (deadInsertErr && deadInsertErr.code !== '23505') {
        throw traced.fromSupabase(deadInsertErr, { table: 'payments', operation: 'insert' })
      }
      try {
        await createRefund(paymentIntentId, `${orderId}-dead-order`, session.amount_total!)
        await logError(new TracedError('ERR_CHECKOUT_006', `Buyer paid dead order ${orderId} (status ${deadOrderStatus}) via stale tab — full auto-refund of ${session.amount_total}¢ initiated`, {
          route: '/api/checkout/success', method: 'GET',
        }))
      } catch (refundErr) {
        await logError(new TracedError('ERR_CHECKOUT_006', `CRITICAL: buyer paid dead order ${orderId} AND auto-refund failed — manual refund of ${session.amount_total}¢ needed: ${refundErr instanceof Error ? refundErr.message : String(refundErr)}`, {
          route: '/api/checkout/success', method: 'GET',
        }))
      }
      throw traced.validation('ERR_CHECKOUT_006', 'This order expired before payment completed — your payment is being refunded.')
    }

    // Create payment record (idempotent - skip if already created by webhook)
    crumb.supabase('select', 'payments')
    const { data: existingPayment } = await serviceClient
      .from('payments')
      .select('id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .single()

    if (!existingPayment) {
      crumb.supabase('insert', 'payments')
      const { error: insertError } = await serviceClient.from('payments').insert({
        order_id: orderId,
        stripe_payment_intent_id: paymentIntentId,
        amount_cents: session.amount_total!,
        platform_fee_cents: order.platform_fee_cents || 0,
        status: 'succeeded',
        paid_at: new Date().toISOString(),
      })

      if (insertError) {
        // F1 FIX: Handle unique constraint violation as no-op (webhook may have inserted first)
        if (insertError.code === '23505') {
          crumb.logic('Payment record already exists (concurrent webhook), skipping')
        } else {
          throw traced.fromSupabase(insertError, { table: 'payments', operation: 'insert' })
        }
      } else {
        crumb.logic('Payment record created')
      }

      // Stock notifications + activity events — deferred via after() so the
      // success page response returns immediately. These are non-critical and
      // idempotent (sendNotification deduplicates within 10s windows).
      after(async () => {
        try {
          const { data: deferredItems } = await serviceClient
            .from('order_items')
            .select('listing_id, quantity')
            .eq('order_id', orderId)

          if (deferredItems && deferredItems.length > 0) {
            const quantityByListing = new Map<string, number>()
            for (const item of deferredItems) {
              const current = quantityByListing.get(item.listing_id) || 0
              quantityByListing.set(item.listing_id, current + item.quantity)
            }

            const listingIds = Array.from(quantityByListing.keys())
            const { data: listings } = await serviceClient
              .from('listings')
              .select('id, quantity, title, category, vendor_profile_id, vendor_profiles(user_id, profile_data, vertical_id)')
              .in('id', listingIds)

            if (listings && listings.length > 0) {
              const stockNotifications: Promise<unknown>[] = []
              for (const listing of listings) {
                if (listing.quantity === null) continue
                const vendorProfile = listing.vendor_profiles as unknown as { user_id: string; vertical_id?: string } | null
                const vendorUserId = vendorProfile?.user_id
                if (!vendorUserId) continue
                const vendorVertical = vendorProfile?.vertical_id || order.vertical_id

                if (listing.quantity === 0) {
                  stockNotifications.push(sendNotification(vendorUserId, 'inventory_out_of_stock', {
                    listingTitle: listing.title,
                  }, { vertical: vendorVertical }))
                } else if (listing.quantity <= LOW_STOCK_THRESHOLD) {
                  stockNotifications.push(sendNotification(vendorUserId, 'inventory_low_stock', {
                    listingTitle: listing.title,
                    quantity: listing.quantity,
                  }, { vertical: vendorVertical }))
                }
              }
              await Promise.all(stockNotifications)

              // Activity events for social proof
              const { data: itemsWithMarket } = await serviceClient
                .from('order_items')
                .select('listing_id, markets!market_id(city)')
                .eq('order_id', orderId)

              const marketCityByListing = new Map<string, string>()
              if (itemsWithMarket) {
                for (const oi of itemsWithMarket) {
                  const m = oi.markets as unknown as { city?: string } | null
                  if (m?.city) marketCityByListing.set(oi.listing_id, m.city)
                }
              }

              const activityPromises: Promise<unknown>[] = []
              for (const listing of listings) {
                const vp = listing.vendor_profiles as unknown as { user_id: string; profile_data: Record<string, unknown>; vertical_id: string } | null
                const vpData = vp?.profile_data
                const vName = (vpData?.business_name as string) || (vpData?.farm_name as string) || undefined
                const verticalId = vp?.vertical_id || 'farmers-market'

                const cityForActivity = marketCityByListing.get(listing.id)
                activityPromises.push(logPublicActivityEvent({
                  vertical_id: verticalId,
                  event_type: 'purchase',
                  ...(cityForActivity ? { city: cityForActivity } : {}),
                  ...(listing.title ? { item_name: listing.title } : {}),
                  ...(vName !== undefined ? { vendor_display_name: vName } : {}),
                  ...(listing.category ? { item_category: listing.category } : {}),
                }))

                if (listing.quantity === 0) {
                  activityPromises.push(logPublicActivityEvent({
                    vertical_id: verticalId,
                    event_type: 'sold_out',
                    ...(listing.title ? { item_name: listing.title } : {}),
                    ...(vName !== undefined ? { vendor_display_name: vName } : {}),
                  }))
                }
              }
              await Promise.all(activityPromises)
            }
          }
        } catch {
          // Deferred notifications are best-effort — don't crash the response
        }
      })
      // Process market box subscriptions if this order includes them
      if (session.metadata?.has_market_boxes === 'true' && session.metadata?.market_box_items) {
        crumb.logic('Processing market box subscriptions from unified checkout')
        try {
          const marketBoxItems = JSON.parse(session.metadata.market_box_items) as Array<{
            offeringId: string
            termWeeks: number
            startDate?: string
            priceCents: number
            basePriceCents?: number // M9: included from unified checkout metadata
            pickupFrequency?: string // Migration 124: weekly or biweekly
          }>

          for (const mbItem of marketBoxItems) {
            // Atomic subscribe with capacity check (prevents race condition)
            const { data: result, error: rpcError } = await serviceClient
              .rpc('subscribe_to_market_box_if_capacity', {
                p_offering_id: mbItem.offeringId,
                p_buyer_user_id: user.id,
                p_order_id: orderId,
                p_total_paid_cents: mbItem.priceCents,
                p_start_date: mbItem.startDate || new Date().toISOString().split('T')[0],
                p_term_weeks: mbItem.termWeeks,
                p_stripe_payment_intent_id: paymentIntentId,
                p_pickup_frequency: mbItem.pickupFrequency || 'weekly',
              })

            if (rpcError) {
              crumb.logic('Failed to create market box subscription', { error: rpcError.message, offeringId: mbItem.offeringId })
              // C-3 FIX: Auto-refund on RPC failure — buyer paid but subscription wasn't created
              await logError(new TracedError('ERR_CHECKOUT_010', `Market box subscription RPC failed after payment: ${rpcError.message}`, {
                route: '/api/checkout/success', method: 'GET',
                offeringId: mbItem.offeringId, orderId, paymentIntentId,
              }))
              try {
                // CHK-6 FIX: refund the fee-inclusive amount the buyer was charged
                // (line item = round(price × (1+buyerFeePercent)), session:682) —
                // refunding the pre-fee priceCents shorted the buyer ~6.5%.
                const mbChargedCents = Math.round(mbItem.priceCents * (1 + FEES.buyerFeePercent / 100))
                await createRefund(paymentIntentId, mbItem.offeringId, mbChargedCents)
                crumb.logic('Auto-refund issued for failed market box RPC', {
                  offeringId: mbItem.offeringId,
                  refundCents: mbChargedCents,
                })
              } catch (refundErr) {
                // Critical: refund also failed — needs manual intervention
                await logError(new TracedError('ERR_CHECKOUT_011', `CRITICAL: Market box RPC failed AND refund failed — manual refund needed`, {
                  route: '/api/checkout/success', method: 'GET',
                  offeringId: mbItem.offeringId, orderId, paymentIntentId,
                  refundError: refundErr instanceof Error ? refundErr.message : String(refundErr),
                }))
              }
            } else if (result && !result.success) {
              crumb.logic('Market box at capacity, subscription not created', { offeringId: mbItem.offeringId, ...result })
              // F6 FIX: Refund buyer for at-capacity market box
              // CHK-6 FIX: fee-inclusive refund (see failed-RPC branch above)
              try {
                const mbChargedCents = Math.round(mbItem.priceCents * (1 + FEES.buyerFeePercent / 100))
                await createRefund(paymentIntentId, mbItem.offeringId, mbChargedCents)
                crumb.logic('Refund issued for at-capacity market box', {
                  offeringId: mbItem.offeringId,
                  refundCents: mbChargedCents,
                })
              } catch (refundErr) {
                // Refund failed — buyer paid for an at-capacity box. Must reach
                // error_logs (console.error is invisible to the error-log review).
                await logError(new TracedError('ERR_REFUND_001', `Stripe refund failed for at-capacity market box: ${refundErr instanceof Error ? refundErr.message : String(refundErr)}`, {
                  route: '/api/checkout/success', method: 'GET',
                  offeringId: mbItem.offeringId, orderId, paymentIntentId,
                  amountCents: mbItem.priceCents,
                }))
              }
            } else if (result?.already_existed) {
              crumb.logic('Market box subscription already exists (idempotent)', { offeringId: mbItem.offeringId })
              // Still process payout if it hasn't been created yet
              await processMarketBoxPayout({
                serviceClient,
                subscriptionId: result.id,
                offeringId: mbItem.offeringId,
                actualPaidCents: mbItem.priceCents,
                paymentIntentId,
                source: 'checkout-success',
              })
            } else {
              crumb.logic('Market box subscription created', { offeringId: mbItem.offeringId, id: result?.id })
              // Pay vendor the prepaid amount the buyer actually paid
              if (result?.id) {
                await processMarketBoxPayout({
                  serviceClient,
                  subscriptionId: result.id,
                  offeringId: mbItem.offeringId,
                  actualPaidCents: mbItem.priceCents,
                  paymentIntentId,
                  source: 'checkout-success',
                })
              }
            }
          }
        } catch (parseErr) {
          crumb.logic('Failed to parse market box items metadata')
        }
      }
    } else {
      crumb.logic('Payment record already exists (skipping duplicate processing)')
    }

    // Vendor + buyer notifications — deferred via after() so the success page
    // returns immediately. Each has its own idempotency guard (checks existing
    // notifications before sending), so re-runs from webhook are safe.
    const capturedOrderNumber = order.order_number || ''
    const capturedVerticalId = order.vertical_id
    const capturedUserId = user.id

    after(async () => {
      try {
        // Fetch buyer name for vendor notifications
        const { data: buyerProfile } = await serviceClient
          .from('user_profiles')
          .select('display_name')
          .eq('user_id', capturedUserId)
          .single()
        const buyerDisplayName = buyerProfile?.display_name || 'A customer'

        // Vendor notifications
        const { count: existingNotifCount } = await serviceClient
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('type', 'new_paid_order')
          .contains('data', { orderNumber: capturedOrderNumber })

        if ((existingNotifCount || 0) === 0) {
          const { data: notifyItems } = await serviceClient
            .from('order_items')
            .select(`
              vendor_profile_id,
              market_id,
              listing:listings(title),
              markets!market_id(name),
              vendor_profiles!vendor_profile_id(user_id)
            `)
            .eq('order_id', orderId)

          if (notifyItems && notifyItems.length > 0) {
            const vendorNotifications = new Map<string, { userId: string; items: string[]; marketName: string }>()
            for (const item of notifyItems) {
              const vp = item.vendor_profiles as unknown as { user_id: string } | null
              const vendorUserId = vp?.user_id
              if (!vendorUserId) continue
              const listing = item.listing as unknown as { title: string } | null
              const market = item.markets as unknown as { name: string } | null
              const existing = vendorNotifications.get(vendorUserId)
              if (existing) {
                existing.items.push(listing?.title || 'Item')
              } else {
                vendorNotifications.set(vendorUserId, {
                  userId: vendorUserId,
                  items: [listing?.title || 'Item'],
                  marketName: market?.name || '',
                })
              }
            }
            await Promise.all(
              Array.from(vendorNotifications).map(([vendorUserId, info]) =>
                sendNotification(vendorUserId, 'new_paid_order', {
                  orderNumber: capturedOrderNumber,
                  buyerName: buyerDisplayName,
                  itemTitle: info.items.length === 1 ? info.items[0] : `${info.items.length} items`,
                  marketName: info.marketName,
                }, { vertical: capturedVerticalId })
              )
            )
          }
        }

        // Buyer order placement notification
        const { count: existingBuyerNotifCount } = await serviceClient
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', capturedUserId)
          .eq('type', 'order_placed')
          .contains('data', { orderNumber: capturedOrderNumber })

        if ((existingBuyerNotifCount || 0) === 0) {
          const { data: buyerNotifyItems } = await serviceClient
            .from('order_items')
            .select(`
              listing:listings(title, vendor_profiles(profile_data)),
              markets!market_id(name, address, city, state),
              pickup_date,
              preferred_pickup_time
            `)
            .eq('order_id', orderId)

          const items = buyerNotifyItems as unknown as Array<{
            listing: { title: string; vendor_profiles: { profile_data: Record<string, unknown> } | null } | null
            markets: { name: string; address: string | null; city: string | null; state: string | null } | null
            pickup_date: string | null
            preferred_pickup_time: string | null
          }> | null

          const vendorNames = new Set<string>()
          const itemTitles: string[] = []

          // Distinct pickup groups, keyed by market + date + time.
          //
          // An order can legitimately span markets — the buyer acknowledges
          // exactly that at checkout ("I understand I'll visit multiple
          // locations"), and order_items carries its own market, schedule and
          // pickup date per row. Previously marketName / marketAddress /
          // pickupDate / pickupTime were each assigned under `if (!x)`, so the
          // FIRST value won and every other pickup was silently dropped: a
          // buyer with items from two markets was emailed a confirmation
          // describing one, with no record of where the rest of their order
          // was. Found by owner testing 2026-08-10 (order FA-2026-69424470).
          //
          // Not a regression from the multi-market fix — this template never
          // handled more than one pickup. That fix simply made it reachable.
          // (T-05)
          const pickups = new Map<string, {
            marketName: string
            marketAddress: string
            pickupDate: string
            pickupTime: string
          }>()

          if (items) {
            for (const item of items) {
              const vpData = item.listing?.vendor_profiles?.profile_data
              const vName = (vpData?.business_name as string) || (vpData?.farm_name as string)
              if (vName) vendorNames.add(vName)
              if (item.listing?.title) itemTitles.push(item.listing.title)

              const mName = item.markets?.name || ''
              const mAddress = item.markets
                ? [item.markets.address, item.markets.city, item.markets.state].filter(Boolean).join(', ')
                : ''
              // NOTE: 'en-US' regardless of the recipient's locale. Pre-existing
              // behaviour, deliberately left alone here rather than widening
              // this change — logged separately.
              const pDate = item.pickup_date
                ? new Date(item.pickup_date + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                  })
                : ''
              const pTime = item.preferred_pickup_time
                ? formatPickupTime(item.preferred_pickup_time)
                : ''

              if (mName || pDate) {
                pickups.set(`${mName}|${pDate}|${pTime}`, {
                  marketName: mName,
                  marketAddress: mAddress,
                  pickupDate: pDate,
                  pickupTime: pTime,
                })
              }
            }
          }

          // The single-pickup payload below stays byte-identical to before:
          // the first group's values are exactly what the old first-wins
          // guards produced.
          const pickupList = Array.from(pickups.values())
          const firstPickup = pickupList[0]
          const marketName = firstPickup?.marketName ?? ''
          const marketAddress = firstPickup?.marketAddress ?? ''
          const pickupDate = firstPickup?.pickupDate ?? ''
          const pickupTime = firstPickup?.pickupTime ?? ''

          const vendorName = vendorNames.size === 1
            ? Array.from(vendorNames)[0]
            : vendorNames.size > 1
              ? `${vendorNames.size} vendors`
              : undefined

          const branding = defaultBranding[capturedVerticalId as keyof typeof defaultBranding]

          await sendNotification(capturedUserId, 'order_placed', {
            orderNumber: capturedOrderNumber,
            orderId,
            brandName: branding?.brand_name || "Food Truck'n",
            itemTitle: itemTitles.length === 1 ? itemTitles[0] : `${itemTitles.length} items`,
            marketName,
            marketAddress,
            pickupDate,
            pickupTime,
            ...(vendorName !== undefined ? { vendorName } : {}),
            // Only sent when the order genuinely spans pickups. The template
            // branches on its presence, so a single-pickup order renders
            // exactly as it did before (T-05).
            ...(pickupList.length > 1 ? { pickups: pickupList } : {}),
          }, { vertical: capturedVerticalId })
        }
      } catch {
        // Deferred notifications are best-effort
      }
    })

    // Clear the buyer's cart after successful payment (idempotent — safe on every hit)
    // Uses serviceClient to bypass RLS and avoid auth-context issues after long execution.
    // Must filter by vertical_id — users can have multiple carts (one per vertical).
    crumb.supabase('select', 'carts')
    const { data: cart, error: cartError } = await serviceClient
      .from('carts')
      .select('id')
      .eq('user_id', user.id)
      .eq('vertical_id', order.vertical_id)
      .maybeSingle()
    if (cartError) {
      crumb.logic('Failed to find cart for clearing', { error: cartError.message })
    } else if (cart) {
      crumb.supabase('delete', 'cart_items')
      const { error: deleteError } = await serviceClient
        .from('cart_items')
        .delete()
        .eq('cart_id', cart.id)
      if (deleteError) {
        crumb.logic('Failed to clear cart items', { error: deleteError.message })
      }
    }

    // Fetch full order details for the success page
    crumb.supabase('select', 'orders')
    const { data: fullOrder } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        status,
        total_cents,
        tip_percentage,
        tip_amount,
        created_at,
        order_items(
          id,
          quantity,
          subtotal_cents,
          market_id,
          schedule_id,
          pickup_date,
          preferred_pickup_time,
          pickup_snapshot,
          markets!market_id(id, name, market_type, address, city, state, catering_request_id),
          listing:listings(
            title,
            quantity_amount,
            quantity_unit,
            vendor_profiles(profile_data, user_id)
          )
        )
      `)
      .eq('id', orderId)
      .single()

    // Fetch market box subscriptions linked to this order (if any)
    let marketBoxSubscriptions: Array<Record<string, unknown>> | null = null
    if (session.metadata?.has_market_boxes === 'true') {
      crumb.supabase('select', 'market_box_subscriptions')
      const { data: mbSubs } = await serviceClient
        .from('market_box_subscriptions')
        .select(`
          id,
          term_weeks,
          pickup_frequency,
          start_date,
          total_paid_cents,
          status,
          market_box_offerings!offering_id(
            name,
            pickup_day_of_week,
            pickup_start_time,
            pickup_end_time,
            vendor_profiles(profile_data),
            markets:markets!pickup_market_id(name, city, state)
          ),
          pickups:market_box_pickups(id)
        `)
        .eq('order_id', orderId)

      marketBoxSubscriptions = mbSubs as unknown as Array<Record<string, unknown>> | null
    }

    // T-72: "Continue shopping" on an event order used to return to the general
    // browse page — a buyer who forgot dessert would shop the wrong catalogue
    // and could order from a truck that is not at the event. The success page
    // has market_id and market_type per item but NOT the event token, and the
    // shop route is /{vertical}/events/[token]/shop.
    //
    // Deliberately a SEPARATE query, not a nested embed: `markets` and
    // `catering_requests` have TWO foreign keys between them
    // (catering_requests.market_id → markets.id AND markets.catering_request_id
    // → catering_requests.id), which is the ambiguous case PostgREST cannot
    // infer — and a select string is not typechecked, so a wrong guess would
    // only surface the first time somebody actually paid. A plain lookup cannot
    // be ambiguous.
    //
    // FULLY ADDITIVE. supabase-js returns query errors in the response object
    // rather than throwing, so a failure here leaves the map empty and the page
    // falls back to the browse link exactly as it does today. Nothing about the
    // order response depends on it. This route runs AFTER Stripe has taken
    // payment — degrading quietly is the whole design.
    const eventShopTokens: Record<string, string> = {}
    try {
      const items = (fullOrder?.order_items ?? []) as Array<Record<string, unknown>>
      const marketIdByRequestId = new Map<string, string>()
      for (const it of items) {
        const m = it.markets as Record<string, unknown> | null
        if (m?.market_type === 'event' && m?.catering_request_id && m?.id) {
          marketIdByRequestId.set(m.catering_request_id as string, m.id as string)
        }
      }
      if (marketIdByRequestId.size > 0) {
        crumb.supabase('select', 'catering_requests (event shop tokens)')
        const { data: reqs } = await serviceClient
          .from('catering_requests')
          .select('id, event_token')
          .in('id', [...marketIdByRequestId.keys()])
        for (const r of reqs ?? []) {
          const marketId = marketIdByRequestId.get(r.id as string)
          if (marketId && r.event_token) eventShopTokens[marketId] = r.event_token as string
        }
      }
    } catch {
      // Never let a convenience link break a post-payment response.
    }

    return NextResponse.json({
      success: true,
      orderId,
      order: fullOrder,
      marketBoxSubscriptions: marketBoxSubscriptions || [],
      eventShopTokens,
    })
  })
}

