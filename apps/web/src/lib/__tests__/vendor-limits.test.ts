/**
 * Vendor Tier Limits Tests
 *
 * Tests getTierLimits() for all FM and FT tiers, plus LOW_STOCK_THRESHOLD.
 * Covers: VJ-R3 (tier limits), VJ-R6 (low stock), VJ-R8 (market/location limits)
 *
 * Run: npx vitest run src/lib/__tests__/vendor-limits.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import {
  TIER_LIMITS,
  getTierLimits,
  isFoodTruckTier,
  isPremiumTier,
  normalizeTier,
  getTraditionalMarketUsage,
  getTraditionalMarketUsageExcludingListing,
  canAddTraditionalMarket,
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

// -- Session 70 fix: getTraditionalMarketUsage counts via listing_markets junction --
//
// Before Session 70 this function queried listings.market_id which does not
// exist in the schema. It silently returned { count: 0 } for every vendor,
// making the entire traditional market cap unenforced. These tests lock in
// the fixed behavior.

interface MockBuilder {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  is: ReturnType<typeof vi.fn>
  neq: ReturnType<typeof vi.fn>
  then: (fn: (result: { data: unknown; error: unknown }) => unknown) => Promise<unknown>
}

function makeBuilder(result: { data: unknown; error: unknown }): MockBuilder {
  const builder: MockBuilder = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    neq: vi.fn(),
    then: (onFulfilled) => Promise.resolve(result).then(onFulfilled),
  }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.is.mockReturnValue(builder)
  builder.neq.mockReturnValue(builder)
  return builder
}

/**
 * Mock client that returns different results for different tables.
 * `from('listing_markets')` returns the first arg's builder,
 * `from('market_box_offerings')` returns the second arg's builder.
 */
function mockSupabase(
  listingMarketsResult: { data: unknown; error: unknown },
  boxMarketsResult: { data: unknown; error: unknown }
) {
  const lmBuilder = makeBuilder(listingMarketsResult)
  const boxBuilder = makeBuilder(boxMarketsResult)

  return {
    from: vi.fn((table: string) => {
      if (table === 'listing_markets') return lmBuilder
      if (table === 'market_box_offerings') return boxBuilder
      return makeBuilder({ data: [], error: null })
    }),
  }
}

describe('getTraditionalMarketUsage', () => {
  it('returns 0 when vendor has no listings and no market boxes', async () => {
    const supabase = mockSupabase(
      { data: [], error: null },
      { data: [], error: null }
    )

    const result = await getTraditionalMarketUsage(supabase as never, 'vp-1')

    expect(result.count).toBe(0)
    expect(result.marketIds).toEqual([])
  })

  it('counts unique traditional markets from listing_markets', async () => {
    const supabase = mockSupabase(
      {
        data: [
          { market_id: 'market-a', listings: { vendor_profile_id: 'vp-1', status: 'published', deleted_at: null }, markets: { market_type: 'traditional' } },
          { market_id: 'market-b', listings: { vendor_profile_id: 'vp-1', status: 'published', deleted_at: null }, markets: { market_type: 'traditional' } },
        ],
        error: null,
      },
      { data: [], error: null }
    )

    const result = await getTraditionalMarketUsage(supabase as never, 'vp-1')

    expect(result.count).toBe(2)
    expect(result.marketIds).toEqual(expect.arrayContaining(['market-a', 'market-b']))
  })

  it('deduplicates a market counted in both listing_markets and market_box_offerings', async () => {
    const supabase = mockSupabase(
      {
        data: [
          { market_id: 'market-a', listings: { vendor_profile_id: 'vp-1', status: 'published', deleted_at: null }, markets: { market_type: 'traditional' } },
        ],
        error: null,
      },
      {
        data: [
          { pickup_market_id: 'market-a', markets: { market_type: 'traditional' } },
        ],
        error: null,
      }
    )

    const result = await getTraditionalMarketUsage(supabase as never, 'vp-1')

    expect(result.count).toBe(1)
    expect(result.marketIds).toEqual(['market-a'])
  })

  it('counts the same market once even when multiple listings share it', async () => {
    const supabase = mockSupabase(
      {
        data: [
          { market_id: 'market-a', listings: { vendor_profile_id: 'vp-1', status: 'published', deleted_at: null }, markets: { market_type: 'traditional' } },
          { market_id: 'market-a', listings: { vendor_profile_id: 'vp-1', status: 'published', deleted_at: null }, markets: { market_type: 'traditional' } },
          { market_id: 'market-a', listings: { vendor_profile_id: 'vp-1', status: 'published', deleted_at: null }, markets: { market_type: 'traditional' } },
        ],
        error: null,
      },
      { data: [], error: null }
    )

    const result = await getTraditionalMarketUsage(supabase as never, 'vp-1')

    expect(result.count).toBe(1)
    expect(result.marketIds).toEqual(['market-a'])
  })

  it('excludes market boxes whose pickup market is not traditional', async () => {
    const supabase = mockSupabase(
      { data: [], error: null },
      {
        data: [
          { pickup_market_id: 'private-a', markets: { market_type: 'private_pickup' } },
          { pickup_market_id: 'market-a', markets: { market_type: 'traditional' } },
        ],
        error: null,
      }
    )

    const result = await getTraditionalMarketUsage(supabase as never, 'vp-1')

    expect(result.count).toBe(1)
    expect(result.marketIds).toEqual(['market-a'])
  })
})

