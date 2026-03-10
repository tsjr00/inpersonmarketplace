/**
 * Webhook Utilities — Event Types + Metadata Parsing
 *
 * Extracted from: src/lib/stripe/webhooks.ts
 * Purpose: Centralize the list of handled Stripe event types and
 * metadata parsing helpers used across webhook handlers.
 *
 * Pure functions — no Stripe SDK, no DB, no side effects.
 */

/** All Stripe event types handled by our webhook */
export const HANDLED_EVENT_TYPES = [
  'checkout.session.completed',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'account.updated',
  'transfer.created',
  'transfer.reversed',
  'charge.refunded',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
] as const

export type HandledEventType = (typeof HANDLED_EVENT_TYPES)[number]

/** Check if an event type string is one we handle */
export function isHandledEventType(type: string): type is HandledEventType {
  return (HANDLED_EVENT_TYPES as readonly string[]).includes(type)
}

/**
 * Select the base price for a market box subscription based on term length.
 * Priority: metadata value → term-appropriate offering price → fallback.
 *
 * 8-week: price_8week_cents → price_4week_cents → price_cents
 * 4-week: price_4week_cents → price_cents
 */
export function selectBasePriceForTermWeeks(
  meta: { basePriceCentsFromMeta?: number },
  offering: { price_cents: number; price_4week_cents?: number | null; price_8week_cents?: number | null },
  termWeeks: number,
): number {
  // Metadata takes priority (set at checkout time)
  if (meta.basePriceCentsFromMeta && meta.basePriceCentsFromMeta > 0) {
    return meta.basePriceCentsFromMeta
  }

  if (termWeeks === 8) {
    return offering.price_8week_cents || offering.price_4week_cents || offering.price_cents
  }
  return offering.price_4week_cents || offering.price_cents
}
