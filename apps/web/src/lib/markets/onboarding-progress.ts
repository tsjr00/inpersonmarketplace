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
  /** Mig 145: TRUE when manager has at least one placeholder row OR
   *  has explicitly acknowledged "I have no off-platform vendors yet"
   *  via the no_placeholders_ack flag. */
  placeholders_step_done: boolean
  /** Mig 145: the manager-toggled ack flag itself (markets column). */
  no_placeholders_ack: boolean
  optin_done: boolean
  /** Total vendors with a market_vendors row for this market. */
  vendors_at_market_count: number
  /** Subset of vendors_at_market_count whose booth_number is non-null. */
  vendors_with_booth_count: number
  /** Mig 145: TRUE when manager has at least one on-platform vendor OR
   *  has explicitly acknowledged "I have no existing vendors yet" via
   *  the no_existing_vendors_ack flag. */
  vendors_step_done: boolean
  /** Mig 145: the manager-toggled ack flag itself (markets column). */
  no_existing_vendors_ack: boolean
  /** Number of REQUIRED steps complete (0..4) — inventory + optin +
   *  vendors + placeholders. Mig 145 grew this from 2 to 4. */
  required_complete: number
  /** Always 4 since mig 145 (was 2). UI uses it to render "X of N". */
  required_total: 4
}

/** Reads progress for the market using a service client (RLS is
 *  default-deny on these tables; callers' authenticated clients are
 *  blocked). No side effects. Four parallel HEAD-count queries. */
export async function getOnboardingProgress(
  marketId: string
): Promise<OnboardingProgress> {
  const serviceClient = createServiceClient()

  // Mig 145: also fetch the two ack flags from markets so we can compute
  // step_done for vendors + placeholders. Acks let the manager skip a
  // step legitimately when they truly have no existing vendors or
  // placeholders yet.
  const [
    invResult,
    placeholdersResult,
    optinResult,
    vendorsAllResult,
    vendorsWithBoothResult,
    marketResult,
  ] = await Promise.all([
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
    serviceClient
      .from('markets')
      .select('onboarding_no_existing_vendors_ack, onboarding_no_placeholders_ack')
      .eq('id', marketId)
      .maybeSingle(),
  ])

  const inventory_done = (invResult.count ?? 0) > 0
  const placeholders_count = placeholdersResult.count ?? 0
  const optin_done = (optinResult.count ?? 0) > 0
  const vendors_at_market_count = vendorsAllResult.count ?? 0
  const vendors_with_booth_count = vendorsWithBoothResult.count ?? 0
  const no_existing_vendors_ack =
    !!(marketResult.data?.onboarding_no_existing_vendors_ack as boolean | null)
  const no_placeholders_ack =
    !!(marketResult.data?.onboarding_no_placeholders_ack as boolean | null)

  // Mig 145: vendors + placeholders are now required steps. Done when
  // the manager has at least one row OR has acknowledged the skip.
  const vendors_step_done = vendors_at_market_count > 0 || no_existing_vendors_ack
  const placeholders_step_done = placeholders_count > 0 || no_placeholders_ack

  let required_complete = 0
  if (inventory_done) required_complete++
  if (optin_done) required_complete++
  if (vendors_step_done) required_complete++
  if (placeholders_step_done) required_complete++

  return {
    inventory_done,
    placeholders_count,
    placeholders_step_done,
    no_placeholders_ack,
    optin_done,
    vendors_at_market_count,
    vendors_with_booth_count,
    vendors_step_done,
    no_existing_vendors_ack,
    required_complete,
    required_total: 4,
  }
}
