/**
 * Vendor tier limit tests.
 *
 * Business Rules Covered:
 * VJ-R3: Tier limits enforced (vendor cannot publish more listings than tier allows)
 * VJ-R4: Tier limit values match per-vertical per-tier (confirmed Session 49)
 *         FM: free=5, standard=10, premium=20, featured=30
 *         FT: free=5, basic=10, pro=20, boss=45
 * VJ-R6: All vendors auto-assigned tier='free' on creation (fallback tested)
 * VJ-R8: Market limit per tier enforced
 * VI-R12: Vendor tier names differ per vertical
 */
import { describe, it, expect } from 'vitest'
import {
  getTierLimits,
  getSubscriberDefault,
  getTierSortPriority,
  isFoodTruckTier,
  getFtTierExtras,
  TIER_LIMITS,
  FT_TIER_LIMITS,
} from '@/lib/vendor-limits'

// ── VJ-R4/VI-R12: Cross-Vertical Isolation ──────────────────────────
describe('VJ-R4/VI-R12: Vendor Tier Limits — Cross-Vertical Isolation', () => {
  describe('FM tiers should never return FT limits', () => {
    it('standard FM tier returns FM limits, not FT free', () => {
      const limits = getTierLimits('standard', 'farmers_market')
      expect(limits.productListings).toBe(10) // Updated Session 49
      expect(limits.traditionalMarkets).toBe(2) // Updated Session 49
      // FM standard gets 3 total market boxes, FT free gets 0
      expect(limits.totalMarketBoxes).toBe(3) // Updated Session 49
    })

    it('premium FM tier returns FM limits', () => {
      const limits = getTierLimits('premium', 'farmers_market')
      expect(limits.productListings).toBe(20) // Updated Session 49
      expect(limits.traditionalMarkets).toBe(3) // Updated Session 49
    })

    it('FM tier names do not resolve as FT tiers', () => {
      expect(isFoodTruckTier('standard')).toBe(false)
      expect(isFoodTruckTier('premium')).toBe(false)
      expect(isFoodTruckTier('featured')).toBe(false)
    })
  })

  describe('FT tiers should never return FM limits', () => {
    it('free FT tier returns FT limits', () => {
      const limits = getTierLimits('free', 'food_trucks')
      expect(limits.productListings).toBe(5)
      // FT free gets 1 chef box with 5 max subscribers (updated per user feedback)
      expect(limits.totalMarketBoxes).toBe(1)
      expect(limits.activeMarketBoxes).toBe(1)
    })

    it('boss FT tier returns FT limits with highest listings', () => {
      const limits = getTierLimits('boss', 'food_trucks')
      expect(limits.productListings).toBe(45)
      expect(limits.traditionalMarkets).toBe(8)
      expect(limits.totalMarketBoxes).toBe(8)
    })

    it('FT tier names correctly identified', () => {
      expect(isFoodTruckTier('free')).toBe(true)
      expect(isFoodTruckTier('basic')).toBe(true)
      expect(isFoodTruckTier('pro')).toBe(true)
      expect(isFoodTruckTier('boss')).toBe(true)
    })
  })

  describe('Unknown tiers fall back safely', () => {
    it('unknown FM tier falls back to free', () => {
      const limits = getTierLimits('invalid_tier', 'farmers_market')
      expect(limits.productListings).toBe(TIER_LIMITS.free.productListings) // VJ-R6: defaults to free
    })

    it('unknown FT tier falls back to free', () => {
      const limits = getTierLimits('invalid_tier', 'food_trucks')
      expect(limits.productListings).toBe(FT_TIER_LIMITS.free.productListings)
    })

    it('FM standard on FT vertical falls back to free', () => {
      // A vendor with FM 'standard' tier accidentally on FT vertical
      const limits = getTierLimits('standard', 'food_trucks')
      expect(limits.productListings).toBe(FT_TIER_LIMITS.free.productListings)
    })

    it('no vertical defaults to FM limits', () => {
      const limits = getTierLimits('standard')
      expect(limits).toEqual(TIER_LIMITS.standard)
    })
  })
})

