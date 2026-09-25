/**
 * Texas sales-tax jurisdiction model + pure math (mig 214).
 *
 * Why per-jurisdiction and not one blended rate: as a marketplace provider we
 * must file Form 01-116 (List Supplement), which is a PER-JURISDICTION table —
 * seven-digit local code, amount subject to tax, rate, and tax due for every
 * city / county / transit authority / SPD. A single blended number cannot
 * produce that return.
 *
 * Rounding model: each jurisdiction's tax is computed independently against the
 * same taxable base and rounded to the cent, then summed. That mirrors how the
 * return itself is filed (each jurisdiction line stands alone), so there is no
 * remainder-allocation puzzle — the total is DERIVED from the parts rather than
 * the parts being prorated out of a total.
 *
 * Pure — no I/O. Collection is not wired up yet; this is the vocabulary and the
 * arithmetic that the later calculation + filing steps will share.
 */

/** Texas statutory ceiling: 6.25% state + up to 2.00% local. */
export const TX_MAX_COMBINED_RATE_PCT = 8.25
export const TX_STATE_RATE_PCT = 6.25

export type JurisdictionLevel = 'state' | 'city' | 'county' | 'transit' | 'spd'

/** A taxing jurisdiction as configured on a market (`markets.tax_jurisdictions`). */
export interface TaxJurisdiction {
  /** Texas seven-digit local code — Form 01-116 Column 2. State rows use 7000000. */
  code: string
  name: string
  level: JurisdictionLevel
  rate_pct: number
}

/** A jurisdiction line frozen onto an order item at sale time, with its amount. */
export interface TaxJurisdictionSnapshot extends TaxJurisdiction {
  tax_cents: number
}

export interface ItemTaxResult {
  taxableAmountCents: number
  taxAmountCents: number
  jurisdictions: TaxJurisdictionSnapshot[]
}

/** Sum of configured rates. Returns 0 for an empty/unresolved set. */
export function totalRatePct(jurisdictions: TaxJurisdiction[]): number {
  const total = jurisdictions.reduce((sum, j) => sum + (j.rate_pct || 0), 0)
  // Guard float drift (6.25 + 1 + 1 can land on 8.250000000000002).
  return Math.round(total * 10000) / 10000
}

/**
 * Validate a market's jurisdiction configuration. Returns [] when usable.
 * Deliberately strict: a bad rate silently under- or over-charging real buyers
 * is worse than a loud refusal to calculate.
 */
export function validateJurisdictions(jurisdictions: TaxJurisdiction[]): string[] {
  const errors: string[] = []
  if (jurisdictions.length === 0) {
    errors.push('No jurisdictions resolved for this location')
    return errors
  }
  const seen = new Set<string>()
  for (const j of jurisdictions) {
    if (!/^\d{7}$/.test(j.code || '')) {
      errors.push(`Jurisdiction "${j.name || j.code}" has an invalid local code (expected 7 digits)`)
    }
    if (seen.has(j.code)) errors.push(`Duplicate jurisdiction code ${j.code}`)
    seen.add(j.code)
    if (!Number.isFinite(j.rate_pct) || j.rate_pct < 0) {
      errors.push(`Jurisdiction "${j.name || j.code}" has an invalid rate`)
    }
  }
  const stateRows = jurisdictions.filter((j) => j.level === 'state')
  if (stateRows.length !== 1) {
    errors.push('Expected exactly one state-level jurisdiction')
  } else if (stateRows[0].rate_pct !== TX_STATE_RATE_PCT) {
    errors.push(`State rate should be ${TX_STATE_RATE_PCT}%, got ${stateRows[0].rate_pct}%`)
  }
  const total = totalRatePct(jurisdictions)
  if (total > TX_MAX_COMBINED_RATE_PCT) {
    errors.push(`Combined rate ${total}% exceeds the Texas ceiling of ${TX_MAX_COMBINED_RATE_PCT}%`)
  }
  return errors
}

/**
 * Compute tax for one item against a market's jurisdictions.
 *
 * `isTaxable` is the per-ITEM flag (listings.is_taxable) — Texas taxability is
 * SKU-level, not vertical-level: a farmer's tomatoes are exempt while the salsa
 * they made from them is taxable, in the same cart.
 *
 * An exempt item returns a real zero (taxAmountCents 0, empty jurisdictions),
 * which is meaningfully different from "we never computed tax" (NULL in the DB).
 */
export function computeItemTax(
  subtotalCents: number,
  isTaxable: boolean,
  jurisdictions: TaxJurisdiction[]
): ItemTaxResult {
  if (!isTaxable || subtotalCents <= 0 || jurisdictions.length === 0) {
    return { taxableAmountCents: 0, taxAmountCents: 0, jurisdictions: [] }
  }
  const lines: TaxJurisdictionSnapshot[] = jurisdictions.map((j) => ({
    ...j,
    tax_cents: Math.round((subtotalCents * j.rate_pct) / 100),
  }))
  return {
    taxableAmountCents: subtotalCents,
    taxAmountCents: lines.reduce((sum, l) => sum + l.tax_cents, 0),
    jurisdictions: lines,
  }
}

/** One row of the Texas List Supplement (Form 01-116). */
export interface ListSupplementRow {
  code: string
  name: string
  level: JurisdictionLevel
  rate_pct: number
  amountSubjectToTaxCents: number
  taxDueCents: number
}

