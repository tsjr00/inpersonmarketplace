import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/config'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/checkout/success', 'GET', async () => {
    const supabase = await createClient()
    const sessionId = request.nextUrl.searchParams.get('session_id')

    if (!sessionId) {
      throw traced.validation('ERR_CHECKOUT_003', 'Missing session_id')
    }

    // Verify session with Stripe
    crumb.logic('Retrieving Stripe checkout session')
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.payment_status !== 'paid') {
      throw traced.external('ERR_CHECKOUT_003', 'Payment not completed', { paymentStatus: session.payment_status })
    }

    const orderId = session.metadata?.order_id
    const paymentIntentId = session.payment_intent as string

    console.log('[checkout/success] Processing payment:', { orderId, paymentIntentId, sessionId })

    if (!orderId) {
      console.error('[checkout/success] Missing order_id in session metadata')
      throw traced.validation('ERR_CHECKOUT_004', 'Missing order_id in session metadata')
    }

    // Use service client for payment operations (buyers don't have RLS insert permission on payments)
    const serviceClient = createServiceClient()

    // Get order to calculate platform fee
    crumb.supabase('select', 'orders')
    const { data: order, error: orderError } = await serviceClient
      .from('orders')
      .select('platform_fee_cents')
      .eq('id', orderId)
      .single()

    if (orderError) {
      console.error('[checkout/success] Error fetching order:', orderError)
    }

    // Update order status to paid
    // Note: grace_period_ends_at column doesn't exist - calculate from created_at when needed
    crumb.supabase('update', 'orders')
    const { error: updateError } = await serviceClient
      .from('orders')
      .update({ status: 'paid' })
      .eq('id', orderId)

    if (updateError) {
      console.error('[checkout/success] Error updating order status:', updateError)
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
        platform_fee_cents: order?.platform_fee_cents || 0,
        status: 'succeeded',
        paid_at: new Date().toISOString(),
      })

      if (insertError) {
        console.error('[checkout/success] Error inserting payment record:', insertError)
        throw traced.fromSupabase(insertError, { table: 'payments', operation: 'insert' })
      }
      console.log('[checkout/success] Payment record created successfully')

      // Decrement inventory for purchased items (only on first successful payment processing)
      crumb.supabase('select', 'order_items')
      const { data: orderItems, error: orderItemsError } = await serviceClient
        .from('order_items')
        .select('listing_id, quantity')
        .eq('order_id', orderId)

      if (orderItemsError) {
        console.error('[checkout/success] Error fetching order items for inventory update:', orderItemsError)
      } else if (orderItems && orderItems.length > 0) {
        crumb.logic('Decrementing inventory for purchased items')

        // Group quantities by listing_id (same listing could appear multiple times)
        const quantityByListing = new Map<string, number>()
        for (const item of orderItems) {
          const current = quantityByListing.get(item.listing_id) || 0
          quantityByListing.set(item.listing_id, current + item.quantity)
        }

        // Decrement each listing's quantity (skip if quantity is null = unlimited)
        for (const [listingId, quantityPurchased] of quantityByListing) {
          // First check if listing has limited quantity
          const { data: listing } = await serviceClient
            .from('listings')
            .select('quantity')
            .eq('id', listingId)
            .single()

          if (listing && listing.quantity !== null) {
            const newQuantity = Math.max(0, listing.quantity - quantityPurchased)
            const { error: updateError } = await serviceClient
              .from('listings')
              .update({ quantity: newQuantity })
              .eq('id', listingId)

            if (updateError) {
              console.error(`[checkout/success] Error updating inventory for listing ${listingId}:`, updateError)
            } else {
              console.log(`[checkout/success] Inventory updated: listing ${listingId} ${listing.quantity} -> ${newQuantity}`)
            }
          }
        }
      }
    } else {
      console.log('[checkout/success] Payment record already exists (skipping inventory decrement)')
    }

    // Clear the buyer's cart after successful payment
    crumb.auth('Getting user for cart cleanup')
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
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
          schedule_id,
          pickup_date,
          pickup_snapshot,
          markets!market_id(id, name, market_type, address, city, state),
          listing:listings(
            title,
            vendor_profiles(profile_data)
          )
        )
      `)
      .eq('id', orderId)
      .single()

    return NextResponse.json({ success: true, orderId, order: fullOrder })
  })
}
