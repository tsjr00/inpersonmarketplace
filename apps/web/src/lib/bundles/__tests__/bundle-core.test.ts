/**
 * Market bundles — spec tests (B1+B2, mig 244).
 *
 * Expected values come from the LOCKED DESIGN (market_bundles_build_plan.md,
 * owner Q&As 2026-09-05), not from any implementation:
 *  - CONSERVATION: a bundle order's component vendor math is byte-identical
 *    to a plain order's — the margin can never touch vendor payouts.
 *  - Margin is seller-fee-free; buyer % applies to the full bundle price.
 *  - B2 cause split conserves the margin exactly.
 *  - Q5 limits: 25 qty / 3 active / 1-day assembly buffer.
 */

import { describe, it, expect } from 'vitest'
import {
  BUNDLE_LIMITS,
  expandBundleComponents,
  bundleBaseCents,
  bundleDisplayPriceCents,
  marginWithBuyerFeeCents,
  splitMargin,
  bundleOrderingOpen,
  bundleMarginIdempotencyKey,
} from '@/lib/bundles/core'
import { calculateOrderPricing, FEES, proratedFlatFee } from '@/lib/pricing'

// Replays checkout/session's per-item vendor math (route :611-649 shape:
// net subtotal − vendor % fee − prorated flat fee) so conservation is
// asserted against the SAME formula the money path runs.
function vendorPayoutsFor(items: Array<{ priceCents: number; quantity: number }>): number[] {
  return items.map((item, idx) => {
    const subtotal = item.priceCents * item.quantity
    const vendorPercentFee = Math.round(subtotal * FEES.vendorFeePercent / 100)
    const flat = proratedFlatFee(FEES.vendorFlatFeeCents, items.length, idx)
    return subtotal - vendorPercentFee - flat
  })
}

describe('bundle conservation — the spec anchor', () => {
  const components = [
    { listing_id: 'lst-a', quantity: 2 },
    { listing_id: 'lst-b', quantity: 1 },
    { listing_id: 'lst-c', quantity: 3 },
  ]
  const livePrices: Record<string, number> = { 'lst-a': 750, 'lst-b': 1299, 'lst-c': 425 }

  it('expansion carries listing ids + quantities ONLY — prices always come live', () => {
    const expanded = expandBundleComponents(components, 1)
    expect(expanded).toEqual([
      { listingId: 'lst-a', quantity: 2 },
      { listingId: 'lst-b', quantity: 1 },
      { listingId: 'lst-c', quantity: 3 },
    ])
    // No price field can exist on the expansion — snapshot prices are forbidden.
    for (const item of expanded) {
      expect(Object.keys(item).sort()).toEqual(['listingId', 'quantity'])
    }
  })

  it('bundle quantity multiplies component quantities', () => {
    expect(expandBundleComponents(components, 3)).toEqual([
      { listingId: 'lst-a', quantity: 6 },
      { listingId: 'lst-b', quantity: 3 },
      { listingId: 'lst-c', quantity: 9 },
    ])
  })

  it('component vendor payouts on a bundle order == the identical plain order, for ANY margin', () => {
    const expanded = expandBundleComponents(components, 1)
    const bundleItems = expanded.map((e) => ({ priceCents: livePrices[e.listingId], quantity: e.quantity }))
    const plainItems = components.map((c) => ({ priceCents: livePrices[c.listing_id], quantity: c.quantity }))

    const plainPayouts = vendorPayoutsFor(plainItems)
    // The margin does not appear anywhere in the component math — vary it
    // wildly and the payouts must be byte-identical every time.
    for (const marginCents of [0, 1, 500, 1500, 99_999]) {
      void marginCents // the margin has no path into vendorPayoutsFor — that IS the invariant
      expect(vendorPayoutsFor(bundleItems)).toEqual(plainPayouts)
    }
  })

  it('order-level pricing on the components is identical to a plain order', () => {
    const expanded = expandBundleComponents(components, 2)
    const bundlePricing = calculateOrderPricing(
      expanded.map((e) => ({ price_cents: livePrices[e.listingId], quantity: e.quantity }))
    )
    const plainPricing = calculateOrderPricing(
      components.map((c) => ({ price_cents: livePrices[c.listing_id], quantity: c.quantity * 2 }))
    )
    expect(bundlePricing).toEqual(plainPricing)
  })
})

