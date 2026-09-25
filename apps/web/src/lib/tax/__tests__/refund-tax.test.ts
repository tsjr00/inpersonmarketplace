/**
 * Refund-side tax spec — the rules are the spec, not the implementation:
 *  - Refunds reverse tax at the ORIGINAL rate, from the item's own snapshot
 *    (sales_tax_readiness.md §3; §151.0242 retention). Today's market rates
 *    are never consulted — so changing them must not change the reversal.
 *  - A full refund reverses exactly the snapshot, to the cent.
 *  - A partial refund reverses tax in proportion to the base refunded, and the
 *    per-jurisdiction parts always sum to the total (conservation).
 *  - Reversals on one item never exceed its snapshot tax, however many refund
 *    paths touch it (cap).
 *  - An exempt item (real zero) and a pre-tax order (NULL) reverse nothing.
 */
import { describe, it, expect } from 'vitest'
import { taxReversalForItem, refundAmountWithTax, type ItemTaxSnapshot } from '../refund-tax'
import { computeItemTax } from '../jurisdictions'

// Austin at the 8.25 ceiling: state 6.25 + city 1.00 + transit 1.00.
const AUSTIN = [
  { code: '7000000', name: 'TEXAS', level: 'state' as const, rate_pct: 6.25 },
  { code: '2227000', name: 'AUSTIN', level: 'city' as const, rate_pct: 1.0 },
  { code: '3227000', name: 'AUSTIN MTA', level: 'transit' as const, rate_pct: 1.0 },
]

/** A snapshot exactly as checkout would have frozen it for a $10.65 base. */
function snapshotFor(baseCents: number, rateVersion = '2026-Q3'): ItemTaxSnapshot {
  const computed = computeItemTax(baseCents, true, AUSTIN)
  return {
    taxable_amount_cents: computed.taxableAmountCents,
    tax_amount_cents: computed.taxAmountCents,
    tax_jurisdictions: computed.jurisdictions,
    tax_rate_version: rateVersion,
  }
}

const sum = (lines: Array<{ tax_cents: number }>) => lines.reduce((s, l) => s + l.tax_cents, 0)

describe('full refund — the reversal IS the snapshot', () => {
  it('returns the snapshot cents and lines unchanged', () => {
    const snap = snapshotFor(1065) // 1065 × 6.25% = 66.56→67 · ×1% = 10.65→11 · ×1% = 11 → 89
    const r = taxReversalForItem(snap, { kind: 'full' })
    expect(r.taxableAmountCents).toBe(1065)
    expect(r.taxCents).toBe(89)
    expect(r.jurisdictions).toEqual(snap.tax_jurisdictions)
    expect(r.rateVersion).toBe('2026-Q3')
  })

  it('is unaffected by what the market’s rates are TODAY (original-rate rule)', () => {
    // The function never receives market rates at all — the only inputs are
    // the frozen snapshot and the refunded portion. Prove the snapshot alone
    // decides: two snapshots with different frozen rates give different
    // reversals for the same base, and neither consults anything else.
    const q3 = snapshotFor(1000, '2026-Q3')
    const later: ItemTaxSnapshot = {
      ...q3,
      tax_rate_version: '2026-Q4',
      tax_jurisdictions: [{ ...AUSTIN[0], tax_cents: 63 }], // state-only, 6.25% frozen
      tax_amount_cents: 63,
    }
    expect(taxReversalForItem(q3, { kind: 'full' }).taxCents).toBe(sum(q3.tax_jurisdictions!))
    expect(taxReversalForItem(later, { kind: 'full' }).taxCents).toBe(63)
  })
})

