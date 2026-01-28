import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/config'

export async function GET(request: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  const sessionId = request.nextUrl.searchParams.get('session_id')

  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    // Verify this is a subscription checkout
    if (session.mode !== 'subscription') {
      return NextResponse.json({ error: 'Invalid session type' }, { status: 400 })
    }

    // Get metadata
    const type = session.metadata?.type as 'vendor' | 'buyer' | undefined
    const cycle = session.metadata?.cycle

    return NextResponse.json({
      success: true,
      type: type || null,
      cycle: cycle || null,
      subscriptionId: session.subscription,
      customerId: session.customer,
    })
  } catch (error) {
    console.error('[subscription-verify] Error:', error)
    return NextResponse.json(
      { error: 'Failed to verify session' },
      { status: 500 }
    )
  }
}
