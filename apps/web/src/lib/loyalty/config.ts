/**
 * Loyalty Layer 1 — badge catalog, customer segments, per-vertical thresholds.
 *
 * Owner decisions 2026-08-25 (see .claude/loyalty_program_research.md):
 *   - A "visit" is a FULFILLED order_item (the vendor's own handoff, the same
 *     moment the payout fires). Counts are distinct ORDERS per (buyer, vendor).
 *   - Regular = 4 orders at one vendor. The top segment is "Local Legend"
 *     (renamed from "ride-or-die" — owner: some people won't like it).
 *   - Badges map to behaviors we actually want repeated. "Back for More" (the
 *     second order at the same vendor, inside a window) is THE behavior; the
 *     rest are the buyer-side fun on top.
 *   - Thresholds are per vertical: a food truck is a weekday habit, a farmers
 *     market is a weekly one. These constants mirror the shape of
 *     SMALL_ORDER_FEE_DEFAULTS in pricing.ts (code constants now, movable to
 *     verticals.config later).
 *
 * No money anywhere in this module. Layer 2 (offers) and Layer 3 (punch card /
 * VIP) come later and read the same segments.
 */

/** Lifetime standing of a buyer WITH ONE VENDOR, by distinct fulfilled orders. */
export type CustomerSegment = 'new' | 'one_timer' | 'repeat' | 'regular' | 'loyal'

/** Distinct fulfilled orders at one vendor needed to ENTER each segment. */
export const SEGMENT_THRESHOLDS = {
  repeat: 2,
  regular: 4,   // owner 2026-08-25 (was 5 in the first draft)
  loyal: 10,
} as const

/** Alternative path into `loyal`: an order in each of N consecutive months. */
export const LOYAL_CONSECUTIVE_MONTHS = 3

/** Copy the VENDOR sees on the order card. Buyer-facing names live on the badges. */
export const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  new: 'New customer',
  one_timer: '1 order',
  repeat: 'Repeat',
  regular: 'Regular',
  loyal: 'Local Legend',
}

export interface LoyaltyThresholds {
  /** "Back for More": 2nd order at the same vendor within this many days of the 1st. */
  backForMoreDays: number
  /** "Around the World": this many DISTINCT vendors … */
  aroundTheWorldVendors: number
  /** … inside a rolling window of this many days. */
  aroundTheWorldDays: number
  /** "Explorer": this many distinct pickup locations (markets / parks). */
  explorerMarkets: number
}

export const LOYALTY_THRESHOLDS: Record<string, LoyaltyThresholds> = {
  food_trucks:    { backForMoreDays: 14, aroundTheWorldVendors: 5, aroundTheWorldDays: 30, explorerMarkets: 3 },
  farmers_market: { backForMoreDays: 28, aroundTheWorldVendors: 5, aroundTheWorldDays: 90, explorerMarkets: 3 },
  fire_works:     { backForMoreDays: 28, aroundTheWorldVendors: 5, aroundTheWorldDays: 90, explorerMarkets: 3 },
}

export const DEFAULT_LOYALTY_THRESHOLDS: LoyaltyThresholds = LOYALTY_THRESHOLDS.farmers_market

export function getLoyaltyThresholds(vertical?: string | null): LoyaltyThresholds {
  if (vertical && vertical in LOYALTY_THRESHOLDS) return LOYALTY_THRESHOLDS[vertical]
  return DEFAULT_LOYALTY_THRESHOLDS
}

export type BadgeKey =
  | 'first_bite'
  | 'back_for_more'
  | 'regular'
  | 'local_legend'
  | 'around_the_world'
  | 'explorer'

export interface BadgeDefinition {
  key: BadgeKey
  /** `platform` = one per buyer per vertical; `vendor` = one per (buyer, vendor). */
  scope: 'platform' | 'vendor'
  emoji: string
  name: (vertical: string) => string
  /** What earns it — shown under the badge and in the notification. */
  description: (vertical: string, t: LoyaltyThresholds) => string
}

const isFT = (v: string) => v === 'food_trucks'
const vendorNoun = (v: string) => (isFT(v) ? 'truck' : 'vendor')
const vendorNounPlural = (v: string) => (isFT(v) ? 'trucks' : 'vendors')
const placeNounPlural = (v: string) => (isFT(v) ? 'parks or spots' : 'markets')

export const BADGE_CATALOG: Record<BadgeKey, BadgeDefinition> = {
  first_bite: {
    key: 'first_bite',
    scope: 'platform',
    emoji: '🍴',
    name: (v) => (isFT(v) ? 'First Bite' : 'First Basket'),
    description: (v) => `Your first pickup from a ${vendorNoun(v)} — welcome.`,
  },
  back_for_more: {
    key: 'back_for_more',
    scope: 'platform',
    emoji: '🔁',
    name: () => 'Back for More',
    description: (v, t) => `Ordered from the same ${vendorNoun(v)} again within ${t.backForMoreDays} days.`,
  },
  regular: {
    key: 'regular',
    scope: 'vendor',
    emoji: '⭐',
    name: () => 'Regular',
    description: (v) => `${SEGMENT_THRESHOLDS.regular} pickups from one ${vendorNoun(v)}. They know your name now.`,
  },
  local_legend: {
    key: 'local_legend',
    scope: 'vendor',
    emoji: '🏆',
    name: () => 'Local Legend',
    description: (v) =>
      `${SEGMENT_THRESHOLDS.loyal} pickups from one ${vendorNoun(v)}, or an order every month for ${LOYAL_CONSECUTIVE_MONTHS} months running.`,
  },
  around_the_world: {
    key: 'around_the_world',
    scope: 'platform',
    emoji: '🌎',
    name: (v) => (isFT(v) ? 'Around the World' : 'Market Hopper'),
    description: (v, t) => `${t.aroundTheWorldVendors} different ${vendorNounPlural(v)} in ${t.aroundTheWorldDays} days.`,
  },
  explorer: {
    key: 'explorer',
    scope: 'platform',
    emoji: '🧭',
    name: () => 'Explorer',
    description: (v, t) => `Picked up at ${t.explorerMarkets} different ${placeNounPlural(v)}.`,
  },
}

export const BADGE_KEYS = Object.keys(BADGE_CATALOG) as BadgeKey[]
