import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Returns the subset of marketIds where at least one vendor satisfies the
 * full visibility rule (mirror of migration 131's pickup-availability rule):
 *   (a) vendor has a published, non-deleted listing connected via listing_markets
 *   (b) same vendor has an active vendor_market_schedules row at the market
 *
 * Both conditions must be true for the SAME vendor at the SAME market. Used
 * to hide traditional markets from the public list when no vendor has
 * completed the schedule + listing onboarding for the market.
 *
 * Events are NOT subject to this rule — events use a different vendor model
 * (event_vendor_listings, no vms). Callers should only pass traditional
 * market_ids to this helper.
 *
 * App-layer implementation (no DB view change). Two queries + in-memory
 * intersection on (market_id, vendor_profile_id) pairs.
 */
export async function getFullyOnboardedMarketIds(
  supabase: SupabaseClient,
  marketIds: string[]
): Promise<Set<string>> {
  if (marketIds.length === 0) return new Set()

  // (market_id, vendor_profile_id) pairs with a published listing at the market
  const { data: linkRows, error: linkErr } = await supabase
    .from('listing_markets')
    .select('market_id, listings!inner(vendor_profile_id, status, deleted_at)')
    .in('market_id', marketIds)
    .eq('listings.status', 'published')
    .is('listings.deleted_at', null)

  if (linkErr) {
    console.error('[getFullyOnboardedMarketIds] listings query error:', linkErr)
    return new Set()
  }

  const listingPairs = new Set<string>()
  for (const row of linkRows ?? []) {
    const l = Array.isArray(row.listings) ? row.listings[0] : row.listings
    const vpid = (l as { vendor_profile_id?: string } | null)?.vendor_profile_id
    if (vpid) listingPairs.add(`${row.market_id}|${vpid}`)
  }

  if (listingPairs.size === 0) return new Set()

  // (market_id, vendor_profile_id) pairs with an active attendance row at the market
  const { data: vmsRows, error: vmsErr } = await supabase
    .from('vendor_market_schedules')
    .select('market_id, vendor_profile_id')
    .in('market_id', marketIds)
    .eq('is_active', true)

  if (vmsErr) {
    console.error('[getFullyOnboardedMarketIds] vms query error:', vmsErr)
    return new Set()
  }

  const validMarketIds = new Set<string>()
  for (const row of vmsRows ?? []) {
    if (listingPairs.has(`${row.market_id}|${row.vendor_profile_id}`)) {
      validMarketIds.add(row.market_id as string)
    }
  }

  return validMarketIds
}
