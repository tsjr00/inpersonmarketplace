/**
 * Loyalty Layer 1 — pure customer-segment + badge-rule math.
 *
 * Everything here is a pure function over a buyer's FULFILLED order history so
 * it can be unit-tested against the thresholds in config.ts (the spec) and
 * reused by three consumers: the buyer's badges, the vendor's order-card chip /
 * milestone nudge, and (backlog) the vendor "Your Customers" report. One
 * classifier, three readers — they can never disagree.
 *
 * Dates are compared at DAY granularity using the order's pickup_date when it
 * exists (a plain DATE) and the fulfillment timestamp otherwise.
 */
import {
  BADGE_CATALOG,
  LOYAL_CONSECUTIVE_MONTHS,
  SEGMENT_THRESHOLDS,
  type BadgeKey,
  type CustomerSegment,
  type LoyaltyThresholds,
} from './config'

/** One fulfilled ORDER (already de-duplicated from its order_items rows). */
export interface FulfilledOrder {
  orderId: string
  vendorProfileId: string
  marketId: string | null
  /** YYYY-MM-DD — pickup_date if present, else the fulfillment date. */
  day: string
}

export interface EarnedBadge {
  key: BadgeKey
  /** Set for vendor-scoped badges (regular, local_legend). */
  vendorProfileId: string | null
  context: Record<string, number | string>
}

