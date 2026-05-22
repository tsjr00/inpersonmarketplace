import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-only pre-flight checks for booth assignment mutations.
 *
 * Two concerns:
 *   1. booth_number uniqueness across market_vendors + market_booth_placeholders
 *      + weekly_booth_rentals (Issue 1 from Session 84 testing).
 *   2. Per-tier capacity — placeholders + on-platform vendors in a tier
 *      can't exceed market_booth_inventory.count (Issue 2).
 *
 * Mig 146 adds DB triggers as the canonical correctness gate. These
 * helpers are the friendly-error layer that runs BEFORE the trigger
 * fires, so the manager sees a clear UI message instead of a raw PG
 * exception (BOOTH_CONFLICT P0005). The trigger remains as the
 * safety net if any code path skips these helpers.
 */

export type BoothConflictSource =
  | 'on_platform_vendor'
  | 'off_platform_placeholder'
  | 'weekly_rental'

export interface BoothConflict {
  source: BoothConflictSource
  message: string
}

interface CheckBoothNumberAvailableOpts {
  marketId: string
  boothNumber: string
  /** Exclude self when editing — which table and id. */
  excludeSelf?: {
    kind: 'market_vendors' | 'market_booth_placeholders' | 'weekly_booth_rentals'
    id: string
  }
}

/**
 * Returns a BoothConflict descriptor if booth_number is taken by any
 * source at this market; null otherwise. Mirrors the DB trigger's
 * logic so we surface the same conflicts before the INSERT/UPDATE.
 */
export async function checkBoothNumberAvailable(
  serviceClient: SupabaseClient,
  opts: CheckBoothNumberAvailableOpts
): Promise<BoothConflict | null> {
  const { marketId, boothNumber, excludeSelf } = opts

  // (a) on-platform vendor conflict
  {
    let q = serviceClient
      .from('market_vendors')
      .select('id', { head: true, count: 'exact' })
      .eq('market_id', marketId)
      .eq('booth_number', boothNumber)
    if (excludeSelf?.kind === 'market_vendors') {
      q = q.neq('id', excludeSelf.id)
    }
    const { count } = await q
    if ((count ?? 0) > 0) {
      return {
        source: 'on_platform_vendor',
        message: `Booth number ${boothNumber} is already assigned to an on-platform vendor at this market.`,
      }
    }
  }

  // (b) placeholder conflict
  {
    let q = serviceClient
      .from('market_booth_placeholders')
      .select('id', { head: true, count: 'exact' })
      .eq('market_id', marketId)
      .eq('booth_number', boothNumber)
    if (excludeSelf?.kind === 'market_booth_placeholders') {
      q = q.neq('id', excludeSelf.id)
    }
    const { count } = await q
    if ((count ?? 0) > 0) {
      return {
        source: 'off_platform_placeholder',
        message: `Booth number ${boothNumber} is already assigned to an off-platform vendor placeholder at this market.`,
      }
    }
  }

  // (c) active current/future weekly rental conflict — only relevant
  // when the caller is NOT inserting into weekly_booth_rentals itself
  // (the partial UNIQUE index handles within-rentals; the trigger
  // covers any cross-table case we miss here).
  if (excludeSelf?.kind !== 'weekly_booth_rentals') {
    const today = new Date()
    const isoToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    const { count } = await serviceClient
      .from('weekly_booth_rentals')
      .select('id', { head: true, count: 'exact' })
      .eq('market_id', marketId)
      .eq('booth_number', boothNumber)
      .in('status', ['pending_payment', 'paid'])
      .gte('week_start_date', isoToday)

    if ((count ?? 0) > 0) {
      return {
        source: 'weekly_rental',
        message: `Booth number ${boothNumber} has an active paid booking for a current/upcoming week at this market.`,
      }
    }
  }

  return null
}

interface CheckTierCapacityOpts {
  marketId: string
  inventoryId: string
  /** When editing an existing row in a tier, exclude it from the count
   *  so a same-tier edit doesn't false-trigger over-capacity. */
  excludeSelf?: {
    kind: 'market_vendors' | 'market_booth_placeholders'
    id: string
  }
}

export interface CapacityCheckResult {
  ok: boolean
  /** Tier definition snapshot — exposed so callers can produce richer
   *  error messages (e.g., "Small tier already has 5 of 5 booths"). */
  tier?: {
    id: string
    size_label: string
    count: number
  }
  /** Current count of placeholders + on-platform vendors in this tier
   *  (excluding the self row if `excludeSelf` was provided). */
  currentCount: number
  message?: string
}

/**
 * Counts current permanent occupants (placeholders + on-platform
 * vendors with this tier set) and compares against tier.count.
 * If the caller is going to ADD a row (or move a row INTO this tier),
 * the caller should treat `currentCount` as the count BEFORE the add
 * — i.e., reject if `currentCount + 1 > tier.count`. The helper does
 * this comparison and sets `ok` accordingly.
 *
 * Weekly rentals are NOT counted here. They're week-specific and the
 * RPC handles per-week capacity (placeholders + active rentals <=
 * tier.count); permanent occupants (vendors + placeholders) layered
 * on top is the contract this helper enforces.
 */
export async function checkTierCapacity(
  serviceClient: SupabaseClient,
  opts: CheckTierCapacityOpts
): Promise<CapacityCheckResult> {
  const { marketId, inventoryId, excludeSelf } = opts

  const { data: tierRow } = await serviceClient
    .from('market_booth_inventory')
    .select('id, size_label, count')
    .eq('id', inventoryId)
    .eq('market_id', marketId)
    .maybeSingle()

  if (!tierRow) {
    return {
      ok: false,
      currentCount: 0,
      message: 'Selected booth size tier does not belong to this market.',
    }
  }

  const tier = {
    id: tierRow.id as string,
    size_label: tierRow.size_label as string,
    count: tierRow.count as number,
  }

  // Count placeholders in this tier
  let phQuery = serviceClient
    .from('market_booth_placeholders')
    .select('id', { head: true, count: 'exact' })
    .eq('market_id', marketId)
    .eq('inventory_id', inventoryId)
  if (excludeSelf?.kind === 'market_booth_placeholders') {
    phQuery = phQuery.neq('id', excludeSelf.id)
  }

  // Count market_vendors in this tier
  let mvQuery = serviceClient
    .from('market_vendors')
    .select('id', { head: true, count: 'exact' })
    .eq('market_id', marketId)
    .eq('inventory_id', inventoryId)
  if (excludeSelf?.kind === 'market_vendors') {
    mvQuery = mvQuery.neq('id', excludeSelf.id)
  }

  const [phResult, mvResult] = await Promise.all([phQuery, mvQuery])
  const currentCount = (phResult.count ?? 0) + (mvResult.count ?? 0)

  const wouldBe = currentCount + 1
  if (wouldBe > tier.count) {
    return {
      ok: false,
      tier,
      currentCount,
      message:
        `The ${tier.size_label} tier already has ${currentCount} of ${tier.count} booths assigned. ` +
        `Increase the tier's count first, or pick a different tier.`,
    }
  }

  return { ok: true, tier, currentCount }
}
