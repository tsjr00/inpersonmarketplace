/**
 * Types + constants for FT park-spot bookings (migration 172).
 */

export type ParkSpotBookingStatus = 'pending_payment' | 'paid' | 'cancelled' | 'completed'

/** Row shape from the `park_spot_bookings` table. */
export interface ParkSpotBookingRow {
  id: string
  market_id: string
  vendor_profile_id: string
  spot_id: string
  booking_date: string
  price_cents: number
  status: ParkSpotBookingStatus
  booking_group_id: string | null
  stripe_checkout_session_id: string | null
  stripe_payment_intent_id: string | null
  agreement_acceptance_id: string | null
  booked_at: string
  paid_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

/** Minimum total vendor charge for a park-spot booking (user decision
 *  2026-07-01: $5 FT minimum purchase — sits well above Stripe's ~$0.50 floor). */
export const PARK_SPOT_MIN_CHARGE_CENTS = 500

/** Safety cap on dates per booking request (a week is ~7 operating days). */
export const PARK_SPOT_MAX_DATES = 14
