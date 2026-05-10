import { createServiceClient } from '@/lib/supabase/server'

/**
 * Manager onboarding progress for a market.
 *
 * Computed read-only from the data the manager has entered. No
 * separate "completed" flag — Option A from the Session 81 plan.
 *
 * Tracked items:
 *   - Booth inventory (REQUIRED): at least one tier in
 *     market_booth_inventory
 *   - Vendor agreement statements (REQUIRED): at least one selection
 *     in market_optin_selections
 *   - Off-platform placeholders (OPTIONAL): manager-tracked occupancy;
 *     count is reported but doesn't gate "setup complete"
 *   - Vendor booth assignments (OPTIONAL): count of market_vendors
 *     rows with a booth_number set vs total at the market; doesn't
 *     gate completion either way (a market with zero on-platform
 *     vendors is still a valid setup state)
 *
 * RLS NOTE: the underlying tables (market_booth_inventory,
 * market_booth_placeholders, market_optin_selections) have RLS
 * enabled with NO POLICIES (migration 137) — default-deny except
 * service_role. This function uses createServiceClient() internally
 * because callers always pass the authenticated user's client, which
 * is blocked. Auth is enforced UPSTREAM by isMarketManager() before
 * this function is called, so using service client here is safe.
 */
export interface OnboardingProgress {
  inventory_done: boolean
  placeholders_count: number
  optin_done: boolean
  /** Total vendors with a market_vendors row for this market. */
  vendors_at_market_count: number
  /** Subset of vendors_at_market_count whose booth_number is non-null. */
  vendors_with_booth_count: number
  /** Number of REQUIRED steps complete (0..2) — inventory + optin. */
  required_complete: number
  /** Always 2. Kept as a field so the UI can render "X of N" without
   *  hardcoding the denominator in multiple places. */
  required_total: 2
}

/** Reads progress for the market using a service client (RLS is
 *  default-deny on these tables; callers' authenticated clients are
 *  blocked). No side effects. Four parallel HEAD-count queries. */
export async function getOnboardingProgress(
  marketId: string
): Promise<OnboardingProgress> {
  const serviceClient = createServiceClient()

  const [invResult, placeholdersResult, optinResult, vendorsAllResult, vendorsWithBoothResult] = await Promise.all([
    serviceClient
      .from('market_booth_inventory')
      .select('id', { count: 'exact', head: true })
      .eq('market_id', marketId),
    serviceClient
      .from('market_booth_placeholders')
      .select('id', { count: 'exact', head: true })
      .eq('market_id', marketId),
    serviceClient
      .from('market_optin_selections')
      .select('id', { count: 'exact', head: true })
      .eq('market_id', marketId),
    serviceClient
      .from('market_vendors')
      .select('id', { count: 'exact', head: true })
      .eq('market_id', marketId),
    serviceClient
      .from('market_vendors')
      .select('id', { count: 'exact', head: true })
      .eq('market_id', marketId)
      .not('booth_number', 'is', null),
  ])

  const inventory_done = (invResult.count ?? 0) > 0
  const placeholders_count = placeholdersResult.count ?? 0
  const optin_done = (optinResult.count ?? 0) > 0
  const vendors_at_market_count = vendorsAllResult.count ?? 0
  const vendors_with_booth_count = vendorsWithBoothResult.count ?? 0

  let required_complete = 0
  if (inventory_done) required_complete++
  if (optin_done) required_complete++

  return {
    inventory_done,
    placeholders_count,
    optin_done,
    vendors_at_market_count,
    vendors_with_booth_count,
    required_complete,
    required_total: 2,
  }
}
