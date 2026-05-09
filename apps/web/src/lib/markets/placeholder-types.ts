/**
 * Types for the off-platform booth placeholder system (migration 135).
 *
 * A placeholder records "booth N at this market is occupied by a vendor not
 * on the platform." It mirrors a market_vendors row's booth_number field but
 * lives in its own table because no vendor_profile_id exists.
 */

/** Row shape returned from `market_booth_placeholders`. */
export interface BoothPlaceholderRow {
  id: string
  market_id: string
  inventory_id: string | null
  booth_number: string
  notes: string | null
  created_at: string
  updated_at: string
}

/** Input shape used by manager UI to add or update a placeholder. */
export interface BoothPlaceholderInput {
  inventory_id?: string | null
  booth_number: string
  notes?: string | null
}

/** Validation rules for manager-supplied input. Returns null if valid,
 *  otherwise a human-readable error message. The same-market integrity
 *  check on inventory_id lives in the database trigger
 *  (trg_booth_placeholder_inventory_market) — application layer only
 *  enforces shape and length here. */
export function validateBoothPlaceholderInput(input: BoothPlaceholderInput): string | null {
  const trimmed = input.booth_number?.trim() ?? ''
  if (trimmed.length === 0) return 'Booth number is required'
  if (trimmed.length > 50) return 'Booth number must be 50 characters or fewer'
  if (input.notes && input.notes.length > 500) return 'Notes must be 500 characters or fewer'
  return null
}
