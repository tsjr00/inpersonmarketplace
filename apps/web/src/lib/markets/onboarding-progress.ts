import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Manager onboarding progress for a market.
 *
 * Computed read-only from the data the manager has entered (no
 * separate "completed" flag — Option A from the Session 81 plan).
 *
 * Tracked items:
 *   - Booth inventory (REQUIRED): at least one tier in
 *     market_booth_inventory
 *   - Vendor agreement statements (REQUIRED): at least one selection in
 *     market_optin_selections
 *   - Off-platform placeholders (OPTIONAL): manager-tracked occupancy;
 *     count is reported but doesn't gate "setup complete"
 *
 * Required completion drives the dashboard "Setup complete" state and
 * the wizard's confirm-step warnings. Placeholders are reported via
 * `placeholders_count` so callers can render "(N tracked)" copy or a
 * checkmark when count > 0.
 */
export interface OnboardingProgress {
  inventory_done: boolean
  placeholders_count: number
  optin_done: boolean
  /** Number of REQUIRED steps complete (0..2) — inventory + optin. */
  required_complete: number
  /** Always 2. Kept as a field so the UI can render "X of N" without
   *  hardcoding the denominator in multiple places. */
  required_total: 2
}

/** Reads the data the manager has entered and returns a progress
 *  summary. No side effects. Three parallel HEAD-count queries. */
export async function getOnboardingProgress(
  supabase: SupabaseClient,
  marketId: string
): Promise<OnboardingProgress> {
  const [invResult, placeholdersResult, optinResult] = await Promise.all([
    supabase
      .from('market_booth_inventory')
      .select('id', { count: 'exact', head: true })
      .eq('market_id', marketId),
    supabase
      .from('market_booth_placeholders')
      .select('id', { count: 'exact', head: true })
      .eq('market_id', marketId),
    supabase
      .from('market_optin_selections')
      .select('id', { count: 'exact', head: true })
      .eq('market_id', marketId),
  ])

  const inventory_done = (invResult.count ?? 0) > 0
  const placeholders_count = placeholdersResult.count ?? 0
  const optin_done = (optinResult.count ?? 0) > 0

  let required_complete = 0
  if (inventory_done) required_complete++
  if (optin_done) required_complete++

  return {
    inventory_done,
    placeholders_count,
    optin_done,
    required_complete,
    required_total: 2,
  }
}
