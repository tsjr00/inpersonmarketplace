import type { SupabaseClient, User } from '@supabase/supabase-js'

/**
 * Returns true if the given user is the assigned manager of the given market.
 *
 * Dual-key match:
 *   - markets.manager_user_id === user.id, OR
 *   - LOWER(markets.manager_email) === LOWER(user.email)
 *
 * The OR branch matters because admin can assign a market manager by email
 * BEFORE the user has signed up. Once they do sign up, a backfill flow
 * (separate phase) sets manager_user_id on first authenticated dashboard
 * load. Until then, email-match keeps the manager authenticated.
 *
 * Use cases:
 *   - Dashboard route auth guard at /[vertical]/market-manager/[marketId]/dashboard
 *   - Future API route auth (vendor list, transactions, booth assignment, etc.)
 *
 * Returns false if no user, no email, market not found, or no match.
 */
export async function isMarketManager(
  supabase: SupabaseClient,
  marketId: string,
  user: Pick<User, 'id' | 'email'> | null
): Promise<boolean> {
  if (!user || !marketId) return false

  const { data: market } = await supabase
    .from('markets')
    .select('manager_user_id, manager_email')
    .eq('id', marketId)
    .maybeSingle()

  if (!market) return false

  const managerUserId = market.manager_user_id as string | null
  const managerEmail = market.manager_email as string | null

  if (managerUserId && managerUserId === user.id) return true

  if (managerEmail && user.email && managerEmail.toLowerCase() === user.email.toLowerCase()) {
    return true
  }

  return false
}
