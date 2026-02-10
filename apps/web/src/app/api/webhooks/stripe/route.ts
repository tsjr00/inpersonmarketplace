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

    // Step 2: Handle event - return 500 on failure so Stripe retries
    // Stripe retries up to 16 times over 72 hours with exponential backoff
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

      // Return 500 so Stripe retries — transient errors (DB down, network blip)
      // are the most likely cause. Stripe will retry with exponential backoff.
      // Permanent errors (missing metadata, unknown event) are handled via early
      // returns inside handleWebhookEvent and never reach this catch block.
      return NextResponse.json(
        { error: 'Processing failed - will be retried' },
        { status: 500 }
      )
    }
  })
}
