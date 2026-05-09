import type { SupabaseClient, User } from '@supabase/supabase-js'

export interface ManagedMarket {
  id: string
  name: string
  city: string | null
  state: string | null
  vertical_id: string
}

/**
 * Returns the markets where the given user is the assigned manager.
 *
 * Used by the buyer dashboard MarketManagerCard. If the result is empty,
 * the card renders nothing (the user isn't a manager of any market).
 *
 * Filter scope: `vertical_id = 'farmers_market'` for v1 (FT park-operator
 * persona is deferred per market_manager_v2_plan.md).
 *
 * Dual-key match (OR): manager_user_id === user.id OR LOWER(manager_email)
 * === LOWER(user.email). See manager-auth.ts for why the email branch
 * exists.
 *
 * The query targets the two partial indexes added in migration 133
 * (idx_markets_manager_email + idx_markets_manager_user_id) so it stays
 * cheap even as the markets table grows.
 */
export async function getMarketsManagedBy(
  supabase: SupabaseClient,
  user: Pick<User, 'id' | 'email'> | null
): Promise<ManagedMarket[]> {
  if (!user) return []

  // Two queries: id-match and email-match. Combined client-side because
  // PostgREST's `or` filter on lowercased columns is awkward and the partial
  // indexes already make each individual lookup near-zero cost.

  const idMatchPromise = supabase
    .from('markets')
    .select('id, name, city, state, vertical_id')
    .eq('manager_user_id', user.id)
    .eq('vertical_id', 'farmers_market')

  const emailMatchPromise = user.email
    ? supabase
        .from('markets')
        .select('id, name, city, state, vertical_id')
        .ilike('manager_email', user.email)
        .eq('vertical_id', 'farmers_market')
    : Promise.resolve({ data: [], error: null })

  const [idResult, emailResult] = await Promise.all([idMatchPromise, emailMatchPromise])

  const all = [...((idResult.data || []) as ManagedMarket[]), ...((emailResult.data || []) as ManagedMarket[])]

  // Dedup by id (a market may match both branches if user_id + email both populated)
  const seen = new Set<string>()
  const deduped: ManagedMarket[] = []
  for (const m of all) {
    if (!seen.has(m.id)) {
      seen.add(m.id)
      deduped.push(m)
    }
  }
  return deduped
}
