/**
 * Bundle cancellation math — owner rulings 2026-09-06 (the spec):
 *  - all-or-nothing; the fee test runs at BUNDLE level: once ANY vendor has
 *    confirmed (past grace), the 25% fee applies to the WHOLE total, margin
 *    included.
 *  - grace window (order-creation clock, FM 60min / FT 15min) always wins.
 *  - the fee's vendor share goes ONLY to vendors who confirmed; unconfirmed
 *    vendors' fee portions stay with the platform.
 *  - the margin never pays anyone a fee share — it refunds 75%/100%.
 *  - tips are excluded here (callers refund them in full — VOR-16 rule).
 */
import { describe, it, expect } from 'vitest'
import { calculateBundleCancellation, CANCELLATION_FEE_PERCENT } from '@/lib/payments/cancellation-fees'
import { STRIPE_CONFIG } from '@/lib/stripe/config'
import { proratedFlatFeeSimple } from '@/lib/pricing'

const T0 = new Date('2026-09-06T12:00:00Z')
const mins = (n: number) => new Date(T0.getTime() + n * 60_000)

const paidFor = (subtotal: number, totalItems: number, smallFee = 0) =>
  subtotal
  + Math.round(subtotal * (STRIPE_CONFIG.buyerFeePercent / 100))
  + proratedFlatFeeSimple(STRIPE_CONFIG.buyerFlatFeeCents, totalItems)
  + Math.round(smallFee / totalItems)

describe('calculateBundleCancellation', () => {
  const items = [
    { id: 'a', subtotalCents: 1000, status: 'confirmed' },
    { id: 'b', subtotalCents: 2000, status: 'pending' },
    { id: 'c', subtotalCents: 1500, status: 'ready' },
  ]

  it('grace window → 100% of everything including the margin, no fee', () => {
    const r = calculateBundleCancellation({
      items, totalItemsInOrder: 3, orderCreatedAt: T0,
      vertical: 'farmers_market', marginAddendCents: 1065, now: mins(30),
    })
    expect(r.withinGracePeriod).toBe(true)
    expect(r.feeApplied).toBe(false)
    expect(r.marginRefundCents).toBe(1065)
    expect(r.totalFeeCents).toBe(0)
    expect(r.totalRefundCents).toBe(
      paidFor(1000, 3) + paidFor(2000, 3) + paidFor(1500, 3) + 1065)
  })

  it('past grace but NO vendor confirmed → still 100%', () => {
    const allPending = items.map(i => ({ ...i, status: 'pending' }))
    const r = calculateBundleCancellation({
      items: allPending, totalItemsInOrder: 3, orderCreatedAt: T0,
      vertical: 'farmers_market', marginAddendCents: 1065, now: mins(120),
    })
    expect(r.anyVendorConfirmed).toBe(false)
    expect(r.feeApplied).toBe(false)
    expect(r.marginRefundCents).toBe(1065)
  })

  it('past grace + ANY vendor confirmed → 25% fee on EVERY item and the margin', () => {
    const r = calculateBundleCancellation({
      items, totalItemsInOrder: 3, orderCreatedAt: T0,
      vertical: 'farmers_market', marginAddendCents: 1065, now: mins(120),
    })
    expect(r.feeApplied).toBe(true)
    // The unconfirmed item 'b' is fee'd too — the ruling is bundle-level.
    const b = r.perItem.find(i => i.id === 'b')!
    expect(b.feeCents).toBeGreaterThan(0)
    // ...but its fee has NO vendor share (that vendor never prepped).
    expect(b.vendorShareCents).toBe(0)
    expect(b.platformShareCents).toBe(b.feeCents)
    // Confirmed vendors get the standard split of their item's fee.
    const a = r.perItem.find(i => i.id === 'a')!
    expect(a.vendorShareCents + a.platformShareCents).toBe(a.feeCents)
    expect(a.vendorShareCents).toBeGreaterThan(0)
    // Margin: 75% back, remainder is fee, nobody gets a share of it.
    expect(r.marginRefundCents).toBe(Math.round(1065 * (1 - CANCELLATION_FEE_PERCENT / 100)))
    // Conservation per item: refund + fee == what the buyer paid.
    for (const it2 of r.perItem) {
      const src = items.find(i => i.id === it2.id)!
      expect(it2.refundCents + it2.feeCents).toBe(paidFor(src.subtotalCents, 3))
    }
  })

  it('FT grace is 15 minutes, not an hour', () => {
    const r = calculateBundleCancellation({
      items, totalItemsInOrder: 3, orderCreatedAt: T0,
      vertical: 'food_trucks', marginAddendCents: 500, now: mins(20),
    })
    expect(r.withinGracePeriod).toBe(false)
    expect(r.feeApplied).toBe(true)
  })

  it('small-order fee share rides each item exactly as the single-item path does', () => {
    const r = calculateBundleCancellation({
      items: [{ id: 'a', subtotalCents: 300, status: 'pending' }],
      totalItemsInOrder: 1, orderCreatedAt: T0,
      vertical: 'farmers_market', smallOrderFeeCents: 100,
      marginAddendCents: 0, now: mins(5),
    })
    expect(r.perItem[0].refundCents).toBe(paidFor(300, 1, 100))
  })
})