// ── VJ-R3: Monotonic Progression ────────────────────────────────────
describe('VJ-R3: Vendor Tier Limits — Monotonic Progression', () => {
  describe('FM tiers increase monotonically', () => {
    const tiers = ['standard', 'premium'] as const

    it('listing limits increase with tier', () => {
      for (let i = 1; i < tiers.length; i++) {
        const lower = TIER_LIMITS[tiers[i - 1]]
        const higher = TIER_LIMITS[tiers[i]]
        expect(higher.productListings).toBeGreaterThanOrEqual(lower.productListings)
      }
    })

    it('market limits increase with tier', () => {
      for (let i = 1; i < tiers.length; i++) {
        const lower = TIER_LIMITS[tiers[i - 1]]
        const higher = TIER_LIMITS[tiers[i]]
        expect(higher.traditionalMarkets).toBeGreaterThanOrEqual(lower.traditionalMarkets)
      }
    })
  })

  describe('FT tiers increase monotonically', () => {
    const tiers = ['free', 'basic', 'pro', 'boss'] as const

    it('listing limits increase with tier', () => {
      for (let i = 1; i < tiers.length; i++) {
        const lower = FT_TIER_LIMITS[tiers[i - 1]]
        const higher = FT_TIER_LIMITS[tiers[i]]
        expect(higher.productListings).toBeGreaterThanOrEqual(lower.productListings)
      }
    })

    it('market box limits increase with tier', () => {
      for (let i = 1; i < tiers.length; i++) {
        const lower = FT_TIER_LIMITS[tiers[i - 1]]
        const higher = FT_TIER_LIMITS[tiers[i]]
        expect(higher.totalMarketBoxes).toBeGreaterThanOrEqual(lower.totalMarketBoxes)
      }
    })

    it('analytics days increase with tier', () => {
      for (let i = 1; i < tiers.length; i++) {
        const lower = FT_TIER_LIMITS[tiers[i - 1]]
        const higher = FT_TIER_LIMITS[tiers[i]]
        expect(higher.analyticsDays).toBeGreaterThanOrEqual(lower.analyticsDays)
      }
    })

    it('subscriber caps increase with tier', () => {
      for (let i = 1; i < tiers.length; i++) {
        const lower = FT_TIER_LIMITS[tiers[i - 1]]
        const higher = FT_TIER_LIMITS[tiers[i]]
        expect(higher.maxSubscribersPerOffering).toBeGreaterThanOrEqual(lower.maxSubscribersPerOffering)
      }
    })
  })
})

describe('Tier Sort Priority', () => {
  it('FT boss has highest priority (lowest number)', () => {
    expect(getTierSortPriority('boss', 'food_trucks')).toBe(0)
    expect(getTierSortPriority('pro', 'food_trucks')).toBe(1)
    expect(getTierSortPriority('basic', 'food_trucks')).toBe(2)
    expect(getTierSortPriority('free', 'food_trucks')).toBe(3)
  })

  it('FM featured has highest priority, premium second', () => {
    expect(getTierSortPriority('featured', 'farmers_market')).toBe(0)
    expect(getTierSortPriority('premium', 'farmers_market')).toBe(1)
    expect(getTierSortPriority('standard', 'farmers_market')).toBe(2)
  })

  it('undefined tier gets lowest priority (free fallback)', () => {
    expect(getTierSortPriority(undefined, 'food_trucks')).toBe(4)
    expect(getTierSortPriority(undefined, 'farmers_market')).toBe(3) // falls to free
  })
})

