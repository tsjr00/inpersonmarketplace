import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { verifyAdminScope } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import {
  detectQueryType,
  reconcileStripeObject,
  reconcileByOrderNumber,
  reconcileByEmail,
  reconcilePayout,
} from '@/lib/stripe/reconcile'

/**
 * POST /api/admin/stripe-reconcile
 *
 * Body: { query: string, vertical?: string }
 *   - query: paste a Stripe ID (pi_/ch_/tr_/po_), an order number (FA-2026-XXX),
 *            or an email
 *   - vertical: required for non-platform admins to scope results
 *
 * Returns { type: '...', result: ... } where type drives UI rendering.
 *
 * Auth: admin only. Vertical admins are scoped to their assigned vertical;
 * platform admins see everything.
 *
 * Stripe call budget: 0 for order_number/email lookups; 1 for pi/ch/tr;
 * 2 for payout (po_xxx → audit view).
 */
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/admin/stripe-reconcile', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`stripe-reconcile:${clientIp}`, rateLimits.api)
    if (!rl.success) return rateLimitResponse(rl)

    const body = await request.json().catch(() => ({}))
    const query = (body?.query || '').toString().trim()
    const requestedVertical = body?.vertical ? String(body.vertical) : null

    if (!query) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 })
    }

    const scope = await verifyAdminScope(requestedVertical)
    if (!scope || !scope.authorized) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const serviceClient = createServiceClient()
    const detected = detectQueryType(query)

    if (detected.kind === 'unknown') {
      return NextResponse.json({
        type: 'unknown',
        error: `Unrecognized query format: "${query}". Try a Stripe ID (pi_/ch_/tr_/po_), an order number (FA-2026-...), or an email address.`,
      }, { status: 400 })
    }

    if (detected.kind === 'order_number') {
      const result = await reconcileByOrderNumber(serviceClient, detected.value, scope)
      return NextResponse.json({ type: 'order_number', result })
    }

    if (detected.kind === 'email') {
      const result = await reconcileByEmail(serviceClient, detected.value, scope)
      return NextResponse.json({ type: 'email', result })
    }

    if (detected.kind === 'stripe_payout') {
      const result = await reconcilePayout(serviceClient, detected.id, scope)
      if ('error' in result) {
        return NextResponse.json({ type: 'payout', error: result.error }, { status: 502 })
      }
      return NextResponse.json({ type: 'payout', result })
    }

    if (
      detected.kind === 'stripe_payment_intent' ||
      detected.kind === 'stripe_charge' ||
      detected.kind === 'stripe_transfer'
    ) {
      const result = await reconcileStripeObject(serviceClient, detected.id, scope)
      return NextResponse.json({ type: 'stripe_object', result })
    }

    if (detected.kind === 'stripe_refund') {
      // Refunds aren't first-class in v1 — return a hint
      return NextResponse.json({
        type: 'unsupported',
        error: 'Refund (re_*) lookup is not yet supported. Use the underlying charge or payment intent ID instead.',
      }, { status: 400 })
    }

    return NextResponse.json({ type: 'unknown', error: 'Unhandled query type' }, { status: 400 })
  })
}
