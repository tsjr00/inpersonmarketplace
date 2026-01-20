import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Vendor Tier Limits - Centralized limit definitions and enforcement
 *
 * Standard Vendors:
 * - Traditional markets: 1 (home market)
 * - Private pickup locations: 1
 * - Pickup windows per location: 2
 * - Total Market Boxes: 2 (active + inactive)
 * - Active Market Boxes: 1
 * - Product listings: 5
 *
 * Premium Vendors:
 * - Traditional markets: 4
 * - Private pickup locations: 5
 * - Pickup windows per location: 6
 * - Total Market Boxes: 6 (active + inactive)
 * - Active Market Boxes: 4
 * - Product listings: 10
 */

export type VendorTier = 'standard' | 'premium' | 'featured'

export const TIER_LIMITS = {
  standard: {
    traditionalMarkets: 1,
    privatePickupLocations: 1,
    pickupWindowsPerLocation: 2,
    totalMarketBoxes: 2,
    activeMarketBoxes: 1,
    productListings: 5,
  },
  premium: {
    traditionalMarkets: 4,
    privatePickupLocations: 5,
    pickupWindowsPerLocation: 6,
    totalMarketBoxes: 6,
    activeMarketBoxes: 4,
    productListings: 10,
  },
  // Featured tier has same limits as premium
  featured: {
    traditionalMarkets: 4,
    privatePickupLocations: 5,
    pickupWindowsPerLocation: 6,
    totalMarketBoxes: 6,
    activeMarketBoxes: 4,
    productListings: 10,
  },
} as const

export function getTierLimits(tier: string) {
  const normalizedTier = (tier || 'standard').toLowerCase() as VendorTier
  return TIER_LIMITS[normalizedTier] || TIER_LIMITS.standard
}

export function isPremiumTier(tier: string): boolean {
  const normalizedTier = (tier || 'standard').toLowerCase()
  return normalizedTier === 'premium' || normalizedTier === 'featured'
}

// ============================================================================
// USAGE COUNT FUNCTIONS
// All functions use vendorProfileId (the vendor_profiles.id field)
// ============================================================================

/**
 * Get count of traditional markets where vendor has active listings or market boxes
 */
export async function getTraditionalMarketUsage(
  supabase: SupabaseClient,
  vendorProfileId: string
): Promise<{ count: number; marketIds: string[] }> {
  // Get markets from active listings
  const { data: listingMarkets } = await supabase
    .from('listings')
    .select('market_id')
    .eq('vendor_profile_id', vendorProfileId)
    .eq('status', 'active')
    .not('market_id', 'is', null)

  // Get markets from active market boxes
  const { data: boxMarkets } = await supabase
    .from('market_box_offerings')
    .select('pickup_market_id, markets!inner(market_type)')
    .eq('vendor_profile_id', vendorProfileId)
    .eq('active', true)

  // Combine and dedupe market IDs, filtering for traditional markets only
  const marketIds = new Set<string>()

  // Add listing markets (need to check if traditional)
  if (listingMarkets) {
    for (const listing of listingMarkets) {
      if (listing.market_id) {
        // Check if it's a traditional market
        const { data: market } = await supabase
          .from('markets')
          .select('market_type')
          .eq('id', listing.market_id)
          .single()

        if (market && market.market_type !== 'private_pickup') {
          marketIds.add(listing.market_id)
        }
      }
    }
  }

  // Add market box markets (already filtered for traditional in query)
  if (boxMarkets) {
    for (const box of boxMarkets) {
      // Supabase !inner join returns the related record directly
      const market = box.markets as unknown as { market_type: string } | null
      if (box.pickup_market_id && market && market.market_type !== 'private_pickup') {
        marketIds.add(box.pickup_market_id)
      }
    }
  }

  return {
    count: marketIds.size,
    marketIds: Array.from(marketIds),
  }
}

/**
 * Get count of private pickup locations owned by vendor
 * Note: Private pickups are in the markets table with vendor_id referencing vendor_profiles.id
 */
export async function getPrivatePickupUsage(
  supabase: SupabaseClient,
  vendorProfileId: string
): Promise<{ count: number; marketIds: string[] }> {
  const { data: markets, error } = await supabase
    .from('markets')
    .select('id')
    .eq('vendor_id', vendorProfileId)
    .eq('market_type', 'private_pickup')

  if (error || !markets) {
    return { count: 0, marketIds: [] }
  }

  return {
    count: markets.length,
    marketIds: markets.map(m => m.id),
  }
}

/**
 * Get count of market boxes (total and active)
 */
export async function getMarketBoxUsage(
  supabase: SupabaseClient,
  vendorProfileId: string
): Promise<{ total: number; active: number }> {
  const { data: boxes, error } = await supabase
    .from('market_box_offerings')
    .select('id, active')
    .eq('vendor_profile_id', vendorProfileId)

  if (error || !boxes) {
    return { total: 0, active: 0 }
  }

  return {
    total: boxes.length,
    active: boxes.filter(b => b.active).length,
  }
}

/**
 * Get count of active product listings
 */
