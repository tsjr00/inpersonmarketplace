import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Vendor Tier Limits - Centralized limit definitions and enforcement
 *
 * Unified tiers (both verticals): free → pro ($25/mo) → boss ($50/mo)
 *
 * Legacy tier names (basic, standard, premium, featured) map to free in code.
 * Existing DB values are preserved for backward compat until migrated.
 *
 * Note: Product listings are counted per-account (total), not per-market.
 * A listing at multiple markets counts as 1 listing.
 */

export type VendorTier = 'free' | 'pro' | 'boss'

/**
 * Trial system feature flag.
 * When false: new vendor approvals do NOT grant a trial period.
 * Cron phases 10a/10b/10c skip trial processing.
 * Existing trial UI/notifications/schema are preserved but dormant.
 * Set to true to re-enable the 90-day free trial on vendor approval.
 */
export const TRIAL_SYSTEM_ENABLED = false

// Legacy tier names that map to free
const LEGACY_FREE_TIERS = ['basic', 'standard', 'premium', 'featured']

/** Normalize any tier name to the unified Free/Pro/Boss system */
export function normalizeTier(tier: string | null | undefined): VendorTier {
  const t = (tier || 'free').toLowerCase()
  if (t === 'pro') return 'pro'
  if (t === 'boss') return 'boss'
  return 'free' // free, basic, standard, premium, featured, unknown → all free
}

// ── Unified Tier Limits (both verticals) ─────────────────────────────

export interface TierLimits {
  traditionalMarkets: number
  privatePickupLocations: number
  pickupWindowsPerLocation: number
  marketBoxes: number           // No separate total/active split — vendors can activate all
  maxSubscribersPerOffering: number
  defaultSubscribersPerOffering: number
  productListings: number
  analyticsDays: number
  analyticsExport: boolean
  priorityPlacement: number     // 0=none, 1=2nd priority, 2=1st priority
  notificationChannels: readonly string[]
  locationInsights: 'basic' | 'pro' | 'boss'
}

export const TIER_LIMITS: Record<VendorTier, TierLimits> = {
  free: {
    productListings: 20,
    traditionalMarkets: 3,
    privatePickupLocations: 3,
    pickupWindowsPerLocation: 7,
    marketBoxes: 3,
    maxSubscribersPerOffering: 10,
    defaultSubscribersPerOffering: 10,
    analyticsDays: 30,
    analyticsExport: false,
    priorityPlacement: 0,
    notificationChannels: ['in_app', 'email'],
    locationInsights: 'basic',
  },
  pro: {
    productListings: 50,
    traditionalMarkets: 5,
    privatePickupLocations: 5,
    pickupWindowsPerLocation: 14,
    marketBoxes: 6,
    maxSubscribersPerOffering: 20,
    defaultSubscribersPerOffering: 20,
    analyticsDays: 60,
    analyticsExport: false,
    priorityPlacement: 1,
    notificationChannels: ['in_app', 'email', 'push'],
    locationInsights: 'pro',
  },
  boss: {
    productListings: 100,
    traditionalMarkets: 8,
    privatePickupLocations: 15,
    pickupWindowsPerLocation: 21,
    marketBoxes: 10,
    maxSubscribersPerOffering: 50,
    defaultSubscribersPerOffering: 50,
    analyticsDays: 90,
    analyticsExport: true,
    priorityPlacement: 2,
    notificationChannels: ['in_app', 'email', 'push', 'sms'],
    locationInsights: 'boss',
  },
} as const

// ── Tier Helpers ─────────────────────────────────────────────────────

/** @deprecated Use normalizeTier() instead */
export type FoodTruckTier = VendorTier

/** @deprecated Use normalizeTier() instead */
export function isFoodTruckTier(tier: string): boolean {
  return ['free', 'basic', 'pro', 'boss'].includes(tier?.toLowerCase())
}

