import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/config'
import { createRefund } from '@/lib/stripe/payments'
import { withErrorTracing, traced, crumb, TracedError, logError } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { LOW_STOCK_THRESHOLD } from '@/lib/constants'
import { sendNotification } from '@/lib/notifications'
import { logPublicActivityEvent } from '@/lib/marketing/activity-events'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/checkout/success', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`checkout-success:${clientIp}`, rateLimits.api)
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
      .select('platform_fee_cents, buyer_user_id, order_number, vertical_id')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      throw traced.validation('ERR_CHECKOUT_004', 'Order not found')
    }

    if (order.buyer_user_id !== user.id) {
      throw traced.auth('ERR_AUTH_002', 'Not authorized for this order')
    }

    // Update order status to paid
    crumb.supabase('update', 'orders')
    const { error: statusError } = await serviceClient
      .from('orders')
      .update({ status: 'paid' })
      .eq('id', orderId)

    if (statusError) {
      crumb.logic('Failed to update order status')
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

      // Inventory was already decremented at checkout time (checkout/session route).
      // Check stock levels and send notifications to vendors if needed.
      crumb.supabase('select', 'order_items')
      const { data: orderItems, error: orderItemsError } = await serviceClient
        .from('order_items')
        .select('listing_id, quantity')
        .eq('order_id', orderId)

      if (orderItemsError) {
        crumb.logic('Failed to fetch order items for stock notifications')
      } else if (orderItems && orderItems.length > 0) {
        // Group quantities by listing_id
        const quantityByListing = new Map<string, number>()
        for (const item of orderItems) {
          const current = quantityByListing.get(item.listing_id) || 0
          quantityByListing.set(item.listing_id, current + item.quantity)
        }

        // Batch fetch all listings to check stock levels + activity event data
        const listingIds = Array.from(quantityByListing.keys())
        crumb.supabase('select', 'listings (batch)')
        const { data: listings } = await serviceClient
          .from('listings')
          .select('id, quantity, title, category, vendor_profile_id, vendor_profiles(user_id, profile_data, vertical_id)')
          .in('id', listingIds)

        if (listings && listings.length > 0) {
          // Send stock notifications for low/out-of-stock items (parallel)
          const stockNotifications: Promise<unknown>[] = []
          for (const listing of listings) {
            if (listing.quantity === null) continue // Unlimited inventory
            const vendorProfile = listing.vendor_profiles as unknown as { user_id: string } | null
            const vendorUserId = vendorProfile?.user_id
            if (!vendorUserId) continue

            if (listing.quantity === 0) {
              stockNotifications.push(sendNotification(vendorUserId, 'inventory_out_of_stock', {
                listingTitle: listing.title,
              }))
            } else if (listing.quantity <= LOW_STOCK_THRESHOLD) {
              stockNotifications.push(sendNotification(vendorUserId, 'inventory_low_stock', {
                listingTitle: listing.title,
                quantity: listing.quantity,
              }))
            }
          }
          await Promise.all(stockNotifications)

          // Log public activity events for social proof toasts
          // Fetch market city for purchase events
          const { data: orderItemsWithMarket } = await serviceClient
            .from('order_items')
            .select('listing_id, markets!market_id(city)')
            .eq('order_id', orderId)

          const marketCityByListing = new Map<string, string>()
          if (orderItemsWithMarket) {
            for (const oi of orderItemsWithMarket) {
              const m = oi.markets as unknown as { city?: string } | null
              if (m?.city) marketCityByListing.set(oi.listing_id, m.city)
            }
          }

          // Log activity events in parallel
          const activityPromises: Promise<unknown>[] = []
          for (const listing of listings) {
            const vp = listing.vendor_profiles as unknown as { user_id: string; profile_data: Record<string, unknown>; vertical_id: string } | null
            const vpData = vp?.profile_data
            const vName = (vpData?.business_name as string) || (vpData?.farm_name as string) || undefined
            const verticalId = vp?.vertical_id || 'farmers-market'

            activityPromises.push(logPublicActivityEvent({
              vertical_id: verticalId,
              event_type: 'purchase',
              city: marketCityByListing.get(listing.id) || undefined,
              item_name: listing.title || undefined,
              vendor_display_name: vName,
              item_category: listing.category || undefined,
            }))

            // If item sold out from this purchase
            if (listing.quantity === 0) {
              activityPromises.push(logPublicActivityEvent({
                vertical_id: verticalId,
                event_type: 'sold_out',
                item_name: listing.title || undefined,
                vendor_display_name: vName,
              }))
            }
          }
          await Promise.all(activityPromises)
        }
      }
      // Process market box subscriptions if this order includes them
      if (session.metadata?.has_market_boxes === 'true' && session.metadata?.market_box_items) {
        crumb.logic('Processing market box subscriptions from unified checkout')
        try {
          const marketBoxItems = JSON.parse(session.metadata.market_box_items) as Array<{
            offeringId: string
            termWeeks: number
            startDate?: string
            priceCents: number
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
              })

            if (rpcError) {
              crumb.logic('Failed to create market box subscription', { error: rpcError.message, offeringId: mbItem.offeringId })
              // C-3 FIX: Auto-refund on RPC failure — buyer paid but subscription wasn't created
              await logError(new TracedError('ERR_CHECKOUT_010', `Market box subscription RPC failed after payment: ${rpcError.message}`, {
                route: '/api/checkout/success', method: 'GET',
                offeringId: mbItem.offeringId, orderId, paymentIntentId,
              }))
              try {
                await createRefund(paymentIntentId, mbItem.priceCents)
                crumb.logic('Auto-refund issued for failed market box RPC', {
                  offeringId: mbItem.offeringId,
                  refundCents: mbItem.priceCents,
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
              try {
                await createRefund(paymentIntentId, mbItem.priceCents)
                crumb.logic('Refund issued for at-capacity market box', {
                  offeringId: mbItem.offeringId,
                  refundCents: mbItem.priceCents,
                })
              } catch (refundErr) {
                console.error('[MARKET_BOX_REFUND] Failed to refund at-capacity market box:', {
                  offeringId: mbItem.offeringId,
                  amount: mbItem.priceCents,
                  error: refundErr instanceof Error ? refundErr.message : refundErr,
                })
              }
            } else if (result?.already_existed) {
              crumb.logic('Market box subscription already exists (idempotent)', { offeringId: mbItem.offeringId })
            } else {
              crumb.logic('Market box subscription created', { offeringId: mbItem.offeringId, id: result?.id })
            }
          }
        } catch (parseErr) {
          crumb.logic('Failed to parse market box items metadata')
        }
      }
    } else {
      crumb.logic('Payment record already exists (skipping duplicate processing)')
    }

    // Vendor notifications — OUTSIDE payment idempotency guard
    // Webhook may insert payment first, causing the guard above to skip.
    // Own idempotency: check if notifications already exist for this order.
    const { count: existingNotifCount } = await serviceClient
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'new_paid_order')
      .contains('data', { orderNumber: order.order_number })

    if ((existingNotifCount || 0) === 0) {
      crumb.supabase('select', 'order_items (vendor notifications)')
      const { data: notifyItems, error: notifyItemsError } = await serviceClient
        .from('order_items')
        .select(`
          vendor_profile_id,
          market_id,
          listing:listings(title),
          markets!market_id(name),
          vendor_profiles!vendor_profile_id(user_id)
        `)
        .eq('order_id', orderId)

      if (notifyItemsError) {
        crumb.logic('Failed to fetch order items for vendor notifications', { error: notifyItemsError.message })
      } else if (notifyItems && notifyItems.length > 0) {
        const orderNumber = order.order_number || ''

        const vendorNotifications = new Map<string, { userId: string; items: string[]; marketName: string }>()
        for (const item of notifyItems) {
          const vp = item.vendor_profiles as unknown as { user_id: string } | null
          const vendorUserId = vp?.user_id
          if (!vendorUserId) {
            crumb.logic('Skipping vendor notification — no user_id', {
              vendorProfileId: item.vendor_profile_id
            })
            continue
          }
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
        crumb.logic(`Sending notifications to ${vendorNotifications.size} vendor(s)`)
        await Promise.all(
          Array.from(vendorNotifications).map(([vendorUserId, info]) =>
            sendNotification(vendorUserId, 'new_paid_order', {
              orderNumber,
              itemTitle: info.items.length === 1 ? info.items[0] : `${info.items.length} items`,
              marketName: info.marketName,
            })
          )
        )
      }
    } else {
      crumb.logic('Vendor notifications already sent for this order')
    }

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
          markets!market_id(id, name, market_type, address, city, state),
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
          )
        `)
        .eq('order_id', orderId)

      marketBoxSubscriptions = mbSubs as unknown as Array<Record<string, unknown>> | null
    }

    return NextResponse.json({
      success: true,
      orderId,
      order: fullOrder,
      marketBoxSubscriptions: marketBoxSubscriptions || [],
    })
  })
}
