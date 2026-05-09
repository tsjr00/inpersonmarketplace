import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Manager onboarding progress for a market.
 *
 * Computed read-only from the data the manager has entered (no separate
 * "completed" flag — Option A from the Session 81 plan). The dashboard's
 * "Setup checklist" card and the onboarding step pages both use this to
 * decide what's done and what's next.
 *
 * Steps tracked:
 *   1. Booth inventory — at least one tier in market_booth_inventory
 *   2. Off-platform placeholders — informational only (optional; treated
 *      as "seen" so it doesn't block progress)
 *   3. Opt-in statements — at least one statement selected
 */
export interface OnboardingProgress {
  inventory_done: boolean
  placeholders_seen: boolean
  optin_done: boolean
  total_complete: number
  total_steps: 3
}

/** Reads the data the manager has entered and returns a progress summary.
 *  No side effects. Two parallel HEAD-count queries — cheap. */
export async function getOnboardingProgress(
  supabase: SupabaseClient,
  marketId: string
): Promise<OnboardingProgress> {
  const [invResult, selResult] = await Promise.all([
    supabase
      .from('market_booth_inventory')
      .select('id', { count: 'exact', head: true })
      .eq('market_id', marketId),
    supabase
      .from('market_optin_selections')
      .select('id', { count: 'exact', head: true })
      .eq('market_id', marketId),
  ])

  const inventory_done = (invResult.count ?? 0) > 0
  const optin_done = (selResult.count ?? 0) > 0
  // Placeholders are optional, so we don't gate progress on having any.
  // Treated as "seen" for the progress count — informational step only.
  const placeholders_seen = true

  let total_complete = 0
  if (inventory_done) total_complete++
  if (placeholders_seen) total_complete++
  if (optin_done) total_complete++

  return {
    inventory_done,
    placeholders_seen,
    optin_done,
    total_complete,
    total_steps: 3,
  }
}
