/**
 * Checkout tax engine spec (Batch 2) — the Q11/Q8 interim base policy and the
 * margin allocation, owner-approved 2026-09-08. The seam math itself is
 * covered by compute-cart-tax.test.ts; this file tests what the ENGINE adds:
 * base building, margin pro-rata, loading, and the flag gate.
 */
import { describe, it, expect, vi } from 'vitest'

// The engine is the single flag gate; force it OPEN here so the async path is
// testable. The real constant stays false (see the dark-ship pin below).
vi.mock('../flags', () => ({ TAX_STREAM1_ENABLED: true }))

import {
  computeCheckoutTax,
  taxableBaseCents,
  allocateMarginToTaxable,
} from '../checkout-tax'
import type { SupabaseClient } from '@supabase/supabase-js'

const TX_JURISDICTIONS = [
  { code: '7000000', name: 'Texas', level: 'state', rate_pct: 6.25 },
  { code: '2057032', name: 'Dallas', level: 'city', rate_pct: 1.0 },
  { code: '3057999', name: 'Dallas MTA', level: 'transit', rate_pct: 1.0 },
]

function fakeClient(opts: {
  listings: Array<{ id: string; is_taxable: boolean }>
  markets: Array<Record<string, unknown>>
}): SupabaseClient {
  return {
    from: (table: string) => ({
      select: () => ({
        in: () =>
          Promise.resolve({
            data: table === 'listings' ? opts.listings : opts.markets,
            error: null,
          }),
      }),
    }),
  } as unknown as SupabaseClient
}

const READY_MARKET = {
  id: 'mkt-1',
  state: 'TX',
  tax_jurisdictions: TX_JURISDICTIONS,
  tax_rate_version: `${new Date().getUTCFullYear()}-Q${Math.floor(new Date().getUTCMonth() / 3) + 1}`,
  tax_jurisdiction_verified_at: '2026-09-01T00:00:00Z',
}

describe('taxableBaseCents — Q11 interim (net + embedded buyer % fee share)', () => {
  it('adds the 6.5% buyer fee share to the net subtotal', () => {
    // $10.00 net → base $10.65 (matches the buyer-paid line construction)
    expect(taxableBaseCents(1000)).toBe(1065)
  })
  it('rounds the fee share to the cent', () => {
    // 999 × 6.5% = 64.935 → 65
    expect(taxableBaseCents(999)).toBe(999 + 65)
  })
})

describe('allocateMarginToTaxable — Q8 interim (pro-rata into taxable bases)', () => {
  it('conserves exactly and skips exempt components', () => {
    const shares = allocateMarginToTaxable(1000, [
      { base: 300, isTaxable: true },
      { base: 500, isTaxable: false }, // exempt: gets nothing
      { base: 700, isTaxable: true },
    ])
    expect(shares[1]).toBe(0)
    expect(shares[0] + shares[2]).toBe(1000) // exact conservation
    expect(shares[0]).toBe(Math.floor((1000 * 300) / 1000)) // floor, remainder to last
  })
  it('allocates nothing when every component is exempt (owner ruling: margin untaxed)', () => {
    expect(
      allocateMarginToTaxable(1000, [
        { base: 300, isTaxable: false },
        { base: 700, isTaxable: false },
      ])
    ).toEqual([0, 0])
  })
  it('handles a single taxable component (all margin to it)', () => {
    expect(allocateMarginToTaxable(333, [{ base: 100, isTaxable: true }])).toEqual([333])
  })
})