/** Get display label for a tier */
export function getVendorTierLabel(tier: string, _vertical?: string): string {
  const normalized = normalizeTier(tier)
  const labels: Record<VendorTier, string> = { free: 'Free', pro: 'Pro', boss: 'Boss' }
  return labels[normalized]
}

/** @deprecated Use getVendorTierLabel */
export function getFtTierLabel(tier: string): string {
  return getVendorTierLabel(tier)
}

/** Get the extras for a tier (analytics, priority, notifications) */
export function getFtTierExtras(tier: string) {
  return getTierLimits(tier)
}

/** Get notification channels allowed for a vendor tier */
export function getTierNotificationChannels(tier: string, _vertical?: string): readonly string[] {
  return getTierLimits(tier).notificationChannels
}

/** Get analytics limits for any vendor tier */
export function getAnalyticsLimits(tier: string, _vertical?: string): { analyticsDays: number; analyticsExport: boolean } {
  const limits = getTierLimits(tier)
  return { analyticsDays: limits.analyticsDays, analyticsExport: limits.analyticsExport }
}

/**
 * Sort priority for browse page — lower number = shown first.
 */
export function getTierSortPriority(tier: string | undefined, _vertical?: string): number {
  const normalized = normalizeTier(tier)
  if (normalized === 'boss') return 0
  if (normalized === 'pro') return 1
  return 2 // free
}

/**
 * Get subscriber limits for a tier.
 */
export function getSubscriberDefault(tier: string, _vertical?: string): number {
  return getTierLimits(tier).defaultSubscribersPerOffering
}

export function getTierLimits(tier: string, _vertical?: string): TierLimits {
  const normalized = normalizeTier(tier)
  return TIER_LIMITS[normalized]
}

export function isPremiumTier(tier: string, _vertical?: string): boolean {
  const normalized = normalizeTier(tier)
  return normalized === 'pro' || normalized === 'boss'
}

// ============================================================================
// USAGE COUNT FUNCTIONS
// All functions use vendorProfileId (the vendor_profiles.id field)
// ============================================================================

/**
 * Get count of unique traditional markets where vendor has published listings
 * (via listing_markets junction table) or active market boxes.
 *
 * Prior implementation queried `listings.market_id` which does not exist in
 * the schema — it silently returned 0 for all vendors, making the entire
 * traditional market cap unenforced. Fixed in Session 70.
 */
export async function getTraditionalMarketUsage(
  supabase: SupabaseClient,
  vendorProfileId: string
): Promise<{ count: number; marketIds: string[] }> {
  const { data: listingMarketRows } = await supabase
    .from('listing_markets')
    .select(`
      market_id,
      listings!inner(vendor_profile_id, status, deleted_at),
      markets!inner(market_type)
    `)
    .eq('listings.vendor_profile_id', vendorProfileId)
    .eq('listings.status', 'published')
    .is('listings.deleted_at', null)
    .eq('markets.market_type', 'traditional')

  const { data: boxMarkets } = await supabase
    .from('market_box_offerings')
    .select('pickup_market_id, markets!inner(market_type)')
    .eq('vendor_profile_id', vendorProfileId)
    .eq('active', true)

  const marketIds = new Set<string>()

  if (listingMarketRows) {
    for (const row of listingMarketRows) {
      if (row.market_id) {
        marketIds.add(row.market_id as string)
      }
    }
  }

  if (boxMarkets) {
    for (const box of boxMarkets) {
      const market = box.markets as unknown as { market_type: string } | null
      if (box.pickup_market_id && market && market.market_type === 'traditional') {
        marketIds.add(box.pickup_market_id)
      }
    }
  }

  return { count: marketIds.size, marketIds: Array.from(marketIds) }
}

/**
 * Exclude a specific listing's market contribution from the usage set.
 * Used when editing a listing — we want to know the vendor's traditional
 * market count ignoring the listing currently being saved, so the save
 * check uses the "after" state.
 */
