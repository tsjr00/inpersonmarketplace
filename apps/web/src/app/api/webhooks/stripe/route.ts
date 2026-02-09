import { NextRequest, NextResponse } from 'next/server'
import { constructEvent, handleWebhookEvent } from '@/lib/stripe/webhooks'
import { withErrorTracing } from '@/lib/errors'

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/webhooks/stripe', 'POST', async () => {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      return NextResponse.json({ error: 'No signature' }, { status: 400 })
    }

    // Step 1: Verify signature - return 400 on failure (don't retry invalid signatures)
    let event
    try {
      event = constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      )
    } catch (signatureError) {
      console.error('Webhook signature verification failed:', signatureError)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    // Step 2: Handle event - return 200 even on failure to prevent infinite Stripe retries
    // Log the error for admin investigation but acknowledge receipt
    try {
      await handleWebhookEvent(event)
      return NextResponse.json({ received: true })
    } catch (handlerError) {
      // Log the error with event details for debugging
      console.error('Webhook handler error:', {
        eventId: event.id,
        eventType: event.type,
        error: handlerError instanceof Error ? handlerError.message : handlerError,
      })

      // Return 200 to acknowledge receipt - Stripe won't retry
      // The error is logged above for admin to investigate
      return NextResponse.json({
        received: true,
        warning: 'Event received but handler failed - see logs'
      })
    }
  })
}
