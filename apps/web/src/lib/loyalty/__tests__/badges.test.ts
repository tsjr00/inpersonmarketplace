/**
 * LOYALTY LAYER 1 — BADGE RULES + CUSTOMER SEGMENTS ARE THE SPEC
 *
 * Owner decisions 2026-08-25 (loyalty_program_research.md, chat):
 *   - A "visit" is a FULFILLED order; counts are distinct ORDERS per (buyer, vendor).
 *   - Segments: new 0 · one-timer 1 · repeat 2–3 · Regular 4–9 ·
 *     Local Legend 10+ OR an order in each of 3 consecutive months.
 *     "Ride-or-die" was renamed — some people won't like it. The word must not
 *     appear anywhere in the catalog.
 *   - Per-vertical windows: Back for More 14d (FT) / 28d (FM);
 *     Around the World = 5 distinct vendors in 30d (FT) / 90d (FM);
 *     Explorer = 3 distinct pickup locations.
 *   - Both notifications are FREE channels: push+in_app for the buyer,
 *     in_app only for the vendor. Never SMS, never email.
 *
 * Expected values below come from those decisions, not from the code.
 */
import { describe, it, expect } from 'vitest'
import {
  BADGE_CATALOG,
  BADGE_KEYS,
  LOYALTY_THRESHOLDS,
  SEGMENT_LABELS,
  SEGMENT_THRESHOLDS,
  getLoyaltyThresholds,
} from '../config'
import {
  classifyCustomer,
  computeEarnedBadges,
  computeProgress,
  dedupeOrders,
  hasConsecutiveMonths,
  maxDistinctVendorsInWindow,
  toDay,
  type FulfilledOrder,
} from '../segments'
import { NOTIFICATION_REGISTRY, URGENCY_CHANNELS } from '@/lib/notifications/types'
import { scheduleBuyerAchievementEvaluation } from '../evaluate'

describe('Loyalty — scheduling never reaches the caller', () => {
  it('scheduleBuyerAchievementEvaluation does not throw outside a request scope', () => {
    // next/server after() throws synchronously here (no request context) —
    // the fulfill route calls this after the status write and before the
    // transfer, so it must be impossible for it to throw.
    expect(() => scheduleBuyerAchievementEvaluation('user-1', 'food_trucks')).not.toThrow()
  })
})

const FT = getLoyaltyThresholds('food_trucks')
const FM = getLoyaltyThresholds('farmers_market')

