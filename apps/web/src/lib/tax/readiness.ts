/**
 * Market tax readiness — the ONE answer to "would the checkout tax engine tax
 * a sale at this market today?", shared by every surface that shows it
 * (markets admin filter + chip, the vendor's market picker, the listing form's
 * advisory, the attach route's admin alert).
 *
 * Mirrors the engine's three market guardrails in the same order
 * (compute-cart-tax.ts: no_jurisdictions → unverified → stale_rates). If the
 * engine's rules change, this changes with them — never a fourth copy.
 *
 * Pure: no I/O. Callers pass the market's stored tax columns (mig 214).
 */
import { parseJurisdictions } from './jurisdictions'
import { isRateVersionFresh } from './compute-cart-tax'

export type TaxReadiness = 'no_codes' | 'unverified' | 'stale' | 'ready'

export interface MarketTaxColumns {
  tax_jurisdictions?: unknown
  tax_jurisdiction_verified_at?: string | null
  tax_rate_version?: string | null
}

export function marketTaxReadiness(m: MarketTaxColumns, now: Date = new Date()): TaxReadiness {
  if (parseJurisdictions(m.tax_jurisdictions).length === 0) return 'no_codes'
  if (!m.tax_jurisdiction_verified_at) return 'unverified'
  if (!isRateVersionFresh(m.tax_rate_version ?? null, now)) return 'stale'
  return 'ready'
}

/** Short admin-facing labels (the markets admin chip + filter). */
export const TAX_READINESS_LABEL: Record<Exclude<TaxReadiness, 'ready'>, string> = {
  no_codes: 'tax: no codes',
  unverified: 'tax: re-verify',
  stale: 'tax: stale quarter',
}
