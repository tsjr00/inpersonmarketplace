/**
 * Backup-vendor bench sizing (owner decisions 2026-08-15, decisions.md
 * "Backup vendors — model decided"):
 *
 *   bench = ceil( likelihood% × SYSTEM-computed vendor requirement )
 *
 * The requirement is derived from the event's numbers (estimated orders ÷ what
 * an average vendor can serve), NOT the organizer's requested vendor count —
 * organizers guess. The likelihood starts at a PLACEHOLDER 10% (owner-picked
 * example number, explicitly not researched) and rises with organizer-declared
 * risk factors; the platform's own cancelled-after-confirm data replaces the
 * placeholder once it accumulates (per-vendor rates are already tracked).
 *
 * Risk factors are weighted EQUALLY for now (owner decision #4) — a per-risk
 * value-factor evaluation is backlogged; revisit the weights with data.
 *
 * Money (activation packages, penalties, waivers) is PHASE 3 and deliberately
 * absent here — this module only counts and recommends.
 */

/** Owner 2026-08-15: 10% placeholder until platform cancellation data replaces it. */
export const BACKUP_BASE_CANCEL_LIKELIHOOD = 0.10

/**
 * Equal per-factor bump (owner: "spread the risks out equally until we can
 * decide on a value factor per risk"). PLACEHOLDER value; the per-risk
 * evaluation in the backlog replaces this with per-factor weights.
 */
export const RISK_FACTOR_EQUAL_BUMP = 0.03

/**
 * What an average vendor serves per 30-minute wave, for the requirement
 * estimate only. PLACEHOLDER — mirrors the historical scorer default before
 * T-70 made real readiness a hard gate; refine from actual accepted-vendor
 * capacities when this graduates from placeholder.
 */
export const AVG_VENDOR_PER_WAVE = 30

/**
 * Attendee→order conversion band midpoint, matching the viability scorers'
 * assumption (10–30% of headcount order when meals aren't organizer-stated).
 */
export const AVG_BUYER_RATE = 0.2

/**
 * The organizer-declared cancellation-risk checklist (owner's examples plus
 * platform-reasoned additions, 2026-08-15). Shown in the event profile's
 * Logistics group; each checked factor bumps the likelihood equally.
 * ids are stored in catering_requests.cancellation_risk_factors (mig 232) —
 * NEVER rename an id without migrating stored values.
 */
export const CANCELLATION_RISK_FACTORS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'remote_location', label: 'Far from a population center (long drive for vendors)' },
  { id: 'off_road_access', label: 'Vendors must drive off-road or over rough ground to reach their spot' },
  { id: 'no_power_isolated', label: 'No electricity available in an isolated setting' },
  { id: 'exposed_weather', label: 'Fully outdoors with no cover in a rough-weather season' },
  { id: 'early_load_in', label: 'Load-in required before 7:00 AM' },
  { id: 'other_difficulty', label: 'Another condition that could make vendors reconsider as the date nears' },
]

export interface BenchRecommendationInput {
  headcount: number | null
  expectedMealCount: number | null
  waveCount: number
  riskFactorCount: number
}

export interface BenchRecommendation {
  /** ceil(likelihood × requirement), min 0 (a 1-vendor micro-event can round to 0 risk-free). */
  recommendedBackups: number
  /** The system-computed vendor requirement the % was applied to. */
  vendorRequirement: number
  /** The combined likelihood actually used (base + equal bumps). */
  likelihood: number
}

export function recommendBackupBench(input: BenchRecommendationInput): BenchRecommendation {
  const estimatedOrders =
    input.expectedMealCount && input.expectedMealCount > 0
      ? input.expectedMealCount
      : Math.round((input.headcount || 0) * AVG_BUYER_RATE)

  const perVendorCapacity = AVG_VENDOR_PER_WAVE * Math.max(input.waveCount, 1)
  const vendorRequirement = Math.max(1, Math.ceil(estimatedOrders / Math.max(perVendorCapacity, 1)))

  const likelihood =
    BACKUP_BASE_CANCEL_LIKELIHOOD + RISK_FACTOR_EQUAL_BUMP * Math.max(input.riskFactorCount, 0)

  return {
    recommendedBackups: Math.ceil(vendorRequirement * likelihood),
    vendorRequirement,
    likelihood,
  }
}