export async function getTraditionalMarketUsageExcludingListing(
  supabase: SupabaseClient,
  vendorProfileId: string,
  excludeListingId: string
): Promise<{ count: number; marketIds: string[] }> {
  const { data: listingMarketRows } = await supabase
    .from('listing_markets')
    .select(`
      market_id,
      listings!inner(vendor_profile_id, status, deleted_at),
      markets!inner(market_type)
    `)
    .eq('listings.vendor_profile_id', vendorProfileId)
    .eq('listings.status', 'published')
    .is('listings.deleted_at', null)
    .eq('markets.market_type', 'traditional')
    .neq('listing_id', excludeListingId)

  const { data: boxMarkets } = await supabase
    .from('market_box_offerings')
    .select('pickup_market_id, markets!inner(market_type)')
    .eq('vendor_profile_id', vendorProfileId)
    .eq('active', true)

  const marketIds = new Set<string>()

  if (listingMarketRows) {
    for (const row of listingMarketRows) {
      if (row.market_id) {
        marketIds.add(row.market_id as string)
      }
    }
  }

  if (boxMarkets) {
    for (const box of boxMarkets) {
      const market = box.markets as unknown as { market_type: string } | null
      if (box.pickup_market_id && market && market.market_type === 'traditional') {
        marketIds.add(box.pickup_market_id)
      }
    }
  }

  return { count: marketIds.size, marketIds: Array.from(marketIds) }
}

/**
 * Get count of private pickup locations owned by vendor
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

  if (error || !markets) return { count: 0, marketIds: [] }

  return { count: markets.length, marketIds: markets.map(m => m.id) }
}

/**
 * Get count of market boxes
 */
