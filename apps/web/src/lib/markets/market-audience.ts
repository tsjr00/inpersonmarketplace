import { createServiceClient } from '@/lib/supabase/server'

/**
 * Resolve the set of user IDs to notify for a market, by audience tier
 * (Session 92 Phase B). Built generic so future tiers (premium buyers,
 * nearby buyers, VIP-tagged) slot in as additional cases — only
 * 'followers' is wired today.
 *
 * Service client: market_favorites is own-row RLS, so reading another
 * user's follow rows requires the service client. Callers are trusted
 * server contexts (the cron) — no per-user auth here.
 */
export type MarketAudienceTier = 'followers' | 'premium' | 'nearby'

export async function resolveMarketAudience(
  marketId: string,
  tiers: MarketAudienceTier[]
): Promise<Set<string>> {
  const serviceClient = createServiceClient()
  const userIds = new Set<string>()

  for (const tier of tiers) {
    switch (tier) {
      case 'followers': {
        const { data } = await serviceClient
          .from('market_favorites')
          .select('user_id')
          .eq('market_id', marketId)
        for (const row of data ?? []) {
          if (row.user_id) userIds.add(row.user_id as string)
        }
        break
      }
      // 'premium' and 'nearby' intentionally unimplemented — the staged
      // notification cascade (premium-first) from the flash-sales plan
      // would slot in here. Wired when those features land.
      case 'premium':
      case 'nearby':
        break
    }
  }

  return userIds
}
