import { describe, it, expect } from 'vitest'
import {
  computeItemTax,
  validateJurisdictions,
  buildListSupplement,
  totalRatePct,
  parseJurisdictions,
  TX_MAX_COMBINED_RATE_PCT,
  type TaxJurisdiction,
  type TaxJurisdictionSnapshot,
} from '../jurisdictions'

/**
 * Expectations here come from TEXAS RULES, not from the implementation:
 *  - State rate 6.25%, combined ceiling 8.25% (6.25 + up to 2.00 local).
 *  - Form 01-116 is a PER-JURISDICTION table (code, amount subject to tax,
 *    rate, tax due) — so the same taxable base appears on each jurisdiction
 *    line at that jurisdiction's own rate.
 *  - Taxability is per ITEM (Rule 3.293): unprepared groceries exempt,
 *    prepared food taxable — possible in the same cart.
 */

// Austin: 6.25 state + 1.00 city + 1.00 transit = 8.25 (the ceiling case)
const AUSTIN: TaxJurisdiction[] = [
  { code: '7000000', name: 'TEXAS', level: 'state', rate_pct: 6.25 },
  { code: '2227000', name: 'AUSTIN', level: 'city', rate_pct: 1.0 },
  { code: '3227000', name: 'AUSTIN MTA', level: 'transit', rate_pct: 1.0 },
]

describe('totalRatePct', () => {
  it('sums to the Texas ceiling without float drift', () => {
    expect(totalRatePct(AUSTIN)).toBe(8.25)
  })

  it('returns 0 for an unresolved market', () => {
    expect(totalRatePct([])).toBe(0)
  })
})

describe('validateJurisdictions — Texas rules', () => {
  it('accepts a well-formed set', () => {
    expect(validateJurisdictions(AUSTIN)).toEqual([])
  })

  it('rejects a combined rate above the 8.25% ceiling', () => {
    const over = [...AUSTIN, { code: '5227000', name: 'SPD', level: 'spd' as const, rate_pct: 0.5 }]
    expect(totalRatePct(over)).toBeGreaterThan(TX_MAX_COMBINED_RATE_PCT)
    expect(validateJurisdictions(over).join(' ')).toMatch(/exceeds the Texas ceiling/)
  })

  it('rejects a state rate that is not 6.25%', () => {
    const wrong: TaxJurisdiction[] = [{ code: '7000000', name: 'TEXAS', level: 'state', rate_pct: 6.0 }]
    expect(validateJurisdictions(wrong).join(' ')).toMatch(/State rate should be 6.25%/)
  })

  it('requires exactly one state-level row', () => {
    expect(validateJurisdictions([AUSTIN[1]]).join(' ')).toMatch(/exactly one state-level/)
  })

  it('rejects a local code that is not seven digits (Form 01-116 col 2)', () => {
    const bad: TaxJurisdiction[] = [
      { code: '7000000', name: 'TEXAS', level: 'state', rate_pct: 6.25 },
      { code: '227', name: 'SHORT', level: 'city', rate_pct: 1.0 },
    ]
    expect(validateJurisdictions(bad).join(' ')).toMatch(/invalid local code/)
  })

  it('rejects duplicate jurisdiction codes', () => {
    expect(validateJurisdictions([...AUSTIN, AUSTIN[1]]).join(' ')).toMatch(/Duplicate jurisdiction code/)
  })

  it('flags an unresolved market rather than silently calculating zero', () => {
    expect(validateJurisdictions([])).toContain('No jurisdictions resolved for this location')
  })
})

