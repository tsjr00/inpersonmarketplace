import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/config'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { LOW_STOCK_THRESHOLD } from '@/lib/constants'
import { sendNotification } from '@/lib/notifications'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/checkout/success', 'GET', async () => {
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
      .select('platform_fee_cents, buyer_user_id')
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
        throw traced.fromSupabase(insertError, { table: 'payments', operation: 'insert' })
      }
      crumb.logic('Payment record created')

      // Decrement inventory for purchased items (only on first successful payment processing)
      crumb.supabase('select', 'order_items')
      const { data: orderItems, error: orderItemsError } = await serviceClient
        .from('order_items')
        .select('listing_id, quantity')
        .eq('order_id', orderId)

      if (orderItemsError) {
        crumb.logic('Failed to fetch order items for inventory update')
      } else if (orderItems && orderItems.length > 0) {
        crumb.logic('Decrementing inventory for purchased items')

        // Group quantities by listing_id (same listing could appear multiple times)
        const quantityByListing = new Map<string, number>()
        for (const item of orderItems) {
          const current = quantityByListing.get(item.listing_id) || 0
          quantityByListing.set(item.listing_id, current + item.quantity)
        }

        // Batch fetch all listings at once (instead of one-by-one)
        const listingIds = Array.from(quantityByListing.keys())
        crumb.supabase('select', 'listings (batch)')
        const { data: listings } = await serviceClient
          .from('listings')
          .select('id, quantity, title, vendor_profile_id, vendor_profiles(user_id)')
          .in('id', listingIds)

        if (listings && listings.length > 0) {
          // Atomic inventory updates + notification collection (parallel)
          const notifications: Array<{
            user_id: string
            type: string
            title: string
            message: string
            data: Record<string, unknown>
          }> = []

          crumb.supabase('update', 'listings (atomic batch)')
          const updateResults = await Promise.all(
            listings
              .filter(listing => listing.quantity !== null)
              .map(async (listing) => {
                const quantityPurchased = quantityByListing.get(listing.id) || 0
                const previousQuantity = listing.quantity as number

                // Atomic decrement - prevents race condition between concurrent checkouts
                const { data: updated, error: updateErr } = await serviceClient
                  .rpc('atomic_decrement_inventory' as string, {
                    p_listing_id: listing.id,
                    p_quantity: quantityPurchased
                  })
                  .single()

                // Fallback if RPC doesn't exist yet (pre-migration)
                let newQuantity: number
                if (updateErr) {
                  newQuantity = Math.max(0, previousQuantity - quantityPurchased)
                  await serviceClient
                    .from('listings')
                    .update({ quantity: newQuantity })
                    .eq('id', listing.id)
                } else {
                  newQuantity = (updated as { new_quantity: number })?.new_quantity ?? Math.max(0, previousQuantity - quantityPurchased)
                }

                // Collect notifications (don't send inline - batch later)
                const vendorProfile = listing.vendor_profiles as unknown as { user_id: string } | null
                const vendorUserId = vendorProfile?.user_id
                if (vendorUserId) {
                  if (newQuantity === 0) {
                    notifications.push({
                      user_id: vendorUserId,
                      type: 'inventory_out_of_stock',
                      title: 'Out of Stock',
                      message: `"${listing.title}" is now out of stock. Update your listing to add more inventory.`,
                      data: { listing_id: listing.id, listing_title: listing.title }
                    })
                  } else if (newQuantity <= LOW_STOCK_THRESHOLD && previousQuantity > LOW_STOCK_THRESHOLD) {
                    notifications.push({
                      user_id: vendorUserId,
                      type: 'inventory_low_stock',
                      title: 'Low Stock Alert',
                      message: `"${listing.title}" has only ${newQuantity} left in stock.`,
                      data: { listing_id: listing.id, listing_title: listing.title, quantity_remaining: newQuantity }
                    })
                  }
                }

                return { listingId: listing.id, previousQuantity, newQuantity }
              })
          )

          crumb.logic(`Inventory updated for ${updateResults.length} listings`)

          // Batch insert all notifications at once
          if (notifications.length > 0) {
            crumb.supabase('insert', 'notifications (batch)')
            const { error: notifyError } = await serviceClient
              .from('notifications')
              .insert(notifications)
            if (notifyError) {
              crumb.logic(`Failed to send ${notifications.length} stock notifications`)
            }
          }
        }
      }
    } else {
      crumb.logic('Payment record already exists (skipping inventory decrement)')
    }

    // Clear the buyer's cart after successful payment
    crumb.supabase('select', 'carts')
    const { data: cart } = await supabase
      .from('carts')
      .select('id')
      .eq('user_id', user.id)
      .single()
    if (cart) {
      crumb.supabase('delete', 'cart_items')
      await supabase.from('cart_items').delete().eq('cart_id', cart.id)
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
        created_at,
        order_items(
          id,
          quantity,
          subtotal_cents,
          market_id,
          vendor_profile_id,
          schedule_id,
          pickup_date,
          pickup_snapshot,
          markets!market_id(id, name, market_type, address, city, state),
          listing:listings(
            title,
            vendor_profiles(profile_data, user_id)
          )
        )
      `)
      .eq('id', orderId)
      .single()

    // Notify vendors of new paid order
    // Uses vendor_profile_id directly (not FK traversal) + service client (bypasses RLS)
    if (fullOrder?.order_items) {
      const vendorProfileIds = [...new Set(
        fullOrder.order_items
          .map((item: Record<string, unknown>) => item.vendor_profile_id as string)
          .filter(Boolean)
      )]

      // Look up vendor user_ids via service client (reliable, bypasses RLS)
      let vendorUserMap = new Map<string, string>()
      if (vendorProfileIds.length > 0) {
        crumb.supabase('select', 'vendor_profiles (notification lookup)')
        const { data: vendorProfiles } = await serviceClient
          .from('vendor_profiles')
          .select('id, user_id')
          .in('id', vendorProfileIds)

        vendorUserMap = new Map(
          (vendorProfiles || []).map(vp => [vp.id, vp.user_id])
        )
      }

      const vendorNotifications = new Map<string, { userId: string; items: string[]; marketName: string }>()
      for (const item of fullOrder.order_items) {
        const vendorProfileId = (item as Record<string, unknown>).vendor_profile_id as string
        const vendorUserId = vendorUserMap.get(vendorProfileId)
        if (!vendorUserId) {
          crumb.logic('Skipping vendor notification — no user_id found', { vendorProfileId })
          continue
        }
        const existing = vendorNotifications.get(vendorUserId)
        if (existing) {
          existing.items.push((item.listing as any)?.title || 'Item')
        } else {
          vendorNotifications.set(vendorUserId, {
            userId: vendorUserId,
            items: [(item.listing as any)?.title || 'Item'],
            marketName: (item.markets as any)?.name || '',
          })
        }
      }
      for (const [vendorUserId, info] of vendorNotifications) {
        await sendNotification(vendorUserId, 'new_paid_order', {
          orderNumber: fullOrder.order_number,
          itemTitle: info.items.length === 1 ? info.items[0] : `${info.items.length} items`,
          marketName: info.marketName,
        })
      }
    }

    return NextResponse.json({ success: true, orderId, order: fullOrder })
  })
}