describe('FT Tier Extras', () => {
  it('free tier gets minimal extras', () => {
    const extras = getFtTierExtras('free')
    expect(extras.analyticsDays).toBe(0)
    expect(extras.analyticsExport).toBe(false)
    expect(extras.priorityPlacement).toBe(0)
    expect(extras.notificationChannels).toEqual(['in_app'])
    expect(extras.locationInsights).toBe('none')
  })

  it('boss tier gets maximum extras', () => {
    const extras = getFtTierExtras('boss')
    expect(extras.analyticsDays).toBe(90)
    expect(extras.analyticsExport).toBe(true)
    expect(extras.priorityPlacement).toBe(2)
    expect(extras.notificationChannels).toContain('sms')
    expect(extras.locationInsights).toBe('boss')
  })

  it('notification channels expand progressively', () => {
    const free = getFtTierExtras('free').notificationChannels
    const basic = getFtTierExtras('basic').notificationChannels
    const pro = getFtTierExtras('pro').notificationChannels
    const boss = getFtTierExtras('boss').notificationChannels

    expect(free.length).toBeLessThanOrEqual(basic.length)
    expect(basic.length).toBeLessThanOrEqual(pro.length)
    expect(pro.length).toBeLessThanOrEqual(boss.length)
  })
})

// ── VJ-R4: Subscriber defaults ──────────────────────────────────────
describe('VJ-R4: Subscriber Defaults', () => {
  it('FM standard gets lower default than premium', () => {
    const standard = getSubscriberDefault('standard', 'farmers_market')
    const premium = getSubscriberDefault('premium', 'farmers_market')
    expect(premium).toBeGreaterThan(standard)
  })

  it('FT free gets 5 subscribers (1 Chef Box with up to 5 clients)', () => {
    expect(getSubscriberDefault('free', 'food_trucks')).toBe(5)
  })

  it('FT boss gets highest subscriber default', () => {
    const boss = getSubscriberDefault('boss', 'food_trucks')
    const pro = getSubscriberDefault('pro', 'food_trucks')
    expect(boss).toBeGreaterThan(pro)
  })
})

// ══════════════════════════════════════════════════════════════════════
// VJ-R4: EXACT TIER LIMIT VALUES (confirmed Session 49)
// These tests lock down the exact values from the business rules audit.
// If any limit changes, these tests will catch it.
// ══════════════════════════════════════════════════════════════════════

describe('VJ-R4: FM tier listing limits (confirmed values)', () => {
  it('free = 5 listings', () => {
    expect(TIER_LIMITS.free.productListings).toBe(5)
  })
  it('standard = 10 listings', () => {
    expect(TIER_LIMITS.standard.productListings).toBe(10)
  })
  it('premium = 20 listings', () => {
    expect(TIER_LIMITS.premium.productListings).toBe(20)
  })
  it('featured = 30 listings', () => {
    expect(TIER_LIMITS.featured.productListings).toBe(30)
  })
})

describe('VJ-R4: FT tier listing limits (confirmed values)', () => {
  it('free = 5 listings', () => {
    expect(FT_TIER_LIMITS.free.productListings).toBe(5)
  })
  it('basic = 10 listings', () => {
    expect(FT_TIER_LIMITS.basic.productListings).toBe(10)
  })
  it('pro = 20 listings', () => {
    expect(FT_TIER_LIMITS.pro.productListings).toBe(20)
  })
  it('boss = 45 listings', () => {
    expect(FT_TIER_LIMITS.boss.productListings).toBe(45)
  })
})

describe('VJ-R8: FM traditional market limits (confirmed values)', () => {
  it('free = 1 market', () => {
    expect(TIER_LIMITS.free.traditionalMarkets).toBe(1)
  })
  it('standard = 2 markets', () => {
    expect(TIER_LIMITS.standard.traditionalMarkets).toBe(2)
  })
  it('premium = 3 markets', () => {
    expect(TIER_LIMITS.premium.traditionalMarkets).toBe(3)
  })
  it('featured = 5 markets', () => {
    expect(TIER_LIMITS.featured.traditionalMarkets).toBe(5)
  })
})

