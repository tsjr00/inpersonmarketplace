/**
 * Server-side bundle composition checks (mig 244) — shared by the manager
 * create/edit routes AND admin approval, so "valid bundle" has ONE
 * definition. Checkout re-verifies live at purchase time (its own copy of
 * the availability rules in the expansion block) — these are the
 * composition-time gates.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { observed } from '@/lib/errors'
import { BUNDLE_LIMITS } from '@/lib/bundles/core'

export interface BundleComponentInput {
  listingId: string
  quantity: number
}

export async function validateBundleComponents(
  serviceClient: SupabaseClient,
  marketId: string,
  components: BundleComponentInput[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Array.isArray(components) || components.length < 2) {
    return { ok: false, error: 'A bundle needs at least 2 items.' }
  }
  const ids = components.map(c => c.listingId)
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: 'Each item can appear in the bundle only once.' }
  }
  if (components.some(c => !Number.isInteger(c.quantity) || c.quantity < 1 || c.quantity > 25)) {
    return { ok: false, error: 'Item quantities must be whole numbers between 1 and 25.' }
  }

  const { data: listings } = await observed(serviceClient
    .from('listings')
    .select('id, status, deleted_at, vendor_profile_id, listing_markets (market_id)')
    .in('id', ids), { table: 'listings' })
  const byId = new Map((listings ?? []).map(l => [l.id as string, l]))

  for (const c of components) {
    const l = byId.get(c.listingId)
    if (!l || l.deleted_at || l.status !== 'published') {
      return { ok: false, error: 'Every bundle item must be a live, published listing.' }
    }
    const marketLinks = (l.listing_markets ?? []) as Array<{ market_id: string }>
    if (!marketLinks.some(m => m.market_id === marketId)) {
      return { ok: false, error: 'Every bundle item must be sold at this market.' }
    }
  }

  const vendorIds = [...new Set((listings ?? []).map(l => l.vendor_profile_id as string))]
  const { data: vendors } = await observed(serviceClient
    .from('vendor_profiles')
    .select('id, bundles_opt_out, stripe_account_id')
    .in('id', vendorIds), { table: 'vendor_profiles' })
  if ((vendors ?? []).some(v => v.bundles_opt_out)) {
    return { ok: false, error: 'A vendor in this bundle has opted out of curated bundles.' }
  }
  if ((vendors ?? []).some(v => !v.stripe_account_id)) {
    return { ok: false, error: 'A vendor in this bundle cannot accept card payments yet.' }
  }

  return { ok: true }
}

/** ACTIVE bundles for a market (Q5 cap: max 3). */
export async function countActiveBundles(
  serviceClient: SupabaseClient,
  marketId: string,
  excludeBundleId?: string
): Promise<number> {
  let query = serviceClient
    .from('market_bundles')
    .select('id', { count: 'exact', head: true })
    .eq('market_id', marketId)
    .eq('status', 'active')
  if (excludeBundleId) query = query.neq('id', excludeBundleId)
  const { count } = await query
  return count ?? 0
}

export function validateBundleFields(body: {
  name?: unknown
  marginCents?: unknown
  quantityLimit?: unknown
  pickupMarketDate?: unknown
  pickupNotes?: unknown
  justification?: unknown
  causeBeneficiaryId?: unknown
  causePct?: unknown
}): { ok: true } | { ok: false; error: string } {
  if (typeof body.name !== 'string' || body.name.trim().length < 3 || body.name.length > 120) {
    return { ok: false, error: 'Give the bundle a name (3–120 characters).' }
  }
  if (!Number.isInteger(body.marginCents) || (body.marginCents as number) < 0) {
    return { ok: false, error: 'The margin must be a whole number of cents, 0 or more.' }
  }
  if (
    !Number.isInteger(body.quantityLimit) ||
    (body.quantityLimit as number) < 1 ||
    (body.quantityLimit as number) > BUNDLE_LIMITS.maxQuantityPerBundle
  ) {
    return { ok: false, error: `Quantity limit must be between 1 and ${BUNDLE_LIMITS.maxQuantityPerBundle}.` }
  }
  if (typeof body.pickupMarketDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.pickupMarketDate)) {
    return { ok: false, error: 'Pick the market day this bundle is for.' }
  }
  // REQUIRED as of 2026-09-06 (owner E5 finding): without a named in-market
  // spot, buyers hunt each component vendor. An easy pickup spot is part of
  // the manager's value-add.
  if (typeof body.pickupNotes !== 'string' || body.pickupNotes.trim().length < 3) {
    return { ok: false, error: 'Name the spot at the market where buyers collect the bundle (e.g. "the info booth at the main entrance").' }
  }
  if (typeof body.justification !== 'string' || body.justification.trim().length < 10) {
    return { ok: false, error: 'Explain the value you add (at least a sentence) — the approval reviewer reads this.' }
  }
  const hasBeneficiary = !!body.causeBeneficiaryId
  const hasPct = body.causePct !== undefined && body.causePct !== null
  if (hasBeneficiary !== hasPct) {
    return { ok: false, error: 'A cause needs both the organization and the percentage.' }
  }
  if (hasPct && (!Number.isInteger(body.causePct) || (body.causePct as number) < 1 || (body.causePct as number) > 100)) {
    return { ok: false, error: 'The cause percentage must be a whole number from 1 to 100.' }
  }
  return { ok: true }
}
