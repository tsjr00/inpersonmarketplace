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
import { nowInTimezoneLocalIso, todayInTimezone } from '@/lib/time/market-dates'

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
 * FT: 1 hour after preferred_pickup_time (user decision OL-R19, Session 54).
 *     preferred_pickup_time is the MARKET-LOCAL wall-clock pickup time, so the
 *     comparison is done local-vs-local in `marketTimezone` — never stamped as
 *     UTC (doing so fired the no-show hours early; timezone drift fix #3).
 * FM: date-based — trigger when pickup_date < today, in the market's timezone.
 * FT fallback: if no preferred_pickup_time, uses date-based like FM.
 *
 * `marketTimezone` defaults to America/Chicago (matches the DB/JS convention).
 */
export function shouldTriggerNoShow(
  pickupDate: string,
  preferredPickupTime: string | null,
  verticalId: string,
  marketTimezone?: string | null,
  now?: Date,
): boolean {
  const ref = now ?? new Date()
  const tz = marketTimezone || 'America/Chicago'

  // FT with a specific pickup time: trigger 1 hour after that LOCAL time.
  if (verticalId === 'food_trucks' && preferredPickupTime) {
    // pickupDate = "YYYY-MM-DD", preferredPickupTime = "HH:MM" or "HH:MM:SS"
    const timePart = preferredPickupTime.includes(':') && preferredPickupTime.split(':').length === 2
      ? `${preferredPickupTime}:00` : preferredPickupTime
    const [y, mo, d] = pickupDate.split('-').map(Number)
    const [hh, mm, ss] = timePart.split(':').map(Number)

    if ([y, mo, d, hh, mm].every((n) => Number.isFinite(n))) {
      // Build the fire moment (pickup local time + 1h) as a market-local
      // wall-clock string. Date.UTC is only an arithmetic vehicle here — we read
      // back UTC components as the wall clock, so no timezone is applied — then
      // compare against "now" expressed in the same market-local wall clock.
      const fire = new Date(Date.UTC(y!, mo! - 1, d!, hh!, mm!, ss || 0) + 60 * 60 * 1000)
      const p = (n: number) => String(n).padStart(2, '0')
      const fireLocal = `${fire.getUTCFullYear()}-${p(fire.getUTCMonth() + 1)}-${p(fire.getUTCDate())}T${p(fire.getUTCHours())}:${p(fire.getUTCMinutes())}:${p(fire.getUTCSeconds())}`
      return nowInTimezoneLocalIso(tz, ref) >= fireLocal
    }
    // If parsing fails, fall through to date-based
  }

  // FM / default / FT fallback: trigger when pickup_date is before today
  // in the market's own timezone.
  return pickupDate < todayInTimezone(tz, ref)
}