describe('computeItemTax', () => {
  it('taxes a $10.00 prepared-food item at each jurisdiction rate', () => {
    const r = computeItemTax(1000, true, AUSTIN)
    expect(r.taxableAmountCents).toBe(1000)
    // 6.25% of $10 = $0.625 → 63¢; 1% = 10¢; 1% = 10¢
    expect(r.jurisdictions.map((j) => j.tax_cents)).toEqual([63, 10, 10])
    expect(r.taxAmountCents).toBe(83)
  })

  it('total equals the sum of the per-jurisdiction lines (the return is filed that way)', () => {
    const r = computeItemTax(1737, true, AUSTIN)
    expect(r.taxAmountCents).toBe(r.jurisdictions.reduce((s, j) => s + j.tax_cents, 0))
  })

  it('an EXEMPT item yields a real zero with no jurisdiction lines', () => {
    const r = computeItemTax(1000, false, AUSTIN)
    expect(r.taxAmountCents).toBe(0)
    expect(r.taxableAmountCents).toBe(0)
    expect(r.jurisdictions).toEqual([])
  })

  it('taxes exempt and taxable items independently in the same cart (Rule 3.293)', () => {
    const tomatoes = computeItemTax(500, false, AUSTIN) // unprepared produce — exempt
    const salsa = computeItemTax(500, true, AUSTIN)     // combined by the seller — taxable
    expect(tomatoes.taxAmountCents).toBe(0)
    expect(salsa.taxAmountCents).toBeGreaterThan(0)
  })

  it('does not calculate against an unresolved market', () => {
    expect(computeItemTax(1000, true, []).taxAmountCents).toBe(0)
  })

  it('handles a zero-value item without producing tax', () => {
    expect(computeItemTax(0, true, AUSTIN).taxAmountCents).toBe(0)
  })
})

describe('buildListSupplement — Form 01-116 rollup', () => {
  const snap = (base: number): { taxable_amount_cents: number; tax_jurisdictions: TaxJurisdictionSnapshot[] } => {
    const r = computeItemTax(base, true, AUSTIN)
    return { taxable_amount_cents: r.taxableAmountCents, tax_jurisdictions: r.jurisdictions }
  }

  it('groups by local code and sums base + tax per jurisdiction', () => {
    const rows = buildListSupplement([snap(1000), snap(1000)])
    expect(rows).toHaveLength(3)
    const state = rows.find((r) => r.code === '7000000')!
    expect(state.amountSubjectToTaxCents).toBe(2000)
    expect(state.taxDueCents).toBe(126) // 63 + 63
  })

  it('reports the SAME taxable base on every jurisdiction line', () => {
    const rows = buildListSupplement([snap(1000)])
    expect(new Set(rows.map((r) => r.amountSubjectToTaxCents))).toEqual(new Set([1000]))
  })

  it('lists the state row first', () => {
    expect(buildListSupplement([snap(1000)])[0].level).toBe('state')
  })

  it('skips exempt and pre-tax-launch rows', () => {
    const rows = buildListSupplement([
      snap(1000),
      { taxable_amount_cents: 0, tax_jurisdictions: [] },
      { taxable_amount_cents: null, tax_jurisdictions: null },
    ])
    expect(rows.find((r) => r.code === '7000000')!.amountSubjectToTaxCents).toBe(1000)
  })

  it('keeps jurisdictions separate across markets with different rates', () => {
    // An order can span markets at different rates, so the rollup must not
    // merge. Since 2026-08-09 this is broader than when the tax snapshot was
    // designed: cart/validate isolates EVENTS only — two traditional markets, or
    // a market plus a private pickup, are one order (the buyer acknowledges each
    // pickup location at checkout). Per-item tax is therefore required, not
    // merely prudent.
    const houston = computeItemTax(1000, true, [
      { code: '7000000', name: 'TEXAS', level: 'state', rate_pct: 6.25 },
      { code: '2101000', name: 'HOUSTON', level: 'city', rate_pct: 1.0 },
    ])
    const rows = buildListSupplement([
      snap(1000),
      { taxable_amount_cents: houston.taxableAmountCents, tax_jurisdictions: houston.jurisdictions },
    ])
    expect(rows.find((r) => r.code === '2227000')!.amountSubjectToTaxCents).toBe(1000) // Austin only
    expect(rows.find((r) => r.code === '2101000')!.amountSubjectToTaxCents).toBe(1000) // Houston only
    expect(rows.find((r) => r.code === '7000000')!.amountSubjectToTaxCents).toBe(2000) // state gets both
  })
})

describe('parseJurisdictions', () => {
  it('reads a valid JSONB array', () => {
    expect(parseJurisdictions(AUSTIN)).toHaveLength(3)
  })

  it('treats unresolved/malformed data as empty rather than throwing', () => {
    expect(parseJurisdictions(null)).toEqual([])
    expect(parseJurisdictions('nope')).toEqual([])
    expect(parseJurisdictions([{ code: 123 }, null, { name: 'x' }])).toEqual([])
  })
})
