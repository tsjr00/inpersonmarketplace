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

    // Update order status
    await supabase
      .from('orders')
      .update({ status: 'paid' })
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

    return NextResponse.json({ success: true, orderId })
  } catch (error) {
    console.error('Success handler error:', error)
    return NextResponse.json({ error: 'Failed to process success' }, { status: 500 })
  }
}
