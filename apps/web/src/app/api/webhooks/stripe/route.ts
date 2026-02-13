import { NextRequest, NextResponse } from 'next/server'
import { constructEvent, handleWebhookEvent } from '@/lib/stripe/webhooks'
import { withErrorTracing } from '@/lib/errors'
import { TracedError } from '@/lib/errors/traced-error'
import { logError } from '@/lib/errors/logger'

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
      await logError(new TracedError('ERR_WEBHOOK_008', 'Webhook signature verification failed', { route: '/api/webhooks/stripe', method: 'POST' }))
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    // Step 2: Handle event - return 500 on failure so Stripe retries
    // Stripe retries up to 16 times over 72 hours with exponential backoff
    try {
      await handleWebhookEvent(event)
      return NextResponse.json({ received: true })
    } catch (handlerError) {
      // Log the error with event details for debugging
      await logError(new TracedError('ERR_WEBHOOK_009', `Webhook handler error: ${handlerError instanceof Error ? handlerError.message : String(handlerError)}`, { route: '/api/webhooks/stripe', method: 'POST' }))

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
