/**
 * Tax seam spec (Phase 1 Batch 1) — the business rules are the spec:
 * - Taxability follows the items (owner ruling 2026-09-07): exempt stays
 *   exempt, taxable stays taxable, through bundles unchanged.
 * - Guardrails refuse LOUDLY, never compute silently wrong: TX-only,
 *   missing/invalid/unverified jurisdictions, stale rate quarter.
 * - Per-jurisdiction rounding: each line rounds independently against the
 *   base; the total is DERIVED from the parts (jurisdictions.ts model).
 * - Conservation: item tax == sum of its jurisdiction lines; cart total ==
 *   sum of item taxes. To the cent, always.
 */
import { describe, it, expect } from 'vitest'
import {
  computeCartTax,
  currentQuarterLabel,
  isRateVersionFresh,
  type CartTaxMarketInput,
} from '@/lib/tax/compute-cart-tax'
import { TX_STATE_RATE_PCT } from '@/lib/tax/jurisdictions'

const NOW = new Date('2026-09-07T12:00:00Z') // 2026-Q3

const amarillo: CartTaxMarketInput = {
  marketId: 'mkt-amarillo',
  state: 'TX',
  verifiedAt: '2026-09-01T00:00:00Z',
  rateVersion: '2026-Q3',
  jurisdictions: [
    { code: '7000000', name: 'Texas', level: 'state', rate_pct: TX_STATE_RATE_PCT },
    { code: '2188024', name: 'Amarillo', level: 'city', rate_pct: 2.0 },
  ], // combined 8.25
}

const canyon: CartTaxMarketInput = {
  marketId: 'mkt-canyon',
  state: 'TX',
  verifiedAt: '2026-09-01T00:00:00Z',
  rateVersion: '2026-Q3',
  jurisdictions: [
    { code: '7000000', name: 'Texas', level: 'state', rate_pct: TX_STATE_RATE_PCT },
    { code: '2191033', name: 'Canyon', level: 'city', rate_pct: 1.5 },
  ], // combined 7.75
}

describe('quarter freshness', () => {
  it('labels quarters correctly', () => {
    expect(currentQuarterLabel(new Date('2026-01-15T00:00:00Z'))).toBe('2026-Q1')
    expect(currentQuarterLabel(new Date('2026-09-07T00:00:00Z'))).toBe('2026-Q3')
    expect(currentQuarterLabel(new Date('2026-12-31T00:00:00Z'))).toBe('2026-Q4')
  })
  it('only the current quarter is fresh — prior quarters, free text, empty all stale', () => {
    expect(isRateVersionFresh('2026-Q3', NOW)).toBe(true)
    expect(isRateVersionFresh(' 2026-Q3 ', NOW)).toBe(true)
    expect(isRateVersionFresh('2026-Q2', NOW)).toBe(false)
    expect(isRateVersionFresh('September rates', NOW)).toBe(false)
    expect(isRateVersionFresh(null, NOW)).toBe(false)
  })
})

describe('computeCartTax — the happy math', () => {
  it('taxable item at 8.25%: per-jurisdiction rounding, derived total, conservation', () => {
    const r = computeCartTax(
      [{ ref: 'a', marketId: 'mkt-amarillo', taxableBaseCents: 1000, isTaxable: true }],
      [amarillo], NOW
    )
    if (!r.ok) throw new Error('expected ok')
    // 6.25% of $10.00 = 63 (rounded) + 2.00% = 20 → 83, NOT round(1000*.0825)=83 (same here)
    expect(r.items[0].jurisdictions.map(j => j.tax_cents)).toEqual([63, 20])
    expect(r.items[0].taxAmountCents).toBe(83)
    expect(r.totalTaxCents).toBe(83)
    // Conservation: item tax is the SUM of its jurisdiction lines.
    expect(r.items[0].taxAmountCents).toBe(r.items[0].jurisdictions.reduce((s, j) => s + j.tax_cents, 0))
    expect(r.items[0].rateVersion).toBe('2026-Q3')
  })

  it('exempt items produce a REAL zero and need no jurisdiction data at all', () => {
    const r = computeCartTax(
      [{ ref: 'x', marketId: 'mkt-nocodess', taxableBaseCents: 5000, isTaxable: false }],
      [], NOW
    )
    if (!r.ok) throw new Error('expected ok — exempt-only carts never need codes')
    expect(r.totalTaxCents).toBe(0)
    expect(r.items[0].taxableAmountCents).toBe(0)
    expect(r.items[0].jurisdictions).toEqual([])
  })

  it('multi-market cart: each item taxes at ITS OWN market rate (the reason automatic_tax was rejected)', () => {
    const r = computeCartTax(
      [
        { ref: 'a', marketId: 'mkt-amarillo', taxableBaseCents: 10000, isTaxable: true },
        { ref: 'c', marketId: 'mkt-canyon', taxableBaseCents: 10000, isTaxable: true },
      ],
      [amarillo, canyon], NOW
    )
    if (!r.ok) throw new Error('expected ok')
    expect(r.items[0].taxAmountCents).toBe(825) // 8.25% of $100
    expect(r.items[1].taxAmountCents).toBe(775) // 7.75% of $100
    expect(r.totalTaxCents).toBe(1600)
  })

  it('BUNDLE (owner ruling): components keep their own taxability — mixed basket taxes only the taxable parts', () => {
    // "super yupyup": exempt spinach + exempt chard + taxable salsa, one bundle.
    const r = computeCartTax(
      [
        { ref: 'bundle:spinach', marketId: 'mkt-amarillo', taxableBaseCents: 400, isTaxable: false },
        { ref: 'bundle:chard', marketId: 'mkt-amarillo', taxableBaseCents: 600, isTaxable: false },
        { ref: 'bundle:salsa', marketId: 'mkt-amarillo', taxableBaseCents: 800, isTaxable: true },
      ],
      [amarillo], NOW
    )
    if (!r.ok) throw new Error('expected ok')
    expect(r.items[0].taxAmountCents).toBe(0)
    expect(r.items[1].taxAmountCents).toBe(0)
    expect(r.items[2].taxAmountCents).toBe(50 + 16) // 6.25%→50, 2%→16
    expect(r.totalTaxCents).toBe(66)
  })

  it('zero/negative bases never tax', () => {
    const r = computeCartTax(
      [
        { ref: 'z', marketId: 'mkt-amarillo', taxableBaseCents: 0, isTaxable: true },
        { ref: 'n', marketId: 'mkt-amarillo', taxableBaseCents: -100, isTaxable: true },
      ],
      [amarillo], NOW
    )
    if (!r.ok) throw new Error('expected ok — no positive taxable base, no guardrails triggered')
    expect(r.totalTaxCents).toBe(0)
  })
})