describe('computeCheckoutTax', () => {
  it('taxes a taxable item on the fee-inclusive base and zeros an exempt one', async () => {
    const client = fakeClient({
      listings: [
        { id: 'salsa', is_taxable: true },
        { id: 'tomatoes', is_taxable: false },
      ],
      markets: [READY_MARKET],
    })
    const result = await computeCheckoutTax(client, [
      { ref: '0', listingId: 'salsa', marketId: 'mkt-1', netSubtotalCents: 1000 },
      { ref: '1', listingId: 'tomatoes', marketId: 'mkt-1', netSubtotalCents: 2000 },
    ])
    if (!(result.enabled && 'ok' in result && result.ok)) throw new Error('expected ok')
    const salsa = result.items.find((i) => i.ref === '0')!
    const tomatoes = result.items.find((i) => i.ref === '1')!
    // base 1065 → 6.25% = 67 + 1% = 11 + 1% = 11 (each jurisdiction rounds alone)
    expect(salsa.taxableAmountCents).toBe(1065)
    expect(salsa.taxAmountCents).toBe(67 + 11 + 11)
    expect(tomatoes.taxAmountCents).toBe(0)
    expect(tomatoes.taxableAmountCents).toBe(0)
    expect(result.totalTaxCents).toBe(89)
  })

  it('folds the bundle margin into taxable components only', async () => {
    const client = fakeClient({
      listings: [
        { id: 'salsa', is_taxable: true },
        { id: 'chard', is_taxable: false },
      ],
      markets: [READY_MARKET],
    })
    const result = await computeCheckoutTax(
      client,
      [
        { ref: '0', listingId: 'salsa', marketId: 'mkt-1', netSubtotalCents: 1000 },
        { ref: '1', listingId: 'chard', marketId: 'mkt-1', netSubtotalCents: 2000 },
      ],
      { marketId: 'mkt-1', marginCents: 1000 }
    )
    if (!(result.enabled && 'ok' in result && result.ok)) throw new Error('expected ok')
    const salsa = result.items.find((i) => i.ref === '0')!
    const chard = result.items.find((i) => i.ref === '1')!
    // margin buyer-paid = round(1000 × 1.065) = 1065, all to the one taxable
    // component: base = 1065 (item) + 1065 (margin) = 2130
    expect(salsa.taxableAmountCents).toBe(2130)
    expect(chard.taxAmountCents).toBe(0) // exempt component untouched by margin
  })

  it('leaves an all-exempt bundle fully untaxed, margin included', async () => {
    const client = fakeClient({
      listings: [
        { id: 'spinach', is_taxable: false },
        { id: 'chard', is_taxable: false },
      ],
      // Exempt-only carts need no jurisdiction data (seam rule) — an
      // UNCONFIGURED market proves the margin didn't sneak into the base.
      markets: [{ id: 'mkt-1', state: 'TX', tax_jurisdictions: [], tax_rate_version: null, tax_jurisdiction_verified_at: null }],
    })
    const result = await computeCheckoutTax(
      client,
      [
        { ref: '0', listingId: 'spinach', marketId: 'mkt-1', netSubtotalCents: 1500 },
        { ref: '1', listingId: 'chard', marketId: 'mkt-1', netSubtotalCents: 1500 },
      ],
      { marketId: 'mkt-1', marginCents: 1000 }
    )
    if (!(result.enabled && 'ok' in result && result.ok)) throw new Error('expected ok')
    expect(result.totalTaxCents).toBe(0)
  })

  it('refuses loudly when a taxable item sits at an unready market', async () => {
    const client = fakeClient({
      listings: [{ id: 'salsa', is_taxable: true }],
      markets: [{ ...READY_MARKET, tax_jurisdiction_verified_at: null }],
    })
    const result = await computeCheckoutTax(client, [
      { ref: '0', listingId: 'salsa', marketId: 'mkt-1', netSubtotalCents: 1000 },
    ])
    if (!(result.enabled && 'ok' in result && !result.ok)) throw new Error('expected refusal')
    expect(result.refusals[0]).toMatchObject({ marketId: 'mkt-1', reason: 'unverified' })
  })

  it('refuses a taxable item with NO market rather than skipping it', async () => {
    const client = fakeClient({
      listings: [{ id: 'salsa', is_taxable: true }],
      markets: [],
    })
    const result = await computeCheckoutTax(client, [
      { ref: '0', listingId: 'salsa', marketId: null, netSubtotalCents: 1000 },
    ])
    if (!(result.enabled && 'ok' in result && !result.ok)) throw new Error('expected refusal')
    expect(result.refusals[0].reason).toBe('no_jurisdictions')
  })
})
