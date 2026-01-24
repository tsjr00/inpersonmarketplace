import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Fetch vendor counts for markets from the market_vendor_counts view.
 * This counts distinct vendors with published listings at each market.
 *
 * @param supabase - Supabase client instance
 * @param marketIds - Optional array of market IDs to filter (fetches all if not provided)
 * @returns Map of market_id to vendor_count
 */
export async function getMarketVendorCounts(
  supabase: SupabaseClient,
  marketIds?: string[]
): Promise<Map<string, number>> {
  let query = supabase
    .from('market_vendor_counts')
    .select('market_id, vendor_count')

  if (marketIds && marketIds.length > 0) {
    query = query.in('market_id', marketIds)
  }

  const { data, error } = await query

  if (error) {
    console.error('[getMarketVendorCounts] Error:', error)
    return new Map()
  }

  const countMap = new Map<string, number>()
  data?.forEach((row: { market_id: string; vendor_count: number }) => {
    countMap.set(row.market_id, row.vendor_count)
  })

  return countMap
}

/**
 * Merge vendor counts into an array of market objects.
 * Updates the vendor_count property on each market.
 *
 * @param markets - Array of market objects with id property
 * @param vendorCounts - Map from getMarketVendorCounts
 * @returns Markets array with updated vendor_count values
 */
export function mergeVendorCounts<T extends { id: string; vendor_count?: number }>(
  markets: T[],
  vendorCounts: Map<string, number>
): T[] {
  return markets.map(market => ({
    ...market,
    vendor_count: vendorCounts.get(market.id) || 0
  }))
}
