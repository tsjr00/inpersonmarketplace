/**
 * No-Show Payout Logic — Phase 4
 *
 * Extracted from: src/app/api/cron/expire-orders/route.ts (Phase 4)
 * Purpose: Calculate vendor payout for buyer no-shows (vendor prepared
 * the order, buyer didn't pick up). Also determines WHEN to trigger
 * no-show based on vertical-specific rules.
 *
 * Pure functions — no DB, no Stripe, no side effects.
 */

/**
 * Calculate the vendor payout amount for a no-show item.
 * Vendor gets: vendor_payout_cents + prorated tip share.
 * Tip share excludes the platform fee tip portion.
 */
export function calculateNoShowPayout(params: {
  vendorPayoutCents: number
  tipAmount: number
  tipOnPlatformFeeCents: number
  totalItemsInOrder: number
}): number {
  const { vendorPayoutCents, tipAmount, tipOnPlatformFeeCents, totalItemsInOrder } = params
  const vendorTipCents = tipAmount - tipOnPlatformFeeCents
  const itemCount = totalItemsInOrder > 0 ? totalItemsInOrder : 1
  const tipShareCents = Math.round(vendorTipCents / itemCount)
  return vendorPayoutCents + tipShareCents
}

/**
 * Determine if a no-show should be triggered based on pickup timing.
 *
 * FT: 1 hour after preferred_pickup_time (user decision OL-R19, Session 54)
 * FM: date-based — trigger when pickup_date < today (midnight rollover)
 * FT fallback: if no preferred_pickup_time, uses date-based like FM.
 */
export function shouldTriggerNoShow(
  pickupDate: string,
  preferredPickupTime: string | null,
  verticalId: string,
  now?: Date,
): boolean {
  const ref = now ?? new Date()

  // FT with a specific pickup time: trigger 1 hour after that time
  if (verticalId === 'food_trucks' && preferredPickupTime) {
    // Build a Date from pickupDate + preferredPickupTime (UTC — cron runs on Vercel/UTC)
    // pickupDate = "YYYY-MM-DD", preferredPickupTime = "HH:MM" or "HH:MM:SS"
    const timePart = preferredPickupTime.includes(':') && preferredPickupTime.split(':').length === 2
      ? `${preferredPickupTime}:00` : preferredPickupTime
    const dateTimeStr = `${pickupDate}T${timePart}Z`
    const pickupDateTime = new Date(dateTimeStr)

    if (!isNaN(pickupDateTime.getTime())) {
      const oneHourAfter = new Date(pickupDateTime.getTime() + 60 * 60 * 1000)
      return ref >= oneHourAfter
    }
    // If parsing fails, fall through to date-based
  }

  // FM / default / FT fallback: trigger when pickup_date is before today
  const today = ref.toISOString().split('T')[0]
  return pickupDate < today
}
