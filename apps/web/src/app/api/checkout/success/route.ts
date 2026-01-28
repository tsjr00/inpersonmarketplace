import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/config'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const sessionId = request.nextUrl.searchParams.get('session_id')

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
  }

  try {
    // Verify session with Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 400 })
    }

    const orderId = session.metadata?.order_id

    // Get order to calculate platform fee
    const { data: order } = await supabase
      .from('orders')
      .select('platform_fee_cents')
      .eq('id', orderId)
      .single()

    // Update order status and set grace period (1 hour from now)
    const gracePeriodEndsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    await supabase
      .from('orders')
      .update({ status: 'paid', grace_period_ends_at: gracePeriodEndsAt })
      .eq('id', orderId)

    // Create payment record (idempotent - skip if already created by webhook)
    const paymentIntentId = session.payment_intent as string
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .single()

    if (!existingPayment) {
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
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: cart } = await supabase
        .from('carts')
        .select('id')
        .eq('user_id', user.id)
        .single()
      if (cart) {
        await supabase.from('cart_items').delete().eq('cart_id', cart.id)
      }
    }

    // Fetch full order details for the success page
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
          markets!market_id(id, name, market_type, city, state),
          listing:listings(
            title,
            vendor_profiles(profile_data)
          )
        )
      `)
      .eq('id', orderId)
      .single()

    return NextResponse.json({ success: true, orderId, order: fullOrder })
  } catch (error) {
    console.error('Success handler error:', error)
    return NextResponse.json({ error: 'Failed to process success' }, { status: 500 })
  }
}