describe('VJ-R8: FT traditional market limits (confirmed values)', () => {
  it('free = 1 market', () => {
    expect(FT_TIER_LIMITS.free.traditionalMarkets).toBe(1)
  })
  it('basic = 3 markets', () => {
    expect(FT_TIER_LIMITS.basic.traditionalMarkets).toBe(3)
  })
  it('pro = 5 markets', () => {
    expect(FT_TIER_LIMITS.pro.traditionalMarkets).toBe(5)
  })
  it('boss = 8 markets', () => {
    expect(FT_TIER_LIMITS.boss.traditionalMarkets).toBe(8)
  })
})

describe('VJ-R4: Market box limits (confirmed values)', () => {
  it('FT free = 1 chef box (1 active, up to 5 subscribers)', () => {
    expect(FT_TIER_LIMITS.free.totalMarketBoxes).toBe(1)
    expect(FT_TIER_LIMITS.free.activeMarketBoxes).toBe(1)
  })
  it('FT basic = 2 total, 2 active chef boxes', () => {
    expect(FT_TIER_LIMITS.basic.totalMarketBoxes).toBe(2)
    expect(FT_TIER_LIMITS.basic.activeMarketBoxes).toBe(2)
  })
  it('FT pro = 4 total, 4 active chef boxes', () => {
    expect(FT_TIER_LIMITS.pro.totalMarketBoxes).toBe(4)
    expect(FT_TIER_LIMITS.pro.activeMarketBoxes).toBe(4)
  })
  it('FT boss = 8 total, 8 active chef boxes', () => {
    expect(FT_TIER_LIMITS.boss.totalMarketBoxes).toBe(8)
    expect(FT_TIER_LIMITS.boss.activeMarketBoxes).toBe(8)
  })
  it('FM free = 2 total, 1 active market boxes', () => {
    expect(TIER_LIMITS.free.totalMarketBoxes).toBe(2)
    expect(TIER_LIMITS.free.activeMarketBoxes).toBe(1)
  })
  it('FM standard = 3 total, 2 active market boxes', () => {
    expect(TIER_LIMITS.standard.totalMarketBoxes).toBe(3)
    expect(TIER_LIMITS.standard.activeMarketBoxes).toBe(2)
  })
})

describe('VJ-R4: Subscriber caps (confirmed values)', () => {
  it('FT free = 5 subscribers/offering', () => {
    expect(FT_TIER_LIMITS.free.maxSubscribersPerOffering).toBe(5)
  })
  it('FT basic = 10 subscribers/offering', () => {
    expect(FT_TIER_LIMITS.basic.maxSubscribersPerOffering).toBe(10)
  })
  it('FT pro = 20 subscribers/offering', () => {
    expect(FT_TIER_LIMITS.pro.maxSubscribersPerOffering).toBe(20)
  })
  it('FT boss = 50 subscribers/offering', () => {
    expect(FT_TIER_LIMITS.boss.maxSubscribersPerOffering).toBe(50)
  })
  it('FM free = 5 subscribers/offering', () => {
    expect(TIER_LIMITS.free.maxSubscribersPerOffering).toBe(5)
  })
  it('FM standard = 10 subscribers/offering', () => {
    expect(TIER_LIMITS.standard.maxSubscribersPerOffering).toBe(10)
  })
  it('FM premium = 20 subscribers/offering', () => {
    expect(TIER_LIMITS.premium.maxSubscribersPerOffering).toBe(20)
  })
  it('FM featured = 30 subscribers/offering', () => {
    expect(TIER_LIMITS.featured.maxSubscribersPerOffering).toBe(30)
  })
})

// ══════════════════════════════════════════════════════════════════════
// VJ-R6: Default tier fallback
// ══════════════════════════════════════════════════════════════════════

describe('VJ-R6: Unknown/new vendors fall back to free tier', () => {
  it('FM unknown tier gets free limits (5 listings)', () => {
    const limits = getTierLimits('nonexistent', 'farmers_market')
    expect(limits.productListings).toBe(TIER_LIMITS.free.productListings)
  })
  it('FT unknown tier gets free limits (5 listings)', () => {
    const limits = getTierLimits('nonexistent', 'food_trucks')
    expect(limits.productListings).toBe(FT_TIER_LIMITS.free.productListings)
  })
})