describe('computeCartTax — guardrails refuse loudly', () => {
  const taxableItem = { ref: 't', marketId: 'mkt-x', taxableBaseCents: 1000, isTaxable: true }

  it('non-Texas market refuses (TX-only hard assert)', () => {
    const r = computeCartTax([taxableItem], [{ ...amarillo, marketId: 'mkt-x', state: 'OK' }], NOW)
    if (r.ok) throw new Error('expected refusal')
    expect(r.refusals[0].reason).toBe('not_texas')
  })

  it('missing market data / no codes refuses (III.7 intake incomplete)', () => {
    const r1 = computeCartTax([taxableItem], [], NOW)
    if (r1.ok) throw new Error('expected refusal')
    expect(r1.refusals[0].reason).toBe('no_jurisdictions')
    const r2 = computeCartTax([taxableItem], [{ ...amarillo, marketId: 'mkt-x', jurisdictions: [] }], NOW)
    if (r2.ok) throw new Error('expected refusal')
    expect(r2.refusals[0].reason).toBe('no_jurisdictions')
  })

  it('invalid jurisdiction config refuses with the validation detail', () => {
    const r = computeCartTax([taxableItem], [{
      ...amarillo, marketId: 'mkt-x',
      jurisdictions: [{ code: '123', name: 'Bad', level: 'city', rate_pct: 2 }],
    }], NOW)
    if (r.ok) throw new Error('expected refusal')
    expect(r.refusals[0].reason).toBe('invalid_jurisdictions')
    expect(r.refusals[0].detail).toContain('state-level')
  })

  it('unverified jurisdictions refuse (address-change re-verify pending)', () => {
    const r = computeCartTax([taxableItem], [{ ...amarillo, marketId: 'mkt-x', verifiedAt: null }], NOW)
    if (r.ok) throw new Error('expected refusal')
    expect(r.refusals[0].reason).toBe('unverified')
  })

  it('stale rate quarter refuses — never computes on old rates', () => {
    const r = computeCartTax([taxableItem], [{ ...amarillo, marketId: 'mkt-x', rateVersion: '2026-Q2' }], NOW)
    if (r.ok) throw new Error('expected refusal')
    expect(r.refusals[0].reason).toBe('stale_rates')
    expect(r.refusals[0].detail).toContain('2026-Q3')
  })

  it('ALL-OR-NOTHING: one failing market refuses the whole cart, naming each failure', () => {
    const r = computeCartTax(
      [
        { ref: 'good', marketId: 'mkt-amarillo', taxableBaseCents: 1000, isTaxable: true },
        { ref: 'bad', marketId: 'mkt-stale', taxableBaseCents: 1000, isTaxable: true },
      ],
      [amarillo, { ...canyon, marketId: 'mkt-stale', rateVersion: '2025-Q4' }], NOW
    )
    if (r.ok) throw new Error('expected refusal')
    expect(r.refusals).toHaveLength(1)
    expect(r.refusals[0].marketId).toBe('mkt-stale')
  })

  it('a failing market with ONLY EXEMPT items does not refuse (no codes needed for exempt sales)', () => {
    const r = computeCartTax(
      [
        { ref: 'good', marketId: 'mkt-amarillo', taxableBaseCents: 1000, isTaxable: true },
        { ref: 'exempt', marketId: 'mkt-stale', taxableBaseCents: 1000, isTaxable: false },
      ],
      [amarillo, { ...canyon, marketId: 'mkt-stale', rateVersion: '2025-Q4' }], NOW
    )
    if (!r.ok) throw new Error('expected ok')
    expect(r.totalTaxCents).toBe(83)
  })
})
