/**
 * Net List Supplement spec — Form 01-116 net of refunds. The rules are the spec:
 *  - The return is PER JURISDICTION CODE; sales and reversals are both rolled
 *    up by code and subtracted by code (readiness §2.1, §3).
 *  - Reversals carry their own frozen cents (original-rate rule); nothing here
 *    re-applies a rate.
 *  - A reversal in a later period than its sale makes a NEGATIVE line in that
 *    period — preserved, never clamped (CPA Q13 decides how it is reported;
 *    the math must not hide it).
 *  - Conservation: Σ net tax == Σ sales tax − Σ reversed tax, to the cent.
 *  - Gross sides are kept on every line so the filer can show their work.
 */
import { describe, it, expect } from 'vitest'
import { buildNetListSupplement, buildListSupplement, computeItemTax } from '../jurisdictions'
import { taxReversalForItem } from '../refund-tax'

const AUSTIN = [
  { code: '7000000', name: 'TEXAS', level: 'state' as const, rate_pct: 6.25 },
  { code: '2227000', name: 'AUSTIN', level: 'city' as const, rate_pct: 1.0 },
  { code: '3227000', name: 'AUSTIN MTA', level: 'transit' as const, rate_pct: 1.0 },
]
const CANYON = [
  { code: '7000000', name: 'TEXAS', level: 'state' as const, rate_pct: 6.25 },
  { code: '2191018', name: 'CANYON', level: 'city' as const, rate_pct: 2.0 },
]

/** A sale snapshot row exactly as checkout freezes it. */
function sale(baseCents: number, jurisdictions = AUSTIN) {
  const c = computeItemTax(baseCents, true, jurisdictions)
  return { taxable_amount_cents: c.taxableAmountCents, tax_jurisdictions: c.jurisdictions, tax_rate_version: '2026-Q3', tax_amount_cents: c.taxAmountCents }
}
/** A ledger row as Batch 3 will write it: the reversal of (part of) a sale. */
function reversalOf(s: ReturnType<typeof sale>, refundedBaseCents?: number) {
  const r = taxReversalForItem(s, refundedBaseCents === undefined ? { kind: 'full' } : { kind: 'partial', refundedBaseCents })
  return { taxable_amount_cents: r.taxableAmountCents, tax_jurisdictions: r.jurisdictions }
}
const sumTax = (rows: Array<{ taxDueCents: number }>) => rows.reduce((s, r) => s + r.taxDueCents, 0)

describe('no reversals — identical to the gross return', () => {
  it('every line equals buildListSupplement and the reversed sides are zero', () => {
    const sales = [sale(1000), sale(2500, CANYON)]
    const net = buildNetListSupplement(sales, [])
    const gross = buildListSupplement(sales)
    expect(net.map(({ code, amountSubjectToTaxCents, taxDueCents }) => ({ code, amountSubjectToTaxCents, taxDueCents })))
      .toEqual(gross.map(({ code, amountSubjectToTaxCents, taxDueCents }) => ({ code, amountSubjectToTaxCents, taxDueCents })))
    net.forEach((r) => { expect(r.reversedBaseCents).toBe(0); expect(r.reversedTaxCents).toBe(0) })
  })
  it('empty inputs → no lines', () => {
    expect(buildNetListSupplement([], [])).toEqual([])
  })
})

describe('a full refund in the same period cancels the sale line for line', () => {
  it('nets every code of that sale to zero and keeps the other sale intact', () => {
    const a = sale(1000)          // Austin: 63 + 10 + 10
    const b = sale(2500, CANYON)  // Canyon: 156 + 50
    const net = buildNetListSupplement([a, b], [reversalOf(a)])
    const byCode = Object.fromEntries(net.map((r) => [r.code, r]))
    // Austin-only codes net to exactly zero, with the gross sides visible.
    expect(byCode['2227000']).toMatchObject({ amountSubjectToTaxCents: 0, taxDueCents: 0, salesBaseCents: 1000, salesTaxCents: 10, reversedBaseCents: 1000, reversedTaxCents: 10 })
    expect(byCode['3227000']).toMatchObject({ amountSubjectToTaxCents: 0, taxDueCents: 0 })
    // The shared state code keeps Canyon's share only.
    expect(byCode['7000000']).toMatchObject({ amountSubjectToTaxCents: 2500, taxDueCents: 156, salesBaseCents: 3500, reversedBaseCents: 1000 })
    expect(byCode['2191018']).toMatchObject({ amountSubjectToTaxCents: 2500, taxDueCents: 50 })
  })
})

describe('partial refund — proportional, from the reversal’s own frozen cents', () => {
  it('a 75 % refund leaves 25 % of base and tax on every code, and conserves', () => {
    const a = sale(1000) // 83 tax
    const rev = reversalOf(a, 750)
    const net = buildNetListSupplement([a], [rev])
    const totalReversed = rev.tax_jurisdictions.reduce((s, j) => s + j.tax_cents, 0)
    expect(sumTax(net)).toBe(83 - totalReversed)
    net.forEach((r) => {
      expect(r.amountSubjectToTaxCents).toBe(250)
      expect(r.taxDueCents).toBe(r.salesTaxCents - r.reversedTaxCents)
    })
  })
})

describe('a reversal in a LATER period than its sale is a negative line, never clamped', () => {
  it('codes with no sales this period show negative net and zero gross sales', () => {
    const lastMonth = sale(1000)
    const net = buildNetListSupplement([], [reversalOf(lastMonth)])
    expect(net.length).toBe(3)
    net.forEach((r) => {
      expect(r.salesBaseCents).toBe(0)
      expect(r.amountSubjectToTaxCents).toBe(-1000)
      expect(r.taxDueCents).toBeLessThan(0)
      expect(r.taxDueCents).toBe(-r.reversedTaxCents)
    })
    expect(sumTax(net)).toBe(-83)
  })
  it('a big refund against a small month nets negative on the shared state code', () => {
    const small = sale(200)      // state 13 (12.5→13), city 2, transit 2
    const bigOld = sale(5000)    // state 313 (312.5→313), city 50, transit 50
    const net = buildNetListSupplement([small], [reversalOf(bigOld)])
    const state = net.find((r) => r.code === '7000000')!
    expect(state.taxDueCents).toBe(13 - 313)
    expect(state.amountSubjectToTaxCents).toBe(200 - 5000)
  })
})

describe('conservation and ordering', () => {
  it('Σ net tax == Σ sales tax − Σ reversed tax across mixed markets and partials', () => {
    const s1 = sale(1234), s2 = sale(999, CANYON), s3 = sale(5001)
    const revs = [reversalOf(s1), reversalOf(s3, 1667), reversalOf(sale(300, CANYON))] // last one: sale outside the period
    const net = buildNetListSupplement([s1, s2, s3], revs)
    const grossSales = sumTax(buildListSupplement([s1, s2, s3]))
    const grossRev = sumTax(buildListSupplement(revs))
    expect(sumTax(net)).toBe(grossSales - grossRev)
  })
  it('state line first, then locals by code — same as the gross builder', () => {
    const net = buildNetListSupplement([sale(1000), sale(1000, CANYON)], [reversalOf(sale(500, CANYON))])
    expect(net.map((r) => r.code)).toEqual(['7000000', '2191018', '2227000', '3227000'])
  })
})