export interface BadgeProgress {
  key: BadgeKey
  current: number
  target: number
  /** For vendor-scoped progress: the vendor closest to the badge. */
  vendorProfileId?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

/** `YYYY-MM-DD` from a DATE string or an ISO timestamp. */
export function toDay(value: string | null | undefined): string | null {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const d = new Date(value)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function dayIndex(day: string): number {
  return Math.floor(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / DAY_MS)
}

function monthIndex(day: string): number {
  return +day.slice(0, 4) * 12 + (+day.slice(5, 7) - 1)
}

/**
 * Collapse order_items rows (one per item) into one entry per ORDER. The
 * earliest day wins if items on one order carry different pickup dates.
 */
export function dedupeOrders(
  rows: Array<{ order_id: string; vendor_profile_id: string; market_id: string | null; day: string | null }>
): FulfilledOrder[] {
  const byOrder = new Map<string, FulfilledOrder>()
  for (const r of rows) {
    if (!r.day) continue
    const key = `${r.order_id}|${r.vendor_profile_id}`
    const existing = byOrder.get(key)
    if (!existing) {
      byOrder.set(key, { orderId: r.order_id, vendorProfileId: r.vendor_profile_id, marketId: r.market_id, day: r.day })
    } else if (r.day < existing.day) {
      existing.day = r.day
    }
  }
  return [...byOrder.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
}

/** True when the days cover `n` CONSECUTIVE calendar months (any order in each). */
export function hasConsecutiveMonths(days: string[], n: number): boolean {
  if (n <= 1) return days.length > 0
  const months = [...new Set(days.map(monthIndex))].sort((a, b) => a - b)
  let run = 1
  for (let i = 1; i < months.length; i++) {
    run = months[i] === months[i - 1] + 1 ? run + 1 : 1
    if (run >= n) return true
  }
  return false
}

/**
 * A buyer's standing with ONE vendor.
 * new → 0 orders · one_timer → 1 · repeat → 2–3 · regular → 4–9 ·
 * loyal → 10+, OR an order in each of 3 consecutive months.
 */
export function classifyCustomer(orderCount: number, orderDays: string[] = []): CustomerSegment {
  if (orderCount <= 0) return 'new'
  if (orderCount >= SEGMENT_THRESHOLDS.loyal) return 'loyal'
  if (hasConsecutiveMonths(orderDays, LOYAL_CONSECUTIVE_MONTHS)) return 'loyal'
  if (orderCount >= SEGMENT_THRESHOLDS.regular) return 'regular'
  if (orderCount >= SEGMENT_THRESHOLDS.repeat) return 'repeat'
  return 'one_timer'
}

/** Orders grouped per vendor, each group sorted by day. */
export function groupByVendor(orders: FulfilledOrder[]): Map<string, FulfilledOrder[]> {
  const m = new Map<string, FulfilledOrder[]>()
  for (const o of orders) {
    const list = m.get(o.vendorProfileId)
    if (list) list.push(o)
    else m.set(o.vendorProfileId, [o])
  }
  for (const list of m.values()) list.sort((a, b) => (a.day < b.day ? -1 : 1))
  return m
}

/** Largest number of distinct vendors visited inside any `windowDays`-day window. */
export function maxDistinctVendorsInWindow(orders: FulfilledOrder[], windowDays: number): number {
  const sorted = [...orders].sort((a, b) => dayIndex(a.day) - dayIndex(b.day))
  let best = 0
  for (let i = 0; i < sorted.length; i++) {
    const start = dayIndex(sorted[i].day)
    const seen = new Set<string>()
    for (let j = i; j < sorted.length && dayIndex(sorted[j].day) - start < windowDays; j++) {
      seen.add(sorted[j].vendorProfileId)
    }
    if (seen.size > best) best = seen.size
  }
  return best
}

/** Smallest gap (days) between two consecutive orders at the same vendor, or null. */
export function shortestReturnGapDays(byVendor: Map<string, FulfilledOrder[]>): number | null {
  let best: number | null = null
  for (const list of byVendor.values()) {
    for (let i = 1; i < list.length; i++) {
      const gap = dayIndex(list[i].day) - dayIndex(list[i - 1].day)
      if (best === null || gap < best) best = gap
    }
  }
  return best
}

/**
 * Every badge this history has earned. Pure. The caller diffs against what is
 * already persisted and inserts only the missing rows.
 */
export function computeEarnedBadges(orders: FulfilledOrder[], t: LoyaltyThresholds): EarnedBadge[] {
  const earned: EarnedBadge[] = []
  if (orders.length === 0) return earned

  earned.push({ key: 'first_bite', vendorProfileId: null, context: { orders: orders.length } })

  const byVendor = groupByVendor(orders)

  const gap = shortestReturnGapDays(byVendor)
  if (gap !== null && gap <= t.backForMoreDays) {
    earned.push({ key: 'back_for_more', vendorProfileId: null, context: { gapDays: gap } })
  }

  for (const [vendorId, list] of byVendor) {
    const days = list.map((o) => o.day)
    const segment = classifyCustomer(list.length, days)
    if (segment === 'regular' || segment === 'loyal') {
      earned.push({ key: 'regular', vendorProfileId: vendorId, context: { orders: list.length } })
    }
    if (segment === 'loyal') {
      earned.push({ key: 'local_legend', vendorProfileId: vendorId, context: { orders: list.length } })
    }
  }

  const distinctInWindow = maxDistinctVendorsInWindow(orders, t.aroundTheWorldDays)
  if (distinctInWindow >= t.aroundTheWorldVendors) {
    earned.push({ key: 'around_the_world', vendorProfileId: null, context: { vendors: distinctInWindow } })
  }

  const markets = new Set(orders.map((o) => o.marketId).filter((m): m is string => !!m))
  if (markets.size >= t.explorerMarkets) {
    earned.push({ key: 'explorer', vendorProfileId: null, context: { markets: markets.size } })
  }

  return earned
}

/**
 * Progress toward the badges NOT yet earned — what the Favorites page shows as
 * "2 more trucks for Around the World". Vendor-scoped badges report the single
 * vendor closest to the threshold.
 */
export function computeProgress(orders: FulfilledOrder[], t: LoyaltyThresholds, earnedKeys: Set<string>): BadgeProgress[] {
  const out: BadgeProgress[] = []
  const byVendor = groupByVendor(orders)

  if (!earnedKeys.has('first_bite')) out.push({ key: 'first_bite', current: Math.min(orders.length, 1), target: 1 })

  if (!earnedKeys.has('back_for_more')) {
    // Progress = has at least one order somewhere (1 of 2); the second one has to land inside the window.
    out.push({ key: 'back_for_more', current: orders.length > 0 ? 1 : 0, target: 2 })
  }

  let bestVendor: { id: string; count: number } | null = null
  for (const [id, list] of byVendor) {
    if (!bestVendor || list.length > bestVendor.count) bestVendor = { id, count: list.length }
  }
  if (bestVendor) {
    const regularKey = `regular|${bestVendor.id}`
    const legendKey = `local_legend|${bestVendor.id}`
    if (!earnedKeys.has(regularKey)) {
      out.push({ key: 'regular', current: bestVendor.count, target: SEGMENT_THRESHOLDS.regular, vendorProfileId: bestVendor.id })
    } else if (!earnedKeys.has(legendKey)) {
      out.push({ key: 'local_legend', current: bestVendor.count, target: SEGMENT_THRESHOLDS.loyal, vendorProfileId: bestVendor.id })
    }
  } else {
    out.push({ key: 'regular', current: 0, target: SEGMENT_THRESHOLDS.regular })
  }

  if (!earnedKeys.has('around_the_world')) {
    out.push({ key: 'around_the_world', current: maxDistinctVendorsInWindow(orders, t.aroundTheWorldDays), target: t.aroundTheWorldVendors })
  }

  if (!earnedKeys.has('explorer')) {
    const markets = new Set(orders.map((o) => o.marketId).filter(Boolean))
    out.push({ key: 'explorer', current: markets.size, target: t.explorerMarkets })
  }

  return out.filter((p) => BADGE_CATALOG[p.key] !== undefined)
}

/** Stable identity for a badge row: `key` or `key|vendorId`. */
export function badgeIdentity(key: string, vendorProfileId: string | null | undefined): string {
  return vendorProfileId ? `${key}|${vendorProfileId}` : key
}
