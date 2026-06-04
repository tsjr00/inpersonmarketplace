import type { SupabaseClient, User } from '@supabase/supabase-js'

/**
 * Returns true if the given user is the assigned manager of the given market
 * AND the market's manager_status is 'active'.
 *
 * Suspended managers return false here (treated the same as non-managers
 * at the API layer) — UX redirects for suspended state live on the layout
 * guard via getMarketManagerState().
 *
 * Dual-key match:
 *   - markets.manager_user_id === user.id, OR
 *   - LOWER(markets.manager_email) === LOWER(user.email)
 *
 * The OR branch matters because admin can assign a market manager by email
 * BEFORE the user has signed up. Once they do sign up, a backfill flow
 * sets manager_user_id on first authenticated dashboard load.
 *
 * Use cases:
 *   - API route auth (vendor list, transactions, booth assignment, etc.)
 *   - Boolean checks where rich state is not needed
 *
 * Returns false if no user, no email, market not found, manager_status is
 * not 'active', or no match.
 */
export async function isMarketManager(
  supabase: SupabaseClient,
  marketId: string,
  user: Pick<User, 'id' | 'email'> | null
): Promise<boolean> {
  const state = await getMarketManagerState(supabase, marketId, user)
  return state.state === 'active'
}

/**
 * Rich state for server-side route guards on /[vertical]/market-manager/[marketId]/*.
 *
 * States:
 *   - 'active'    — user is the current manager and access is enabled. Proceed.
 *   - 'suspended' — user is the current manager but markets.manager_status is
 *                   'suspended'. Redirect to /access-suspended.
 *   - 'removed'   — user was a manager at some point (has rows in
 *                   market_manager_history) but is not the current one. Redirect
 *                   to /access-removed with optional reason context.
 *   - 'none'      — user has no relationship to this market (random user
 *                   navigating to a dashboard URL). Treat the same as 'removed'
 *                   for UX but without the history-aware messaging.
 */
export type MarketManagerState =
  | { state: 'active'; marketName: string | null }
  | { state: 'suspended'; marketName: string | null }
  | {
      state: 'removed'
      marketName: string | null
      endedAt: string | null
      endReason: string | null
    }
  | { state: 'none'; marketName: string | null }

export async function getMarketManagerState(
  supabase: SupabaseClient,
  marketId: string,
  user: Pick<User, 'id' | 'email'> | null
): Promise<MarketManagerState> {
  if (!user || !marketId) {
    return { state: 'none', marketName: null }
  }

  const { data: market } = await supabase
    .from('markets')
    .select('name, manager_user_id, manager_email, manager_status')
    .eq('id', marketId)
    .maybeSingle()

  if (!market) {
    return { state: 'none', marketName: null }
  }

  const marketName = (market.name as string | null) ?? null
  const managerUserId = market.manager_user_id as string | null
  const managerEmail = market.manager_email as string | null
  const managerStatus = (market.manager_status as string | null) ?? 'active'

  const isCurrentManager =
    (managerUserId !== null && managerUserId === user.id) ||
    (managerEmail !== null &&
      user.email !== undefined &&
      user.email !== null &&
      managerEmail.toLowerCase() === user.email.toLowerCase())

  if (isCurrentManager) {
    if (managerStatus === 'suspended') {
      return { state: 'suspended', marketName }
    }
    return { state: 'active', marketName }
  }

  // Not the current manager — check history to distinguish 'removed' from 'none'.
  const { data: historyRow } = await supabase
    .from('market_manager_history')
    .select('ended_at, end_reason')
    .eq('market_id', marketId)
    .eq('manager_user_id', user.id)
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (historyRow) {
    return {
      state: 'removed',
      marketName,
      endedAt: (historyRow.ended_at as string | null) ?? null,
      endReason: (historyRow.end_reason as string | null) ?? null,
    }
  }

  return { state: 'none', marketName }
}