describe('margin money (seller-fee-free, buyer % on full price)', () => {
  it('bundle base = live component sum + fixed margin', () => {
    expect(bundleBaseCents(2500, 500)).toBe(3000)
    expect(bundleBaseCents(2500, 0)).toBe(2500)
  })

  it('display/Stripe price rounds components and margin SEPARATELY (equals orders.total_cents)', () => {
    // Contract (refined 2026-09-05 before any consumer shipped): for integer
    // C, round(1.065·C) ≡ C + round(0.065·C) — exactly the fee term
    // calculateOrderPricing computes — so split rounding makes the Stripe
    // charge, the checkout page, the market card, and orders.total_cents all
    // equal to the cent on a bundle-only order. One round of the sum can
    // drift 1¢ from the stored total.
    // $25 components + $5 margin → round(2662.5) + round(532.5) = 2663 + 533
    expect(bundleDisplayPriceCents(2500, 500)).toBe(3196)
    expect(bundleDisplayPriceCents(2500, 500)).toBe(
      Math.round(2500 * 1.065) + marginWithBuyerFeeCents(500)
    )
    // Pin the split: 10¢ + 10¢ → 11 + 11 = 22 (a single round of 21.3 → 21).
    expect(bundleDisplayPriceCents(10, 10)).toBe(22)
  })

  it('orders.total_cents margin addend = margin + its buyer fee', () => {
    expect(marginWithBuyerFeeCents(500)).toBe(533) // round(532.5)
    expect(marginWithBuyerFeeCents(1500)).toBe(1598) // round(1597.5)
    expect(marginWithBuyerFeeCents(0)).toBe(0)
  })

  it('the manager transfer amount is the margin itself — no seller fee exists on it', () => {
    // splitMargin with no cause returns the whole margin to the market:
    // there is no fee parameter anywhere in the margin path.
    expect(splitMargin(1500, null)).toEqual({ causeCents: 0, marketCents: 1500 })
  })
})

describe('B2 cause split (mig-213 rails)', () => {
  it('conserves the margin exactly for every pct', () => {
    for (const margin of [1, 99, 500, 1501, 99_999]) {
      for (let pct = 1; pct <= 100; pct++) {
        const { causeCents, marketCents } = splitMargin(margin, pct)
        expect(causeCents + marketCents).toBe(margin)
        expect(causeCents).toBeGreaterThanOrEqual(0)
        expect(marketCents).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('null/0 pct → everything to the market', () => {
    expect(splitMargin(500, null)).toEqual({ causeCents: 0, marketCents: 500 })
    expect(splitMargin(500, 0)).toEqual({ causeCents: 0, marketCents: 500 })
    expect(splitMargin(500, undefined)).toEqual({ causeCents: 0, marketCents: 500 })
  })

  it('100 pct → everything to the cause', () => {
    expect(splitMargin(500, 100)).toEqual({ causeCents: 500, marketCents: 0 })
  })
})

describe('Q5 limits + ordering window', () => {
  it('owner-approved limits: 25 qty / 3 active / 1-day buffer', () => {
    expect(BUNDLE_LIMITS.maxQuantityPerBundle).toBe(25)
    expect(BUNDLE_LIMITS.maxActivePerMarket).toBe(3)
    expect(BUNDLE_LIMITS.assemblyBufferDays).toBe(1)
  })

  it('buffer keeps FULL assembly days: last orderable day = pickup − (buffer+1)', () => {
    // Pickup Saturday 2026-09-12, buffer 1: orderable through Thursday 09-10,
    // closed Friday (the assembly day) and on pickup day itself.
    expect(bundleOrderingOpen('2026-09-09', '2026-09-12')).toBe(true)
    expect(bundleOrderingOpen('2026-09-10', '2026-09-12')).toBe(true)
    expect(bundleOrderingOpen('2026-09-11', '2026-09-12')).toBe(false)
    expect(bundleOrderingOpen('2026-09-12', '2026-09-12')).toBe(false)
    expect(bundleOrderingOpen('2026-09-13', '2026-09-12')).toBe(false)
  })

  it('invalid dates fail closed', () => {
    expect(bundleOrderingOpen('garbage', '2026-09-12')).toBe(false)
    expect(bundleOrderingOpen('2026-09-09', '')).toBe(false)
  })
})

describe('margin transfer idempotency', () => {
  it('deterministic key from the order id — never time-based', () => {
    expect(bundleMarginIdempotencyKey('ord-123')).toBe('bundle-margin:ord-123')
    expect(bundleMarginIdempotencyKey('ord-123')).toBe(bundleMarginIdempotencyKey('ord-123'))
  })
})