export async function getMarketBoxUsage(
  supabase: SupabaseClient,
  vendorProfileId: string
): Promise<{ total: number; active: number }> {
  const { data: boxes, error } = await supabase
    .from('market_box_offerings')
    .select('id, active')
    .eq('vendor_profile_id', vendorProfileId)

  if (error || !boxes) return { total: 0, active: 0 }

  return { total: boxes.length, active: boxes.filter(b => b.active).length }
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
    .eq('status', 'published')

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

export async function canAddTraditionalMarket(
  supabase: SupabaseClient,
  vendorProfileId: string,
  tier: string,
  _vertical?: string
): Promise<LimitCheckResult> {
  const limits = getTierLimits(tier)
  const usage = await getTraditionalMarketUsage(supabase, vendorProfileId)
  const allowed = usage.count < limits.traditionalMarkets
  return {
    allowed,
    current: usage.count,
    limit: limits.traditionalMarkets,
    message: allowed ? undefined : `Market limit reached (${usage.count}/${limits.traditionalMarkets}).`,
    upgradeMessage: allowed ? undefined : 'Upgrade your plan to join more traditional markets.',
  }
}

export async function canAddPrivatePickup(
  supabase: SupabaseClient,
  vendorProfileId: string,
  tier: string,
  _vertical?: string
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

export async function canCreateMarketBox(
  supabase: SupabaseClient,
  vendorProfileId: string,
  tier: string,
  _vertical?: string
): Promise<LimitCheckResult> {
  const limits = getTierLimits(tier)
  const usage = await getMarketBoxUsage(supabase, vendorProfileId)
  const allowed = usage.total < limits.marketBoxes
  return {
    allowed,
    current: usage.total,
    limit: limits.marketBoxes,
    message: allowed ? undefined : `Limit reached: ${usage.total} of ${limits.marketBoxes} boxes maximum.`,
    upgradeMessage: allowed ? undefined : 'Upgrade to create more boxes.',
  }
}

/**
 * Check if vendor can activate another market box.
 * With unified tiers, there's no separate active limit — same as total.
 */
export async function canActivateMarketBox(
  supabase: SupabaseClient,
  vendorProfileId: string,
  tier: string,
  _excludeBoxId?: string,
  _vertical?: string
): Promise<LimitCheckResult> {
  // No separate active limit — vendors can activate all their boxes
  return canCreateMarketBox(supabase, vendorProfileId, tier)
}

export async function canCreateListing(
  supabase: SupabaseClient,
  vendorProfileId: string,
  tier: string,
  _vertical?: string
): Promise<LimitCheckResult> {
  const limits = getTierLimits(tier)
  const usage = await getListingUsage(supabase, vendorProfileId)
  const allowed = usage.count < limits.productListings
  return {
    allowed,
    current: usage.count,
    limit: limits.productListings,
    message: allowed ? undefined : `Limit reached: ${usage.count} of ${limits.productListings} listings used.`,
    upgradeMessage: allowed ? undefined : `Upgrade to get more listings.`,
  }
}

// ============================================================================
// HOME MARKET FUNCTIONS
// ============================================================================

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

export async function setHomeMarket(
  supabase: SupabaseClient,
  vendorProfileId: string,
  marketId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('vendor_profiles')
    .update({ home_market_id: marketId })
    .eq('id', vendorProfileId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function canChangeHomeMarket(
  supabase: SupabaseClient,
  vendorProfileId: string,
  currentHomeMarketId: string | null
): Promise<{ allowed: boolean; reason?: string }> {
  if (!currentHomeMarketId) return { allowed: true }

  const { count: listingCount } = await supabase
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfileId)
    .eq('market_id', currentHomeMarketId)
    .eq('status', 'published')

  if (listingCount && listingCount > 0) {
    return {
      allowed: false,
      reason: `Cannot change home location: ${listingCount} published listing(s) at current home location. Unpublish or move them first.`,
    }
  }

  const { count: boxCount } = await supabase
    .from('market_box_offerings')
    .select('*', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfileId)
    .eq('pickup_market_id', currentHomeMarketId)
    .eq('active', true)

  if (boxCount && boxCount > 0) {
    return {
      allowed: false,
      reason: `Cannot change home location: ${boxCount} active box(es) at current home location. Deactivate them first.`,
    }
  }

  return { allowed: true }
}

export async function isHomeMarket(
  supabase: SupabaseClient,
  vendorProfileId: string,
  marketId: string
): Promise<boolean> {
  const homeMarketId = await getHomeMarket(supabase, vendorProfileId)
  return homeMarketId === marketId
}

// NOTE: canUseTraditionalMarket was removed in Session 70. It implemented
// the legacy "non-premium vendors can only use their home market" rule
// which conflicts with the current TIER_LIMITS (free=3, pro=5, boss=8
// traditional markets). It was also dead code — never called anywhere.
// Use canAddTraditionalMarket() to enforce the modern per-tier cap.

// ============================================================================
// COMPREHENSIVE USAGE SUMMARY
// ============================================================================

export interface VendorUsageSummary {
  tier: string
  limits: TierLimits
  usage: {
    traditionalMarkets: { current: number; limit: number; marketIds: string[] }
    privatePickups: { current: number; limit: number; marketIds: string[] }
    marketBoxes: { current: number; limit: number }
    listings: { current: number; limit: number }
  }
  homeMarketId: string | null
}

export async function getVendorUsageSummary(
  supabase: SupabaseClient,
  vendorProfileId: string,
  tier: string,
  _vertical?: string
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
      marketBoxes: {
        current: marketBoxes.total,
        limit: limits.marketBoxes,
      },
      listings: {
        current: listings.count,
        limit: limits.productListings,
      },
    },
    homeMarketId,
  }
}

export function formatLimitError(result: LimitCheckResult): string {
  if (result.allowed) return ''
  let message = result.message || 'Limit reached.'
  if (result.upgradeMessage) message += ` ${result.upgradeMessage}`
  return message
}

// Legacy exports for backward compatibility
/** @deprecated Use FtTierExtras type from TierLimits */
export type FtTierExtras = TierLimits
