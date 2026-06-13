import { createServiceClient } from '@/lib/supabase/server'

/**
 * Per-market breakdown of the buyer-visibility gate for the manager
 * dashboard (Session 92 Phase A1).
 *
 * The public markets list hides a traditional market until at least one
 * vendor satisfies BOTH halves of the visibility rule at that market
 * (mirror of getFullyOnboardedMarketIds in visible-markets.ts):
 *   (a) a published, non-deleted listing connected via listing_markets
 *   (b) an active vendor_market_schedules row
 *
 * This helper computes the per-vendor breakdown so the MarketVisibilityCard
 * can tell the manager exactly what's missing instead of leaving them
 * wondering why their market doesn't appear to buyers.
 *
 * RLS: uses the service client (vendor_market_schedules is deny-by-default
 * for non-owners). Auth is enforced UPSTREAM — the dashboard page calls
 * isMarketManager() before this runs. Same pattern as
 * manager-dashboard-stats.ts.
 *
 * Events are exempt from the gate — callers should only invoke this for
 * market_type='traditional'.
 */
export interface MarketVisibilityStatus {
  /** True when ≥1 vendor satisfies BOTH halves of the rule. */
  isVisible: boolean
  /** Distinct vendors with a published listing at this market. */
  vendorsWithListings: number
  /** Distinct vendors with an active attendance schedule at this market. */
  vendorsWithSchedules: number
  /** Distinct vendors satisfying both — the count that makes the market visible. */
  vendorsWithBoth: number
}

export async function getMarketVisibilityStatus(
  marketId: string
): Promise<MarketVisibilityStatus> {
  const serviceClient = createServiceClient()

  const [linkRes, vmsRes] = await Promise.all([
    serviceClient
      .from('listing_markets')
      .select('market_id, listings!inner(vendor_profile_id, status, deleted_at)')
      .eq('market_id', marketId)
      .eq('listings.status', 'published')
      .is('listings.deleted_at', null),
    serviceClient
      .from('vendor_market_schedules')
      .select('vendor_profile_id')
      .eq('market_id', marketId)
      .eq('is_active', true),
  ])

  const listingVendors = new Set<string>()
  for (const row of linkRes.data ?? []) {
    const l = Array.isArray(row.listings) ? row.listings[0] : row.listings
    const vpid = (l as { vendor_profile_id?: string } | null)?.vendor_profile_id
    if (vpid) listingVendors.add(vpid)
  }

  const scheduleVendors = new Set<string>(
    (vmsRes.data ?? []).map((r) => r.vendor_profile_id as string)
  )

  let vendorsWithBoth = 0
  for (const vpid of listingVendors) {
    if (scheduleVendors.has(vpid)) vendorsWithBoth++
  }

  return {
    isVisible: vendorsWithBoth > 0,
    vendorsWithListings: listingVendors.size,
    vendorsWithSchedules: scheduleVendors.size,
    vendorsWithBoth,
  }
}