describe('getTraditionalMarketUsageExcludingListing', () => {
  it('returns same shape as getTraditionalMarketUsage', async () => {
    const supabase = mockSupabase(
      {
        data: [
          { market_id: 'market-a', listings: { vendor_profile_id: 'vp-1', status: 'published', deleted_at: null }, markets: { market_type: 'traditional' } },
        ],
        error: null,
      },
      { data: [], error: null }
    )

    const result = await getTraditionalMarketUsageExcludingListing(
      supabase as never,
      'vp-1',
      'listing-being-edited'
    )

    expect(result.count).toBe(1)
    expect(result.marketIds).toEqual(['market-a'])
  })
})

// -- Session 70 fix: canAddTraditionalMarket enforces per-tier cap --

describe('canAddTraditionalMarket', () => {
  it('allows when count < limit (free tier, 2 of 3 used)', async () => {
    const supabase = mockSupabase(
      {
        data: [
          { market_id: 'market-a', listings: { vendor_profile_id: 'vp-1', status: 'published', deleted_at: null }, markets: { market_type: 'traditional' } },
          { market_id: 'market-b', listings: { vendor_profile_id: 'vp-1', status: 'published', deleted_at: null }, markets: { market_type: 'traditional' } },
        ],
        error: null,
      },
      { data: [], error: null }
    )

    const result = await canAddTraditionalMarket(supabase as never, 'vp-1', 'free')

    expect(result.allowed).toBe(true)
    expect(result.current).toBe(2)
    expect(result.limit).toBe(3)
  })

  it('rejects when count === limit (free tier, 3 of 3 used)', async () => {
    const supabase = mockSupabase(
      {
        data: [
          { market_id: 'market-a', listings: { vendor_profile_id: 'vp-1', status: 'published', deleted_at: null }, markets: { market_type: 'traditional' } },
          { market_id: 'market-b', listings: { vendor_profile_id: 'vp-1', status: 'published', deleted_at: null }, markets: { market_type: 'traditional' } },
          { market_id: 'market-c', listings: { vendor_profile_id: 'vp-1', status: 'published', deleted_at: null }, markets: { market_type: 'traditional' } },
        ],
        error: null,
      },
      { data: [], error: null }
    )

    const result = await canAddTraditionalMarket(supabase as never, 'vp-1', 'free')

    expect(result.allowed).toBe(false)
    expect(result.current).toBe(3)
    expect(result.limit).toBe(3)
    expect(result.message).toContain('Market limit reached')
    expect(result.message).toContain('3/3')
  })

  it('rejects with correct count when over limit', async () => {
    // Pro tier has limit 5
    const supabase = mockSupabase(
      {
        data: [
          { market_id: 'a', listings: { vendor_profile_id: 'vp-1', status: 'published', deleted_at: null }, markets: { market_type: 'traditional' } },
          { market_id: 'b', listings: { vendor_profile_id: 'vp-1', status: 'published', deleted_at: null }, markets: { market_type: 'traditional' } },
          { market_id: 'c', listings: { vendor_profile_id: 'vp-1', status: 'published', deleted_at: null }, markets: { market_type: 'traditional' } },
          { market_id: 'd', listings: { vendor_profile_id: 'vp-1', status: 'published', deleted_at: null }, markets: { market_type: 'traditional' } },
          { market_id: 'e', listings: { vendor_profile_id: 'vp-1', status: 'published', deleted_at: null }, markets: { market_type: 'traditional' } },
        ],
        error: null,
      },
      { data: [], error: null }
    )

    const result = await canAddTraditionalMarket(supabase as never, 'vp-1', 'pro')

    expect(result.allowed).toBe(false)
    expect(result.current).toBe(5)
    expect(result.limit).toBe(5)
  })

  it('boss tier allows 7 markets (under the 8-market limit)', async () => {
    const supabase = mockSupabase(
      {
        data: Array.from({ length: 7 }, (_, i) => ({
          market_id: `m-${i}`,
          listings: { vendor_profile_id: 'vp-1', status: 'published', deleted_at: null },
          markets: { market_type: 'traditional' },
        })),
        error: null,
      },
      { data: [], error: null }
    )

    const result = await canAddTraditionalMarket(supabase as never, 'vp-1', 'boss')

    expect(result.allowed).toBe(true)
    expect(result.current).toBe(7)
    expect(result.limit).toBe(8)
  })
})
