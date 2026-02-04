import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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

    // Get order to calculate platform fee
    crumb.supabase('select', 'orders')
    const { data: order } = await supabase
      .from('orders')
      .select('platform_fee_cents')
      .eq('id', orderId)
      .single()

    // Update order status and set grace period (1 hour from now)
    crumb.supabase('update', 'orders')
    const gracePeriodEndsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    await supabase
      .from('orders')
      .update({ status: 'paid', grace_period_ends_at: gracePeriodEndsAt })
      .eq('id', orderId)

    // Create payment record (idempotent - skip if already created by webhook)
    crumb.supabase('select', 'payments')
    const paymentIntentId = session.payment_intent as string
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .single()

    if (!existingPayment) {
      crumb.supabase('insert', 'payments')
      await supabase.from('payments').insert({
        order_id: orderId,
        stripe_payment_intent_id: paymentIntentId,
        amount_cents: session.amount_total!,
        platform_fee_cents: order?.platform_fee_cents || 0,
        status: 'succeeded',
        paid_at: new Date().toISOString(),
      })
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
          pickup_date,
          pickup_start_time,
          pickup_end_time,
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
