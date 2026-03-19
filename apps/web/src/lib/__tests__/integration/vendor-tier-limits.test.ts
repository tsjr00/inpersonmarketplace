/**
 * Vendor tier limit tests.
 *
 * Business Rules Covered:
 * VJ-R3: Tier limits enforced (vendor cannot publish more listings than tier allows)
 * VJ-R4: Tier limit values — unified Free/Pro/Boss (consolidated Session 61)
 *         Free: 20 listings, 3 locations, 3 boxes, 10 subscribers
 *         Pro ($25/mo): 50 listings, 5 locations, 6 boxes, 20 subscribers
 *         Boss ($50/mo): 100 listings, 8 locations, 10 boxes, 50 subscribers
 * VJ-R6: All vendors auto-assigned tier='free' on creation (fallback tested)
 * VJ-R8: Market limit per tier enforced
 * Legacy tiers (basic, standard, premium, featured) map to 'free'
 */
import { describe, it, expect } from 'vitest'
import {
  getTierLimits,
  getSubscriberDefault,
  getTierSortPriority,
  isFoodTruckTier,
  normalizeTier,
  TIER_LIMITS,
} from '@/lib/vendor-limits'

// ── VJ-R4: Unified Tier Limits ──────────────────────────────────────
describe('VJ-R4: Unified Tier Limits (Free/Pro/Boss)', () => {
  describe('Free tier limits', () => {
    it('free = 20 listings', () => {
      expect(TIER_LIMITS.free.productListings).toBe(20)
    })
    it('free = 3 locations', () => {
      expect(TIER_LIMITS.free.traditionalMarkets).toBe(3)
    })
    it('free = 3 private pickups', () => {
      expect(TIER_LIMITS.free.privatePickupLocations).toBe(3)
    })
    it('free = 3 boxes', () => {
      expect(TIER_LIMITS.free.marketBoxes).toBe(3)
    })
    it('free = 10 subscribers/offering', () => {
      expect(TIER_LIMITS.free.maxSubscribersPerOffering).toBe(10)
    })
    it('free = 7 pickup windows/location', () => {
      expect(TIER_LIMITS.free.pickupWindowsPerLocation).toBe(7)
    })
    it('free = 30-day analytics, no export', () => {
      expect(TIER_LIMITS.free.analyticsDays).toBe(30)
      expect(TIER_LIMITS.free.analyticsExport).toBe(false)
    })
    it('free = no priority placement', () => {
      expect(TIER_LIMITS.free.priorityPlacement).toBe(0)
    })
  })

  describe('Pro tier limits', () => {
    it('pro = 50 listings', () => {
      expect(TIER_LIMITS.pro.productListings).toBe(50)
    })
    it('pro = 5 locations', () => {
      expect(TIER_LIMITS.pro.traditionalMarkets).toBe(5)
    })
    it('pro = 6 boxes', () => {
      expect(TIER_LIMITS.pro.marketBoxes).toBe(6)
    })
    it('pro = 20 subscribers/offering', () => {
      expect(TIER_LIMITS.pro.maxSubscribersPerOffering).toBe(20)
    })
    it('pro = 60-day analytics', () => {
      expect(TIER_LIMITS.pro.analyticsDays).toBe(60)
    })
    it('pro = 2nd priority placement', () => {
      expect(TIER_LIMITS.pro.priorityPlacement).toBe(1)
    })
  })

  describe('Boss tier limits', () => {
    it('boss = 100 listings', () => {
      expect(TIER_LIMITS.boss.productListings).toBe(100)
    })
    it('boss = 8 locations', () => {
      expect(TIER_LIMITS.boss.traditionalMarkets).toBe(8)
    })
    it('boss = 10 boxes', () => {
      expect(TIER_LIMITS.boss.marketBoxes).toBe(10)
    })
    it('boss = 50 subscribers/offering', () => {
      expect(TIER_LIMITS.boss.maxSubscribersPerOffering).toBe(50)
    })
    it('boss = 90-day analytics + export', () => {
      expect(TIER_LIMITS.boss.analyticsDays).toBe(90)
      expect(TIER_LIMITS.boss.analyticsExport).toBe(true)
    })
    it('boss = 1st priority placement', () => {
      expect(TIER_LIMITS.boss.priorityPlacement).toBe(2)
    })
  })
})

// ── Unified across verticals ──────────────────────────────────────────
describe('Tiers are unified across verticals', () => {
  it('getTierLimits returns same limits regardless of vertical', () => {
    expect(getTierLimits('free', 'food_trucks')).toEqual(getTierLimits('free', 'farmers_market'))
    expect(getTierLimits('pro', 'food_trucks')).toEqual(getTierLimits('pro', 'farmers_market'))
    expect(getTierLimits('boss', 'food_trucks')).toEqual(getTierLimits('boss', 'farmers_market'))
  })
})

// ── Legacy tier name mapping ──────────────────────────────────────────
describe('Legacy tier names map to free', () => {
  const legacyNames = ['basic', 'standard', 'premium', 'featured']

  for (const name of legacyNames) {
    it(`'${name}' normalizes to 'free'`, () => {
      expect(normalizeTier(name)).toBe('free')
    })

    it(`getTierLimits('${name}') returns free limits`, () => {
      expect(getTierLimits(name).productListings).toBe(TIER_LIMITS.free.productListings)
    })
  }
})

// ── VJ-R6: Default tier fallback ──────────────────────────────────────
describe('VJ-R6: Unknown/new vendors fall back to free tier', () => {
  it('unknown tier gets free limits', () => {
    const limits = getTierLimits('nonexistent')
    expect(limits.productListings).toBe(TIER_LIMITS.free.productListings)
  })

  it('null tier gets free limits', () => {
    expect(normalizeTier(null)).toBe('free')
    expect(normalizeTier(undefined)).toBe('free')
  })
})

// ── Helper function tests ──────────────────────────────────────────────
describe('Tier helper functions', () => {
  it('isFoodTruckTier recognizes FT tiers', () => {
    expect(isFoodTruckTier('free')).toBe(true)
    expect(isFoodTruckTier('basic')).toBe(true) // legacy but still recognized
    expect(isFoodTruckTier('pro')).toBe(true)
    expect(isFoodTruckTier('boss')).toBe(true)
  })

  it('isFoodTruckTier rejects non-FT tiers', () => {
    expect(isFoodTruckTier('standard')).toBe(false)
    expect(isFoodTruckTier('premium')).toBe(false)
    expect(isFoodTruckTier('featured')).toBe(false)
  })

  it('getSubscriberDefault returns correct value', () => {
    expect(getSubscriberDefault('free')).toBe(10)
    expect(getSubscriberDefault('pro')).toBe(20)
    expect(getSubscriberDefault('boss')).toBe(50)
  })

  it('getTierSortPriority orders correctly', () => {
    expect(getTierSortPriority('boss')).toBe(0)
    expect(getTierSortPriority('pro')).toBe(1)
    expect(getTierSortPriority('free')).toBe(2)
    // Boss < Pro < Free (lower = higher priority)
    expect(getTierSortPriority('boss')).toBeLessThan(getTierSortPriority('pro'))
    expect(getTierSortPriority('pro')).toBeLessThan(getTierSortPriority('free'))
  })
})
