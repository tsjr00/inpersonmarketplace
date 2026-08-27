/**
 * Event demand model — ONE estimate of "how many people will order, and how
 * hard the busiest wave hits", shared by every consumer that used to guess
 * separately (owner 2026-08-26: "revisit this logic now that we have better
 * data for wave capacity and get rid of assumptions that were placeholders").
 *
 * Before this module there were four models that disagreed:
 *   - the intake form's vendor_count suggestion (its own buyer-rate table keyed
 *     by EVENT TYPE, plus a "half of all orders land in one wave" placeholder)
 *   - the admin viability scorer (a different table keyed by PAYMENT MODEL +
 *     lunch/not + ticketed — the one the owner had actually reviewed)
 *   - wave generation (the real thing: the SUM of accepted vendors' per-event
 *     capacity claims)
 *   - the backup bench (orders ÷ a 30-per-wave placeholder)
 *
 * Decisions (owner 2026-08-26):
 *   1. Orders = the organizer's expected_meal_count when given; otherwise
 *      headcount × the viability rate table. Competing food → the LOW end.
 *   2. Peak = average orders per wave × (1 + PEAK_WAVE_MARGIN). One knob, one
 *      sentence to organizers ("we plan for a busier-than-average wave").
 *   3. Pool capacity at intake = the MEDIAN of vendors' readiness capacity,
 *      not the mean (one optimistic truck can't skew it).
 *   4. Where accepted vendors exist (selection time), check their real
 *      per-event claims against the expected peak — that is the better data.
 *   5. The helper copy never reveals pool size or averages.
 *   6. Calibrate from real events later: every input here is stored on the
 *      request, so predictions can be recomputed against actual orders per wave.
 *
 * Pure functions only. No I/O.
 */

/** What share of attendees actually order, by demand profile. Owner-reviewed
 *  table (viability scorer, 2026-04); now the single source. */
export const BUYER_RATES: Record<DemandProfile, { low: number; high: number; label: string }> = {
  // Company-paid: everyone eats (company is paying)
  company_paid: { low: 0.9, high: 1.0, label: '90-100% (company paying)' },
  // Employee-paid: varies by time and context
  attendee_paid_lunch: { low: 0.6, high: 0.8, label: '60-80% (lunch hour)' },
  attendee_paid_other: { low: 0.3, high: 0.5, label: '30-50% (non-lunch)' },
  // Crowd events: public foot traffic
  crowd: { low: 0.1, high: 0.3, label: '10-30% (public event)' },
  crowd_ticketed: { low: 0.15, high: 0.4, label: '15-40% (ticketed event)' },
}

export type DemandProfile =
  | 'company_paid'
  | 'attendee_paid_lunch'
  | 'attendee_paid_other'
  | 'crowd'
  | 'crowd_ticketed'

/** The single safety margin over the average wave. Replaces the old
 *  "50% of orders in one wave" placeholder. */
export const PEAK_WAVE_MARGIN = 0.25

/** Default wave length in minutes (matches wave generation). */
export const DEFAULT_WAVE_MINUTES = 30

/** Fallback per-vendor capacity when the pool has no readiness data at all. */
export const FALLBACK_CAPACITY_PER_WAVE = 30

/** Hard bounds on the suggested vendor count. */
export const MIN_SUGGESTED_VENDORS = 1
export const MAX_SUGGESTED_VENDORS = 20

/** 11:00–13:59 start = lunch hour. Unknown start = assume lunch (viability's rule). */
export function isLunchStart(startTime: string | null | undefined): boolean {
  if (!startTime) return true
  const hour = parseInt(startTime.split(':')[0], 10)
  if (isNaN(hour)) return true
  return hour >= 11 && hour <= 13
}

/**
 * Number of ordering waves in the service window. Moved here from
 * viability.ts (which re-exports it) so every consumer counts the same way.
 * No times → 4 waves (a 2-hour default).
 */
export function calculateWaveCount(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  waveDurationMin: number = DEFAULT_WAVE_MINUTES
): number {
  if (!startTime || !endTime) return 4
  const s = startTime.split(':').map(Number)
  const e = endTime.split(':').map(Number)
  if (s.length < 2 || e.length < 2 || s.some(isNaN) || e.some(isNaN)) return 4
  const minutes = (e[0] * 60 + e[1]) - (s[0] * 60 + s[1])
  if (minutes <= 0) return 4
  return Math.max(1, Math.ceil(minutes / Math.max(1, waveDurationMin)))
}

export interface DemandProfileInput {
  paymentModel: string | null | undefined
  eventType: string | null | undefined
  startTime: string | null | undefined
  isTicketed: boolean
}

/**
 * Which rate applies. Mirrors viability's product-model rules: crowd event
 * types are crowds regardless of payment; an explicit attendee_paid model is
 * attendee-paid; corporate lunch / team building default to company-paid;
 * everything else is attendee-paid — then lunch/not decides the band.
 */