export async function getListingUsage(
  supabase: SupabaseClient,
  vendorProfileId: string
): Promise<{ count: number }> {
  const { count, error } = await supabase
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfileId)
    .eq('status', 'active')

  return { count: error ? 0 : (count || 0) }
}

// ============================================================================
// LIMIT CHECK FUNCTIONS
// ============================================================================

export interface LimitCheckResult {
  allowed: boolean
  current: number
  limit: number
  message?: string
  upgradeMessage?: string
}

/**
 * Check if vendor can add another traditional market
 */
export async function canAddTraditionalMarket(
  supabase: SupabaseClient,
  vendorProfileId: string,
  tier: string
): Promise<LimitCheckResult> {
  const limits = getTierLimits(tier)
  const usage = await getTraditionalMarketUsage(supabase, vendorProfileId)

  const allowed = usage.count < limits.traditionalMarkets
  return {
    allowed,
    current: usage.count,
    limit: limits.traditionalMarkets,
    message: allowed ? undefined : `Limit reached: ${usage.count} of ${limits.traditionalMarkets} traditional markets used.`,
    upgradeMessage: allowed ? undefined : 'Upgrade to join multiple markets.',
  }
}

/**
 * Check if vendor can create another private pickup location
 */
export async function canAddPrivatePickup(
  supabase: SupabaseClient,
  vendorProfileId: string,
  tier: string
): Promise<LimitCheckResult> {
  const limits = getTierLimits(tier)
  const usage = await getPrivatePickupUsage(supabase, vendorProfileId)

  const allowed = usage.count < limits.privatePickupLocations
  return {
    allowed,
    current: usage.count,
    limit: limits.privatePickupLocations,
    message: allowed ? undefined : `Limit reached: ${usage.count} of ${limits.privatePickupLocations} private pickup locations used.`,
    upgradeMessage: allowed ? undefined : 'Upgrade to add more pickup locations.',
  }
}

/**
 * Check if vendor can create another market box
 */
export async function canCreateMarketBox(
  supabase: SupabaseClient,
  vendorProfileId: string,
  tier: string
): Promise<LimitCheckResult> {
  const limits = getTierLimits(tier)
  const usage = await getMarketBoxUsage(supabase, vendorProfileId)

  const allowed = usage.total < limits.totalMarketBoxes
  return {
    allowed,
    current: usage.total,
    limit: limits.totalMarketBoxes,
    message: allowed ? undefined : `Limit reached: ${usage.total} of ${limits.totalMarketBoxes} Market Boxes maximum.`,
    upgradeMessage: allowed ? undefined : 'Upgrade to create more boxes.',
  }
}

/**
 * Check if vendor can activate another market box
 * Note: excludeBoxId allows excluding the current box from the count (for reactivation checks)
 */
export async function canActivateMarketBox(
  supabase: SupabaseClient,
  vendorProfileId: string,
  tier: string,
  excludeBoxId?: string
): Promise<LimitCheckResult> {
  const limits = getTierLimits(tier)
  const usage = await getMarketBoxUsage(supabase, vendorProfileId)

  // If we're checking for reactivation, the box being reactivated is currently inactive
  // so the current count doesn't include it - we compare against the limit directly
  const currentActive = usage.active
  const allowed = currentActive < limits.activeMarketBoxes

  return {
    allowed,
    current: currentActive,
    limit: limits.activeMarketBoxes,
    message: allowed ? undefined : `Cannot activate: ${currentActive} of ${limits.activeMarketBoxes} active boxes limit reached.`,
    upgradeMessage: allowed ? undefined : 'Upgrade to run multiple boxes simultaneously.',
  }
}

/**
 * Check if vendor can create another listing
 */
export async function canCreateListing(
  supabase: SupabaseClient,
  vendorProfileId: string,
  tier: string
): Promise<LimitCheckResult> {
  const limits = getTierLimits(tier)
  const usage = await getListingUsage(supabase, vendorProfileId)

  const allowed = usage.count < limits.productListings
  return {
    allowed,
    current: usage.count,
    limit: limits.productListings,
    message: allowed ? undefined : `Limit reached: ${usage.count} of ${limits.productListings} listings used.`,
    upgradeMessage: allowed ? undefined : `Upgrade to get ${TIER_LIMITS.premium.productListings} listings.`,
  }
}

// ============================================================================
// HOME MARKET FUNCTIONS
// ============================================================================

/**
 * Get vendor's home market ID (for standard vendors)
 */
export async function getHomeMarket(
  supabase: SupabaseClient,
  vendorProfileId: string
): Promise<string | null> {
  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('home_market_id')
    .eq('id', vendorProfileId)
    .single()

  return vendor?.home_market_id || null
}

/**
 * Set vendor's home market (only if not already set or if allowed to change)
 */
