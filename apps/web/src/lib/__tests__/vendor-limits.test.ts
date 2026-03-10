/**
 * Vendor Tier Limits Tests
 *
 * Tests getTierLimits() for all FM and FT tiers, plus LOW_STOCK_THRESHOLD.
 * Covers: VJ-R3 (tier limits), VJ-R6 (low stock), VJ-R8 (market/location limits)
 *
 * Run: npx vitest run src/lib/__tests__/vendor-limits.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  TIER_LIMITS,
  FT_TIER_LIMITS,
  getTierLimits,
  isFoodTruckTier,
  isPremiumTier,
} from '../vendor-limits'
import { LOW_STOCK_THRESHOLD } from '../constants'

// -- VJ-R6: Low Stock Threshold --

describe('LOW_STOCK_THRESHOLD', () => {
  it('is 5', () => {
    expect(LOW_STOCK_THRESHOLD).toBe(5)
  })
})

// -- VJ-R3: getTierLimits for all tiers --

describe('getTierLimits — FM tiers', () => {
  it('free tier has 5 product listings', () => {
    const limits = getTierLimits('free')
    expect(limits.productListings).toBe(5)
  })

  it('standard tier has 10 product listings', () => {
    const limits = getTierLimits('standard')
    expect(limits.productListings).toBe(10)
  })

  it('premium tier has 20 product listings', () => {
    const limits = getTierLimits('premium')
    expect(limits.productListings).toBe(20)
  })

  it('featured tier has 30 product listings', () => {
    const limits = getTierLimits('featured')
    expect(limits.productListings).toBe(30)
  })

  it('unknown tier → falls back to free', () => {
    const limits = getTierLimits('nonexistent')
    expect(limits.productListings).toBe(TIER_LIMITS.free.productListings)
  })
})

describe('getTierLimits — FT tiers', () => {
  it('free FT tier has 5 product listings', () => {
    const limits = getTierLimits('free', 'food_trucks')
    expect(limits.productListings).toBe(5)
  })

  it('basic FT tier has 10 product listings', () => {
    const limits = getTierLimits('basic', 'food_trucks')
    expect(limits.productListings).toBe(10)
  })

  it('pro FT tier has 20 product listings', () => {
    const limits = getTierLimits('pro', 'food_trucks')
    expect(limits.productListings).toBe(20)
  })

  it('boss FT tier has 45 product listings', () => {
    const limits = getTierLimits('boss', 'food_trucks')
    expect(limits.productListings).toBe(45)
  })

  it('unknown FT tier → falls back to FT free', () => {
    const limits = getTierLimits('standard', 'food_trucks')
    expect(limits.productListings).toBe(FT_TIER_LIMITS.free.productListings)
  })
})

// -- VJ-R8: Market/Location Limits --

describe('market and location limits per tier', () => {
  it('FM free: 1 traditional market, 1 private pickup', () => {
    const limits = getTierLimits('free')
    expect(limits.traditionalMarkets).toBe(1)
    expect(limits.privatePickupLocations).toBe(1)
  })

  it('FM featured: 5 traditional markets, 5 private pickups', () => {
    const limits = getTierLimits('featured')
    expect(limits.traditionalMarkets).toBe(5)
    expect(limits.privatePickupLocations).toBe(5)
  })

  it('FT free: 1 traditional market, 2 private pickups', () => {
    const limits = getTierLimits('free', 'food_trucks')
    expect(limits.traditionalMarkets).toBe(1)
    expect(limits.privatePickupLocations).toBe(2)
  })

  it('FT boss: 8 traditional markets, 15 private pickups', () => {
    const limits = getTierLimits('boss', 'food_trucks')
    expect(limits.traditionalMarkets).toBe(8)
    expect(limits.privatePickupLocations).toBe(15)
  })

  it('higher tiers have more limits than lower tiers (FM)', () => {
    const free = getTierLimits('free')
    const featured = getTierLimits('featured')
    expect(featured.productListings).toBeGreaterThan(free.productListings)
    expect(featured.traditionalMarkets).toBeGreaterThan(free.traditionalMarkets)
  })

  it('higher tiers have more limits than lower tiers (FT)', () => {
    const free = getTierLimits('free', 'food_trucks')
    const boss = getTierLimits('boss', 'food_trucks')
    expect(boss.productListings).toBeGreaterThan(free.productListings)
    expect(boss.traditionalMarkets).toBeGreaterThan(free.traditionalMarkets)
  })
})

// -- Helper functions --

describe('isFoodTruckTier', () => {
  it('basic is a FT tier', () => {
    expect(isFoodTruckTier('basic')).toBe(true)
  })

  it('boss is a FT tier', () => {
    expect(isFoodTruckTier('boss')).toBe(true)
  })

  it('standard is NOT a FT tier', () => {
    expect(isFoodTruckTier('standard')).toBe(false)
  })

  it('premium is NOT a FT tier', () => {
    expect(isFoodTruckTier('premium')).toBe(false)
  })
})

describe('isPremiumTier', () => {
  it('FM premium → true', () => {
    expect(isPremiumTier('premium')).toBe(true)
  })

  it('FM featured → true', () => {
    expect(isPremiumTier('featured')).toBe(true)
  })

  it('FM free → false', () => {
    expect(isPremiumTier('free')).toBe(false)
  })

  it('FT pro → true', () => {
    expect(isPremiumTier('pro', 'food_trucks')).toBe(true)
  })

  it('FT boss → true', () => {
    expect(isPremiumTier('boss', 'food_trucks')).toBe(true)
  })

  it('FT basic → false', () => {
    expect(isPremiumTier('basic', 'food_trucks')).toBe(false)
  })
})
