/**
 * Types for the FT park-spots system (migration 171).
 *
 * Individual truck spots at a park (`park_mode='paid'`). Unlike FM's
 * count-based booth size tiers (`market_booth_inventory`), each row is ONE
 * real spot with attributes. `base_price_cents` is PER DAY (fed to the
 * unit-agnostic pricing.ts `calculateBoothRentalFees` in P2).
 */

export type SpotPower = 'shore' | 'generator_ok' | 'none'

/** Row shape returned from the `park_spots` table. */
export interface ParkSpotRow {
  id: string
  market_id: string
  label: string
  max_length_ft: number | null
  power: SpotPower
  has_water: boolean
  base_price_cents: number
  recurring_eligible: boolean
  active: boolean
  created_at: string
  updated_at: string
}

/** Input shape the manager supplies to add or edit a spot. */
export interface ParkSpotInput {
  label: string
  max_length_ft?: number | null
  power: SpotPower
  has_water: boolean
  base_price_cents: number
  recurring_eligible: boolean
  active?: boolean
}

export const SPOT_POWER_VALUES: SpotPower[] = ['shore', 'generator_ok', 'none']

export const SPOT_POWER_OPTIONS: { value: SpotPower; label: string }[] = [
  { value: 'none', label: 'No power' },
  { value: 'generator_ok', label: 'Generator allowed' },
  { value: 'shore', label: 'Shore power' },
]

/** Validation for manager-supplied input. Null if valid, else a message. */
export function validateParkSpotInput(input: ParkSpotInput): string | null {
  const label = input.label?.trim() ?? ''
  if (label.length === 0) return 'Spot label is required'
  if (label.length > 50) return 'Spot label must be 50 characters or fewer'
  if (input.max_length_ft !== null && input.max_length_ft !== undefined) {
    if (!Number.isInteger(input.max_length_ft) || input.max_length_ft <= 0) {
      return 'Max length must be a positive whole number of feet'
    }
    if (input.max_length_ft > 200) return 'Max length over 200 ft looks unusual — check the value'
  }
  if (!SPOT_POWER_VALUES.includes(input.power)) return 'Invalid power option'
  if (!Number.isInteger(input.base_price_cents) || input.base_price_cents < 0) {
    return 'Daily price must be a non-negative integer (in cents)'
  }
  if (input.base_price_cents > 1_000_000) return 'Daily price over $10,000 looks unusual — check the value'
  return null
}