describe('partial refund — proportional, conservation-exact', () => {
  it('reverses 75% of the tax when 75% of the base comes back (cancellation-fee shape)', () => {
    const snap = snapshotFor(1000) // 63 + 10 + 10 = 83
    const r = taxReversalForItem(snap, { kind: 'partial', refundedBaseCents: 750 })
    expect(r.taxableAmountCents).toBe(750)
    expect(r.taxCents).toBe(Math.round((83 * 750) / 1000)) // 62
    expect(sum(r.jurisdictions)).toBe(r.taxCents)
    expect(r.jurisdictions.map((j) => j.code)).toEqual(AUSTIN.map((j) => j.code))
  })

  it('never re-applies rates: parts are prorated from the frozen cents', () => {
    const snap = snapshotFor(1000)
    const r = taxReversalForItem(snap, { kind: 'partial', refundedBaseCents: 500 })
    // Each line ≤ its frozen line; state line ≈ half of 63.
    r.jurisdictions.forEach((line, i) => {
      expect(line.tax_cents).toBeLessThanOrEqual(snap.tax_jurisdictions![i].tax_cents)
    })
    expect(r.jurisdictions[0].tax_cents).toBeGreaterThanOrEqual(31)
    expect(sum(r.jurisdictions)).toBe(r.taxCents)
  })

  it('a refunded base larger than the snapshot base is clamped to the snapshot', () => {
    const snap = snapshotFor(1000)
    const r = taxReversalForItem(snap, { kind: 'partial', refundedBaseCents: 5000 })
    expect(r.taxableAmountCents).toBe(1000)
    expect(r.taxCents).toBe(snap.tax_amount_cents)
  })

  it('one-cent bases and tiny shares stay conservation-exact', () => {
    const snap = snapshotFor(3) // 3 × 6.25% = 0.19→0 · ×1% → 0 · → 0 total: exempt-looking real zero
    expect(taxReversalForItem(snap, { kind: 'full' }).taxCents).toBe(0)
    const snap2 = snapshotFor(9) // 0.56→1 · 0.09→0 · 0 → 1 cent of tax
    const r = taxReversalForItem(snap2, { kind: 'partial', refundedBaseCents: 4 })
    expect(sum(r.jurisdictions)).toBe(r.taxCents)
    expect(r.taxCents).toBeLessThanOrEqual(1)
  })
})

describe('cap — reversals on one item never exceed its snapshot tax', () => {
  it('a full reversal after an earlier partial returns only what remains', () => {
    const snap = snapshotFor(1000) // 83
    const first = taxReversalForItem(snap, { kind: 'partial', refundedBaseCents: 750 }) // 62
    const second = taxReversalForItem(snap, { kind: 'full' }, first.taxCents)
    expect(second.taxCents).toBe(83 - 62)
    expect(sum(second.jurisdictions)).toBe(second.taxCents)
  })

  it('once fully reversed, further refunds reverse nothing', () => {
    const snap = snapshotFor(1000)
    const r = taxReversalForItem(snap, { kind: 'full' }, 83)
    expect(r.taxCents).toBe(0)
    expect(r.jurisdictions).toEqual([])
  })
})

describe('nothing to reverse', () => {
  it('exempt item (real zero snapshot) → zero reversal', () => {
    const exempt: ItemTaxSnapshot = { taxable_amount_cents: 0, tax_amount_cents: 0, tax_jurisdictions: [], tax_rate_version: '2026-Q3' }
    expect(taxReversalForItem(exempt, { kind: 'full' }).taxCents).toBe(0)
  })
  it('pre-tax order (NULL columns) → zero reversal, no throw', () => {
    const pre: ItemTaxSnapshot = { taxable_amount_cents: null, tax_amount_cents: null, tax_jurisdictions: null, tax_rate_version: null }
    const r = taxReversalForItem(pre, { kind: 'partial', refundedBaseCents: 500 })
    expect(r).toEqual({ taxableAmountCents: 0, taxCents: 0, jurisdictions: [], rateVersion: null })
  })
})

describe('refundAmountWithTax — the buyer gets their money AND their tax back', () => {
  it('adds the reversal to the money-path refund', () => {
    const snap = snapshotFor(1065)
    const reversal = taxReversalForItem(snap, { kind: 'full' })
    // 1000 net + 65 fee + 15 flat = 1080 is what the paths compute today;
    // the buyer also paid 89 of tax on this item.
    expect(refundAmountWithTax(1080, reversal)).toBe(1080 + 89)
  })
})
