/**
 * Derive availability badge status from get_listings_accepting_status() RPC output.
 *
 * Used by browse page and vendor listings page to show open/closing-soon/closed badges.
 * The RPC is the single source of truth for availability (see VJ-R15).
 */

export interface AvailabilityInput {
  is_accepting: boolean
  hours_until_cutoff: number | null
  cutoff_hours: number | null
  vertical?: string
}

export interface AvailabilityStatus {
  status: 'open' | 'closing-soon' | 'closed'
  hoursUntilCutoff: number | null
}

/**
 * Derive badge status for buyer-facing pages (browse, listing detail).
 * No data or not accepting → closed.
 * Accepting and within cutoff window → closing-soon.
 * Otherwise → open.
 */
export function deriveAvailabilityStatus(avail: AvailabilityInput | undefined): AvailabilityStatus {
  if (!avail || !avail.is_accepting) {
    return { status: 'closed', hoursUntilCutoff: null }
  }
  // FT-specific: need ~31 min for time slot selection + 30 min pickup window
  // If less than ~1 hour remains, show closing-soon (buyer likely can't order)
  if (avail.vertical === 'food_trucks' && avail.hours_until_cutoff !== null && avail.hours_until_cutoff <= 1) {
    return { status: 'closing-soon', hoursUntilCutoff: Math.round(avail.hours_until_cutoff * 10) / 10 }
  }
  if (avail.hours_until_cutoff !== null && avail.cutoff_hours !== null
      && avail.hours_until_cutoff <= avail.cutoff_hours && avail.hours_until_cutoff > 0) {
    return { status: 'closing-soon', hoursUntilCutoff: Math.round(avail.hours_until_cutoff * 10) / 10 }
  }
  return { status: 'open', hoursUntilCutoff: null }
}

/**
 * Derive badge status for vendor listings page.
 * Non-published listings always return 'open' (no badge shown).
 * Published listings use the same logic as buyer-facing pages.
 */
export function deriveVendorAvailabilityStatus(avail: AvailabilityInput | undefined, listingStatus: string): AvailabilityStatus {
  if (listingStatus !== 'published') {
    return { status: 'open', hoursUntilCutoff: null }
  }
  return deriveAvailabilityStatus(avail)
}