/**
 * Roll snapshotted item rows up into Form 01-116 lines — group by local code,
 * summing the amount subject to tax and the tax due. This is the whole point of
 * storing the breakdown per item: the monthly return is a group-by, not a
 * recomputation (and never re-derives against today's rates).
 *
 * Note each item contributes its FULL taxable base to EVERY jurisdiction it
 * sourced to, which is correct — the same base is reported on each jurisdiction
 * line of the return at that jurisdiction's own rate.
 */
export function buildListSupplement(
  items: Array<{ taxable_amount_cents: number | null; tax_jurisdictions: TaxJurisdictionSnapshot[] | null }>
): ListSupplementRow[] {
  const rows = new Map<string, ListSupplementRow>()
  for (const item of items) {
    if (!item.tax_jurisdictions || item.tax_jurisdictions.length === 0) continue
    const base = item.taxable_amount_cents || 0
    for (const j of item.tax_jurisdictions) {
      const existing = rows.get(j.code)
      if (existing) {
        existing.amountSubjectToTaxCents += base
        existing.taxDueCents += j.tax_cents
      } else {
        rows.set(j.code, {
          code: j.code,
          name: j.name,
          level: j.level,
          rate_pct: j.rate_pct,
          amountSubjectToTaxCents: base,
          taxDueCents: j.tax_cents,
        })
      }
    }
  }
  // State first, then locals by code — mirrors how the return reads.
  return [...rows.values()].sort((a, b) => {
    if (a.level === 'state' && b.level !== 'state') return -1
    if (b.level === 'state' && a.level !== 'state') return 1
    return a.code.localeCompare(b.code)
  })
}

/**
 * One Form 01-116 line NET of reversals, with both sides kept for audit.
 * `amountSubjectToTaxCents` / `taxDueCents` are the NET figures (sales minus
 * reversals) — what goes on the return line. The four gross fields let the
 * filer show their work and let the reconciliation against Stripe's export
 * tie out side by side.
 */
export interface NetListSupplementRow extends ListSupplementRow {
  salesBaseCents: number
  salesTaxCents: number
  reversedBaseCents: number
  reversedTaxCents: number
}

/**
 * The monthly return net of refunds (tax build step "minus reversals",
 * `apps/web/.claude/tax_build_review_research.md`).
 *
 * Inputs are the same shape on both sides: sale snapshots (order_items rows
 * frozen at checkout) and reversal rows (the refund ledger — each carrying the
 * per-jurisdiction cents that were reversed, at the ORIGINAL rate, see
 * refund-tax.ts). Both are rolled up with buildListSupplement and subtracted
 * by seven-digit code. Nothing is recomputed against a rate.
 *
 * Rules this encodes:
 * - Period placement is the caller's: a reversal recorded in a later month
 *   than its sale belongs to THAT later month's return, so a code can net
 *   NEGATIVE here. Negatives are preserved, never clamped — a credit on the
 *   return is a real thing the filer must see (how Texas wants a negative line
 *   reported is CPA Q13; the math must not hide it either way).
 * - A code that appears only in reversals still gets a line (all-negative).
 * - Conservation: Σ net taxDueCents == Σ sales tax − Σ reversed tax, always.
 * - Ordering mirrors buildListSupplement (state first, then locals by code).
 */
export function buildNetListSupplement(
  sales: Array<{ taxable_amount_cents: number | null; tax_jurisdictions: TaxJurisdictionSnapshot[] | null }>,
  reversals: Array<{ taxable_amount_cents: number | null; tax_jurisdictions: TaxJurisdictionSnapshot[] | null }>
): NetListSupplementRow[] {
  const sold = buildListSupplement(sales)
  const reversed = buildListSupplement(reversals)
  const byCode = new Map<string, NetListSupplementRow>()

  for (const r of sold) {
    byCode.set(r.code, {
      ...r,
      salesBaseCents: r.amountSubjectToTaxCents,
      salesTaxCents: r.taxDueCents,
      reversedBaseCents: 0,
      reversedTaxCents: 0,
    })
  }
  for (const r of reversed) {
    const existing = byCode.get(r.code)
    if (existing) {
      existing.reversedBaseCents = r.amountSubjectToTaxCents
      existing.reversedTaxCents = r.taxDueCents
      existing.amountSubjectToTaxCents = existing.salesBaseCents - r.amountSubjectToTaxCents
      existing.taxDueCents = existing.salesTaxCents - r.taxDueCents
    } else {
      // Reversal with no sale in the period — a credit line.
      byCode.set(r.code, {
        code: r.code,
        name: r.name,
        level: r.level,
        rate_pct: r.rate_pct,
        amountSubjectToTaxCents: -r.amountSubjectToTaxCents,
        taxDueCents: -r.taxDueCents,
        salesBaseCents: 0,
        salesTaxCents: 0,
        reversedBaseCents: r.amountSubjectToTaxCents,
        reversedTaxCents: r.taxDueCents,
      })
    }
  }

  return [...byCode.values()].sort((a, b) => {
    if (a.level === 'state' && b.level !== 'state') return -1
    if (b.level === 'state' && a.level !== 'state') return 1
    return a.code.localeCompare(b.code)
  })
}

/** Tolerant parse of the JSONB column — unresolved/malformed reads as empty. */
export function parseJurisdictions(raw: unknown): TaxJurisdiction[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (j): j is TaxJurisdiction =>
      !!j && typeof j === 'object' &&
      typeof (j as TaxJurisdiction).code === 'string' &&
      typeof (j as TaxJurisdiction).rate_pct === 'number'
  )
}
