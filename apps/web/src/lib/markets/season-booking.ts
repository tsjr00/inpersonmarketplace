import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateBoothRentalFees } from '@/lib/pricing'

/**
 * Phase E — season/partial booking orchestration (no Stripe).
 *
 * Calls the atomic book_season_atomic RPC (mig 165), which creates the
 * booth_booking_groups row + one child weekly_booth_rentals per week in ONE
 * transaction (all-or-nothing). Then computes the group's fee totals from the
 * returned per-week snapshot prices via pricing.ts (the single source of fee
 * truth — per-week rounding matches the Stripe-line-item convention) and
 * persists them onto the group. The caller wires the Stripe checkout next.
 */

export interface SeasonBookingChild {
  rentalId: string
  weekStartDate: string
  priceCents: number
  boothNumber: string | null
}

export interface SeasonBookingResult {
  groupId: string
  children: SeasonBookingChild[]
  totalVendorCents: number
  totalManagerCents: number
}

/** Thrown when a specific week can't be booked (overbooked/duplicate) — feeds the O3 message. */
export class SeasonWeekUnavailableError extends Error {
  constructor(public week: string, public reason: string) {
    super(`Week ${week} is no longer available (${reason})`)
    this.name = 'SeasonWeekUnavailableError'
  }
}

export async function createSeasonBookingGroup(
  serviceClient: SupabaseClient,
  params: {
    vendorProfileId: string
    marketId: string
    inventoryId: string
    acceptanceId: string
    seasonId: string | null
    kind: 'season' | 'partial'
    weekStartDates: string[]
    purchaseDate: string
  },
): Promise<SeasonBookingResult> {
  const { data, error } = await serviceClient.rpc('book_season_atomic', {
    p_vendor_profile_id: params.vendorProfileId,
    p_market_id: params.marketId,
    p_inventory_id: params.inventoryId,
    p_acceptance_id: params.acceptanceId,
    p_season_id: params.seasonId,
    p_kind: params.kind,
    p_week_start_dates: params.weekStartDates,
    p_purchase_date: params.purchaseDate,
  })

  if (error) {
    // The RPC annotates a per-week conflict as: SEASON_BOOK_FAILED week=YYYY-MM-DD reason=...
    const m = /SEASON_BOOK_FAILED week=(\S+) reason=(.+)/.exec(error.message || '')
    if (m) throw new SeasonWeekUnavailableError(m[1], m[2])
    throw error
  }

  const rows = (data ?? []) as Array<{
    group_id: string
    rental_id: string
    rental_week_start_date: string
    rental_price_cents: number
    rental_booth_number: string | null
  }>
  if (rows.length === 0) {
    throw new Error('book_season_atomic returned no rows')
  }

  const groupId = rows[0].group_id
  let totalVendorCents = 0
  let totalManagerCents = 0
  const children: SeasonBookingChild[] = rows.map((r) => {
    // Per-week rounding (matches Stripe line items / the per-item rounding decision).
    const fees = calculateBoothRentalFees(r.rental_price_cents)
    totalVendorCents += fees.vendorPaysCents
    totalManagerCents += fees.managerReceivesCents
    return {
      rentalId: r.rental_id,
      weekStartDate: r.rental_week_start_date,
      priceCents: r.rental_price_cents,
      boothNumber: r.rental_booth_number,
    }
  })

  // Persist the computed totals (the RPC inserted 0 placeholders).
  const { error: updErr } = await serviceClient
    .from('booth_booking_groups')
    .update({ total_vendor_cents: totalVendorCents, total_manager_cents: totalManagerCents })
    .eq('id', groupId)
  if (updErr) throw updErr

  return { groupId, children, totalVendorCents, totalManagerCents }
}
