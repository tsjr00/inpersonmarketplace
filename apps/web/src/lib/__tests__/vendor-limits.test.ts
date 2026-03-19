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
  getTierLimits,
  isFoodTruckTier,
  isPremiumTier,
  normalizeTier,
} from '../vendor-limits'
import { LOW_STOCK_THRESHOLD } from '../constants'

// -- VJ-R6: Low Stock Threshold --

describe('LOW_STOCK_THRESHOLD', () => {
  it('is 5', () => {
    expect(LOW_STOCK_THRESHOLD).toBe(5)
  })
})

// -- VJ-R3: getTierLimits for all tiers --

describe('getTierLimits — unified tiers (same for FM and FT)', () => {
  it('free tier has 20 product listings', () => {
    const limits = getTierLimits('free')
    expect(limits.productListings).toBe(20)
  })

  it('pro tier has 50 product listings', () => {
    const limits = getTierLimits('pro')
    expect(limits.productListings).toBe(50)
  })

  it('boss tier has 100 product listings', () => {
    const limits = getTierLimits('boss')
    expect(limits.productListings).toBe(100)
  })

  it('legacy "standard" maps to free (20 listings)', () => {
    const limits = getTierLimits('standard')
    expect(limits.productListings).toBe(20)
  })

  it('legacy "premium" maps to free (20 listings)', () => {
    const limits = getTierLimits('premium')
    expect(limits.productListings).toBe(20)
  })

  it('legacy "featured" maps to free (20 listings)', () => {
    const limits = getTierLimits('featured')
    expect(limits.productListings).toBe(20)
  })

  it('unknown tier → falls back to free', () => {
    const limits = getTierLimits('nonexistent')
    expect(limits.productListings).toBe(TIER_LIMITS.free.productListings)
  })
})

describe('getTierLimits — FT vertical (same unified limits)', () => {
  it('free FT tier has 20 listings (same as FM)', () => {
    const limits = getTierLimits('free', 'food_trucks')
    expect(limits.productListings).toBe(20)
  })

  it('legacy "basic" FT tier maps to free (20 listings)', () => {
    const limits = getTierLimits('basic', 'food_trucks')
    expect(limits.productListings).toBe(20)
  })

  it('pro FT tier has 50 listings', () => {
    const limits = getTierLimits('pro', 'food_trucks')
    expect(limits.productListings).toBe(50)
  })

  it('boss FT tier has 100 listings', () => {
    const limits = getTierLimits('boss', 'food_trucks')
    expect(limits.productListings).toBe(100)
  })

  it('FM and FT return identical limits for same tier', () => {
    const fmFree = getTierLimits('free', 'farmers_market')
    const ftFree = getTierLimits('free', 'food_trucks')
    expect(fmFree).toEqual(ftFree)
  })
})

// -- VJ-R8: Market/Location Limits --

describe('market and location limits per tier', () => {
  it('free: 3 locations, 3 private pickups', () => {
    const limits = getTierLimits('free')
    expect(limits.traditionalMarkets).toBe(3)
    expect(limits.privatePickupLocations).toBe(3)
  })

  it('pro: 5 locations, 5 private pickups', () => {
    const limits = getTierLimits('pro')
    expect(limits.traditionalMarkets).toBe(5)
    expect(limits.privatePickupLocations).toBe(5)
  })

  it('boss: 8 locations, 15 private pickups', () => {
    const limits = getTierLimits('boss')
    expect(limits.traditionalMarkets).toBe(8)
    expect(limits.privatePickupLocations).toBe(15)
  })

  it('legacy "featured" maps to free (3 locations)', () => {
    const limits = getTierLimits('featured')
    expect(limits.traditionalMarkets).toBe(3)
    expect(limits.privatePickupLocations).toBe(3)
  })

  it('higher tiers have more limits than lower tiers', () => {
    const free = getTierLimits('free')
    const pro = getTierLimits('pro')
    const boss = getTierLimits('boss')
    expect(pro.productListings).toBeGreaterThan(free.productListings)
    expect(boss.productListings).toBeGreaterThan(pro.productListings)
    expect(pro.traditionalMarkets).toBeGreaterThan(free.traditionalMarkets)
    expect(boss.traditionalMarkets).toBeGreaterThan(pro.traditionalMarkets)
  })

  it('FM and FT boss return same limits', () => {
    const fmBoss = getTierLimits('boss', 'farmers_market')
    const ftBoss = getTierLimits('boss', 'food_trucks')
    expect(fmBoss).toEqual(ftBoss)
  })
})

// -- Helper functions --

describe('isFoodTruckTier (deprecated — kept for backward compat)', () => {
  it('basic is a FT tier', () => {
    expect(isFoodTruckTier('basic')).toBe(true)
  })

  it('boss is a FT tier', () => {
    expect(isFoodTruckTier('boss')).toBe(true)
  })

  it('pro is a FT tier', () => {
    expect(isFoodTruckTier('pro')).toBe(true)
  })

  it('free is a FT tier', () => {
    expect(isFoodTruckTier('free')).toBe(true)
  })

  it('standard is NOT a FT tier', () => {
    expect(isFoodTruckTier('standard')).toBe(false)
  })

  it('premium is NOT a FT tier', () => {
    expect(isFoodTruckTier('premium')).toBe(false)
  })
})

describe('isPremiumTier', () => {
  it('pro → true', () => {
    expect(isPremiumTier('pro')).toBe(true)
  })

  it('boss → true', () => {
    expect(isPremiumTier('boss')).toBe(true)
  })

  it('free → false', () => {
    expect(isPremiumTier('free')).toBe(false)
  })

  it('legacy "premium" → false (maps to free)', () => {
    expect(isPremiumTier('premium')).toBe(false)
  })

  it('legacy "featured" → false (maps to free)', () => {
    expect(isPremiumTier('featured')).toBe(false)
  })

  it('legacy "basic" → false (maps to free)', () => {
    expect(isPremiumTier('basic')).toBe(false)
  })

  it('legacy "standard" → false (maps to free)', () => {
    expect(isPremiumTier('standard')).toBe(false)
  })

  it('vertical param does not change result', () => {
    expect(isPremiumTier('pro', 'food_trucks')).toBe(true)
    expect(isPremiumTier('pro', 'farmers_market')).toBe(true)
    expect(isPremiumTier('boss', 'food_trucks')).toBe(true)
    expect(isPremiumTier('boss', 'farmers_market')).toBe(true)
  })
})