export function resolveDemandProfile(input: DemandProfileInput): DemandProfile {
  const crowdTypes = ['grand_opening', 'festival']
  if (input.eventType && crowdTypes.includes(input.eventType)) {
    return input.isTicketed ? 'crowd_ticketed' : 'crowd'
  }
  const attendeePaid =
    input.paymentModel === 'attendee_paid' ||
    (input.paymentModel !== 'company_paid' &&
      input.paymentModel !== 'hybrid' &&
      input.eventType !== 'corporate_lunch' &&
      input.eventType !== 'team_building')
  if (!attendeePaid) return 'company_paid'
  return isLunchStart(input.startTime) ? 'attendee_paid_lunch' : 'attendee_paid_other'
}

export interface DemandInput extends DemandProfileInput {
  headcount: number | null | undefined
  /** Organizer's own expected number of buyers — wins when present. */
  expectedMealCount: number | null | undefined
  /** Organizer noted competing food options → use the LOW end of the band. */
  hasCompetingFood: boolean
}

export interface DemandEstimate {
  orders: number
  profile: DemandProfile
  rate: { low: number; high: number; label: string }
  /** 'organizer' = expectedMealCount used verbatim; 'rate' = headcount × band. */
  basis: 'organizer' | 'rate'
  /** True when competing food pulled the estimate to the band's low end. */
  usedLowEnd: boolean
}

export function estimateOrders(input: DemandInput): DemandEstimate {
  const profile = resolveDemandProfile(input)
  const rate = BUYER_RATES[profile]
  if (input.expectedMealCount && input.expectedMealCount > 0) {
    return { orders: Math.round(input.expectedMealCount), profile, rate, basis: 'organizer', usedLowEnd: false }
  }
  const headcount = Math.max(0, Math.round(input.headcount ?? 0))
  const pct = input.hasCompetingFood ? rate.low : (rate.low + rate.high) / 2
  return { orders: Math.round(headcount * pct), profile, rate, basis: 'rate', usedLowEnd: input.hasCompetingFood }
}

/** Orders the busiest wave is planned for: average per wave × (1 + margin). */
export function expectedPeakOrdersPerWave(orders: number, waveCount: number): number {
  const avg = Math.max(0, orders) / Math.max(1, waveCount)
  return Math.ceil(avg * (1 + PEAK_WAVE_MARGIN))
}

/** Median of a list (empty → null). Used for pool capacity at intake. */
export function median(values: number[]): number | null {
  const sorted = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export interface SuggestVendorCountInput {
  peakOrdersPerWave: number
  /** What one vendor can serve per wave (pool median at intake). */
  capacityPerWave: number
  /** Cuisines/categories the organizer asked for. */
  categoryCount: number
  /** Average distinct categories each pool vendor covers (≥ 1). */
  avgCategoriesPerVendor: number
}

export interface VendorCountSuggestion {
  suggested: number
  capacityVendors: number
  varietyVendors: number
}

/** max(capacity need, variety need), clamped to [1, 20]. */
export function suggestVendorCount(input: SuggestVendorCountInput): VendorCountSuggestion {
  const capacityVendors = Math.max(
    1,
    Math.ceil(Math.max(0, input.peakOrdersPerWave) / Math.max(1, input.capacityPerWave))
  )
  const varietyVendors = input.categoryCount > 0
    ? Math.max(1, Math.ceil(input.categoryCount / Math.max(1, input.avgCategoriesPerVendor)))
    : 0
  const raw = Math.max(capacityVendors, varietyVendors)
  return {
    suggested: Math.max(MIN_SUGGESTED_VENDORS, Math.min(MAX_SUGGESTED_VENDORS, raw)),
    capacityVendors,
    varietyVendors,
  }
}

export interface CapacityCheck {
  ok: boolean
  /** Orders per wave the accepted vendors cannot cover (0 when ok). */
  shortfallPerWave: number
  /** acceptedCapacity ÷ peak, as a whole percent (≥ 100 when ok). */
  coveragePct: number
}

/**
 * Selection-time check — the "better data": the accepted vendors' real
 * per-event claims (event_max_orders_per_wave) against the expected peak.
 */
export function checkAcceptedCapacity(peakOrdersPerWave: number, acceptedCapacityPerWave: number): CapacityCheck {
  const peak = Math.max(0, peakOrdersPerWave)
  const cap = Math.max(0, acceptedCapacityPerWave)
  if (peak === 0) return { ok: true, shortfallPerWave: 0, coveragePct: 100 }
  return {
    ok: cap >= peak,
    shortfallPerWave: Math.max(0, peak - cap),
    coveragePct: Math.round((cap / peak) * 100),
  }
}