/** Day offsets from 2026-03-01 → YYYY-MM-DD. */
function day(offset: number): string {
  const d = new Date(Date.UTC(2026, 2, 1) + offset * 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

let seq = 0
function order(vendor: string, dayOffset: number, market: string | null = 'm1'): FulfilledOrder {
  seq += 1
  return { orderId: `o${seq}`, vendorProfileId: vendor, marketId: market, day: day(dayOffset) }
}

describe('Loyalty — customer segments (owner thresholds 2026-08-25)', () => {
  it('Regular starts at 4 fulfilled orders, Local Legend at 10', () => {
    expect(SEGMENT_THRESHOLDS.repeat).toBe(2)
    expect(SEGMENT_THRESHOLDS.regular).toBe(4)
    expect(SEGMENT_THRESHOLDS.loyal).toBe(10)
  })

  it('classifies by distinct order count', () => {
    expect(classifyCustomer(0)).toBe('new')
    expect(classifyCustomer(1)).toBe('one_timer')
    expect(classifyCustomer(2)).toBe('repeat')
    expect(classifyCustomer(3)).toBe('repeat')
    expect(classifyCustomer(4)).toBe('regular')
    expect(classifyCustomer(9)).toBe('regular')
    expect(classifyCustomer(10)).toBe('loyal')
  })

  it('three consecutive months of orders is Local Legend even with only 3 orders', () => {
    expect(classifyCustomer(3, ['2026-01-10', '2026-02-03', '2026-03-28'])).toBe('loyal')
    // A gap month breaks the run.
    expect(classifyCustomer(3, ['2026-01-10', '2026-02-03', '2026-04-28'])).toBe('repeat')
  })

  it('consecutive-month runs cross a year boundary', () => {
    expect(hasConsecutiveMonths(['2025-11-02', '2025-12-20', '2026-01-05'], 3)).toBe(true)
    expect(hasConsecutiveMonths(['2025-11-02', '2026-01-05', '2026-02-05'], 3)).toBe(false)
  })

  it('the top segment is called Local Legend — "ride-or-die" is gone', () => {
    expect(SEGMENT_LABELS.loyal).toBe('Local Legend')
    expect(SEGMENT_LABELS.regular).toBe('Regular')
    expect(SEGMENT_LABELS.new).toBe('New customer')
    const everything = JSON.stringify(SEGMENT_LABELS) + BADGE_KEYS.map((k) => {
      const d = BADGE_CATALOG[k]
      return d.name('food_trucks') + d.name('farmers_market') + d.description('food_trucks', FT) + d.description('farmers_market', FM)
    }).join(' ')
    expect(everything.toLowerCase()).not.toContain('ride')
  })
})

describe('Loyalty — per-vertical thresholds', () => {
  it('food trucks: 14-day return window, 5 trucks in 30 days, 3 parks', () => {
    expect(LOYALTY_THRESHOLDS.food_trucks).toEqual({ backForMoreDays: 14, aroundTheWorldVendors: 5, aroundTheWorldDays: 30, explorerMarkets: 3 })
  })
  it('farmers markets: 28-day return window, 5 vendors in 90 days, 3 markets', () => {
    expect(LOYALTY_THRESHOLDS.farmers_market).toEqual({ backForMoreDays: 28, aroundTheWorldVendors: 5, aroundTheWorldDays: 90, explorerMarkets: 3 })
  })
  it('unknown verticals fall back to the farmers-market shape (never throws)', () => {
    expect(getLoyaltyThresholds('nope')).toEqual(LOYALTY_THRESHOLDS.farmers_market)
    expect(getLoyaltyThresholds(null)).toEqual(LOYALTY_THRESHOLDS.farmers_market)
  })
})

describe('Loyalty — order de-duplication', () => {
  it('collapses order_items rows into one entry per order, earliest day wins', () => {
    const orders = dedupeOrders([
      { order_id: 'a', vendor_profile_id: 'v1', market_id: 'm1', day: '2026-03-05' },
      { order_id: 'a', vendor_profile_id: 'v1', market_id: 'm1', day: '2026-03-04' },
      { order_id: 'b', vendor_profile_id: 'v1', market_id: 'm1', day: '2026-03-09' },
      { order_id: 'c', vendor_profile_id: 'v1', market_id: 'm1', day: null },
    ])
    expect(orders.map((o) => [o.orderId, o.day])).toEqual([['a', '2026-03-04'], ['b', '2026-03-09']])
  })

  it('toDay accepts a DATE, an ISO timestamp, and nothing', () => {
    expect(toDay('2026-08-25')).toBe('2026-08-25')
    expect(toDay('2026-08-25T18:30:00.000Z')).toBe('2026-08-25')
    expect(toDay(null)).toBeNull()
    expect(toDay('garbage')).toBeNull()
  })
})

describe('Loyalty — badge rules', () => {
  it('no orders → no badges', () => {
    expect(computeEarnedBadges([], FT)).toEqual([])
  })

  it('the first fulfilled order earns First Bite and nothing else', () => {
    const earned = computeEarnedBadges([order('v1', 0)], FT)
    expect(earned.map((b) => b.key)).toEqual(['first_bite'])
  })

  it('Back for More: a second order at the SAME vendor inside the window (FT 14d)', () => {
    const within = computeEarnedBadges([order('v1', 0), order('v1', 14)], FT).map((b) => b.key)
    expect(within).toContain('back_for_more')
    const outside = computeEarnedBadges([order('v1', 0), order('v1', 15)], FT).map((b) => b.key)
    expect(outside).not.toContain('back_for_more')
  })

  it('Back for More: a different vendor inside the window does NOT count', () => {
    const keys = computeEarnedBadges([order('v1', 0), order('v2', 3)], FT).map((b) => b.key)
    expect(keys).not.toContain('back_for_more')
  })

  it('Back for More uses the farmers-market window (28d) on that vertical', () => {
    expect(computeEarnedBadges([order('v1', 0), order('v1', 28)], FM).map((b) => b.key)).toContain('back_for_more')
    expect(computeEarnedBadges([order('v1', 0), order('v1', 29)], FM).map((b) => b.key)).not.toContain('back_for_more')
  })

  it('Regular is vendor-scoped and fires at exactly 4 orders with one vendor', () => {
    const three = computeEarnedBadges([order('v1', 0), order('v1', 20), order('v1', 40), order('v2', 41)], FT)
    expect(three.find((b) => b.key === 'regular')).toBeUndefined()
    const four = computeEarnedBadges([order('v1', 0), order('v1', 20), order('v1', 40), order('v1', 60)], FT)
    const regular = four.find((b) => b.key === 'regular')
    expect(regular).toEqual({ key: 'regular', vendorProfileId: 'v1', context: { orders: 4 } })
    expect(four.find((b) => b.key === 'local_legend')).toBeUndefined()
  })

  it('Local Legend fires at 10 orders with one vendor (and Regular stays earned)', () => {
    const orders = Array.from({ length: 10 }, (_, i) => order('v1', i * 20))
    const keys = computeEarnedBadges(orders, FT).map((b) => b.key)
    expect(keys).toContain('local_legend')
    expect(keys).toContain('regular')
  })

  it('Local Legend also fires on 3 consecutive months with one vendor', () => {
    const orders: FulfilledOrder[] = [
      { orderId: 'a', vendorProfileId: 'v1', marketId: 'm1', day: '2026-01-10' },
      { orderId: 'b', vendorProfileId: 'v1', marketId: 'm1', day: '2026-02-14' },
      { orderId: 'c', vendorProfileId: 'v1', marketId: 'm1', day: '2026-03-02' },
    ]
    expect(computeEarnedBadges(orders, FT).map((b) => b.key)).toContain('local_legend')
  })

  it('Around the World: 5 distinct trucks inside 30 days (FT)', () => {
    const five = [order('v1', 0), order('v2', 5), order('v3', 10), order('v4', 20), order('v5', 29)]
    expect(computeEarnedBadges(five, FT).map((b) => b.key)).toContain('around_the_world')
    const spread = [order('v1', 0), order('v2', 5), order('v3', 10), order('v4', 20), order('v5', 30)]
    expect(computeEarnedBadges(spread, FT).map((b) => b.key)).not.toContain('around_the_world')
    const repeatsDontCount = [order('v1', 0), order('v1', 1), order('v2', 2), order('v3', 3), order('v4', 4)]
    expect(computeEarnedBadges(repeatsDontCount, FT).map((b) => b.key)).not.toContain('around_the_world')
  })

  it('the rolling window is the widest window, not just the first order', () => {
    const orders = [order('v1', 0), order('v2', 40), order('v3', 45), order('v4', 50), order('v5', 55), order('v6', 60)]
    expect(maxDistinctVendorsInWindow(orders, 30)).toBe(5)
  })

  it('Explorer: 3 distinct pickup locations; null locations are ignored', () => {
    const three = [order('v1', 0, 'm1'), order('v2', 1, 'm2'), order('v3', 2, 'm3')]
    expect(computeEarnedBadges(three, FT).map((b) => b.key)).toContain('explorer')
    const two = [order('v1', 0, 'm1'), order('v2', 1, 'm2'), order('v3', 2, null)]
    expect(computeEarnedBadges(two, FT).map((b) => b.key)).not.toContain('explorer')
  })
})

describe('Loyalty — progress toward unearned badges', () => {
  it('a brand-new buyer sees every platform target at zero', () => {
    const progress = computeProgress([], FT, new Set())
    const byKey = Object.fromEntries(progress.map((p) => [p.key, [p.current, p.target]]))
    expect(byKey).toEqual({
      first_bite: [0, 1],
      back_for_more: [0, 2],
      regular: [0, 4],
      around_the_world: [0, 5],
      explorer: [0, 3],
    })
  })

  it('earned badges drop out of progress; Regular progress names the closest vendor', () => {
    const orders = [order('v1', 0), order('v1', 3), order('v2', 4)]
    const progress = computeProgress(orders, FT, new Set(['first_bite', 'back_for_more']))
    expect(progress.find((p) => p.key === 'first_bite')).toBeUndefined()
    expect(progress.find((p) => p.key === 'back_for_more')).toBeUndefined()
    expect(progress.find((p) => p.key === 'regular')).toEqual({ key: 'regular', current: 2, target: 4, vendorProfileId: 'v1' })
  })

  it('once Regular is earned at a vendor, progress moves to Local Legend there', () => {
    const orders = Array.from({ length: 4 }, (_, i) => order('v1', i))
    const progress = computeProgress(orders, FT, new Set(['first_bite', 'back_for_more', 'regular|v1']))
    expect(progress.find((p) => p.key === 'local_legend')).toEqual({ key: 'local_legend', current: 4, target: 10, vendorProfileId: 'v1' })
  })
})

describe('Loyalty — notifications are free channels only', () => {
  it('badge_earned is push + in_app (immediate); customer_milestone is in_app only (info)', () => {
    expect(NOTIFICATION_REGISTRY.badge_earned.urgency).toBe('immediate')
    expect(NOTIFICATION_REGISTRY.badge_earned.audience).toBe('buyer')
    expect(NOTIFICATION_REGISTRY.customer_milestone.urgency).toBe('info')
    expect(NOTIFICATION_REGISTRY.customer_milestone.audience).toBe('vendor')
    for (const type of ['badge_earned', 'customer_milestone'] as const) {
      const channels = URGENCY_CHANNELS[NOTIFICATION_REGISTRY[type].urgency]
      expect(channels).not.toContain('sms')
      expect(channels).not.toContain('email')
    }
  })

  it('the vendor nudge names the customer and their new standing', () => {
    const cfg = NOTIFICATION_REGISTRY.customer_milestone
    expect(cfg.title({ buyerName: 'Jordan', segmentLabel: 'Regular' })).toBe('Jordan is now a Regular')
    expect(cfg.message({ buyerName: 'Jordan', segmentLabel: 'Regular', orderCount: 4 })).toContain('order #4')
    expect(cfg.actionUrl({ vertical: 'food_trucks' })).toBe('/food_trucks/vendor/orders')
  })

  it('the buyer badge deep-links to the Favorites page (badges live there, not a new tile)', () => {
    expect(NOTIFICATION_REGISTRY.badge_earned.actionUrl({ vertical: 'food_trucks' })).toBe('/food_trucks/favorites')
  })
})
