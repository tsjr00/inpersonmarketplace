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

/**
 * Integration tests for vendor tier limits across verticals.
 * Ensures FM and FT tiers are properly isolated and correctly configured.
 */

describe('Vendor Tier Limits — Cross-Vertical Isolation', () => {
  describe('FM tiers should never return FT limits', () => {
    it('standard FM tier returns FM limits, not FT free', () => {
      const limits = getTierLimits('standard', 'farmers_market')
      expect(limits.productListings).toBe(5)
      expect(limits.traditionalMarkets).toBe(1)
      // FM standard gets 2 total market boxes, FT free gets 0
      expect(limits.totalMarketBoxes).toBe(2)
    })

    it('premium FM tier returns FM limits', () => {
      const limits = getTierLimits('premium', 'farmers_market')
      expect(limits.productListings).toBe(15)
      expect(limits.traditionalMarkets).toBe(4)
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
      // FT free gets 0 market boxes (Chef Boxes)
      expect(limits.totalMarketBoxes).toBe(0)
      expect(limits.activeMarketBoxes).toBe(0)
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
    it('unknown FM tier falls back to standard', () => {
      const limits = getTierLimits('invalid_tier', 'farmers_market')
      expect(limits.productListings).toBe(TIER_LIMITS.standard.productListings)
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

describe('Vendor Tier Limits — Monotonic Progression', () => {
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

  it('FM premium/featured have highest priority', () => {
    expect(getTierSortPriority('premium', 'farmers_market')).toBe(0)
    expect(getTierSortPriority('featured', 'farmers_market')).toBe(0)
    expect(getTierSortPriority('standard', 'farmers_market')).toBe(1)
  })

  it('undefined tier gets lowest priority', () => {
    expect(getTierSortPriority(undefined, 'food_trucks')).toBe(4)
    expect(getTierSortPriority(undefined, 'farmers_market')).toBe(1)
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

describe('Subscriber Defaults', () => {
  it('FM standard gets lower default than premium', () => {
    const standard = getSubscriberDefault('standard', 'farmers_market')
    const premium = getSubscriberDefault('premium', 'farmers_market')
    expect(premium).toBeGreaterThan(standard)
  })

  it('FT free gets 0 subscribers (no Chef Boxes)', () => {
    expect(getSubscriberDefault('free', 'food_trucks')).toBe(0)
  })

  it('FT boss gets highest subscriber default', () => {
    const boss = getSubscriberDefault('boss', 'food_trucks')
    const pro = getSubscriberDefault('pro', 'food_trucks')
    expect(boss).toBeGreaterThan(pro)
  })
})