export async function setHomeMarket(
  supabase: SupabaseClient,
  vendorProfileId: string,
  marketId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('vendor_profiles')
    .update({ home_market_id: marketId })
    .eq('id', vendorProfileId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Check if vendor can change their home market
 * (Only allowed if no active listings or market boxes at current home market)
 */
export async function canChangeHomeMarket(
  supabase: SupabaseClient,
  vendorProfileId: string,
  currentHomeMarketId: string | null
): Promise<{ allowed: boolean; reason?: string }> {
  if (!currentHomeMarketId) {
    return { allowed: true }
  }

  // Check for active listings at home market
  const { count: listingCount } = await supabase
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfileId)
    .eq('market_id', currentHomeMarketId)
    .eq('status', 'active')

  if (listingCount && listingCount > 0) {
    return {
      allowed: false,
      reason: `Cannot change home market: ${listingCount} active listing(s) at current home market. Deactivate or move them first.`,
    }
  }

  // Check for active market boxes at home market
  const { count: boxCount } = await supabase
    .from('market_box_offerings')
    .select('*', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfileId)
    .eq('pickup_market_id', currentHomeMarketId)
    .eq('active', true)

  if (boxCount && boxCount > 0) {
    return {
      allowed: false,
      reason: `Cannot change home market: ${boxCount} active Market Box(es) at current home market. Deactivate them first.`,
    }
  }

  return { allowed: true }
}

/**
 * Check if a market is the vendor's home market
 */
export async function isHomeMarket(
  supabase: SupabaseClient,
  vendorProfileId: string,
  marketId: string
): Promise<boolean> {
  const homeMarketId = await getHomeMarket(supabase, vendorProfileId)
  return homeMarketId === marketId
}

/**
 * For standard vendors, check if they can use a specific traditional market
 * (must be their home market, or they must not have a home market yet)
 */
export async function canUseTraditionalMarket(
  supabase: SupabaseClient,
  vendorProfileId: string,
  marketId: string,
  tier: string
): Promise<{ allowed: boolean; reason?: string; isHomeMarket: boolean; shouldSetAsHome: boolean }> {
  // Premium vendors can use any market (up to their limit)
  if (isPremiumTier(tier)) {
    return { allowed: true, isHomeMarket: false, shouldSetAsHome: false }
  }

  // Standard vendors must use their home market
  const homeMarketId = await getHomeMarket(supabase, vendorProfileId)

  // If no home market set, this will become the home market
  if (!homeMarketId) {
    return { allowed: true, isHomeMarket: true, shouldSetAsHome: true }
  }

  // If already have a home market, can only use that one
  if (homeMarketId === marketId) {
    return { allowed: true, isHomeMarket: true, shouldSetAsHome: false }
  }

  return {
    allowed: false,
    reason: 'Standard vendors can only use their home market. Upgrade to join multiple markets.',
    isHomeMarket: false,
    shouldSetAsHome: false,
  }
}

// ============================================================================
// COMPREHENSIVE USAGE SUMMARY
// ============================================================================

// Type for tier limits (allows any tier's values, not just standard)
export type TierLimits = {
  traditionalMarkets: number
  privatePickupLocations: number
  pickupWindowsPerLocation: number
  totalMarketBoxes: number
  activeMarketBoxes: number
  productListings: number
}

export interface VendorUsageSummary {
  tier: string
  limits: TierLimits
  usage: {
    traditionalMarkets: { current: number; limit: number; marketIds: string[] }
    privatePickups: { current: number; limit: number; marketIds: string[] }
    totalMarketBoxes: { current: number; limit: number }
    activeMarketBoxes: { current: number; limit: number }
    listings: { current: number; limit: number }
  }
  homeMarketId: string | null
}

/**
 * Get comprehensive usage summary for a vendor
 */
export async function getVendorUsageSummary(
  supabase: SupabaseClient,
  vendorProfileId: string,
  tier: string
): Promise<VendorUsageSummary> {
  const limits = getTierLimits(tier)

  const [traditionalMarkets, privatePickups, marketBoxes, listings, homeMarketId] = await Promise.all([
    getTraditionalMarketUsage(supabase, vendorProfileId),
    getPrivatePickupUsage(supabase, vendorProfileId),
    getMarketBoxUsage(supabase, vendorProfileId),
    getListingUsage(supabase, vendorProfileId),
    getHomeMarket(supabase, vendorProfileId),
  ])

  return {
    tier,
    limits,
    usage: {
      traditionalMarkets: {
        current: traditionalMarkets.count,
        limit: limits.traditionalMarkets,
        marketIds: traditionalMarkets.marketIds,
      },
      privatePickups: {
        current: privatePickups.count,
        limit: limits.privatePickupLocations,
        marketIds: privatePickups.marketIds,
      },
      totalMarketBoxes: {
        current: marketBoxes.total,
        limit: limits.totalMarketBoxes,
      },
      activeMarketBoxes: {
        current: marketBoxes.active,
        limit: limits.activeMarketBoxes,
      },
      listings: {
        current: listings.count,
        limit: limits.productListings,
      },
    },
    homeMarketId,
  }
}

/**
 * Format a limit check result into a user-friendly error message with upgrade prompt
 */
export function formatLimitError(result: LimitCheckResult): string {
  if (result.allowed) return ''

  let message = result.message || 'Limit reached.'
  if (result.upgradeMessage) {
    message += ` ${result.upgradeMessage}`
  }
  return message
}
