import { createServiceClient } from '@/lib/supabase/server'
import { fetchMarketOptinForVendor, type SnapshotStatement } from '@/lib/markets/optin-public'

/**
 * Deterministic per-market "version" derived from the set of statement IDs
 * the manager has currently selected (plus a 1-bit marker for info-sharing
 * consent presence, when that's part of the snapshot). Used by the Phase B
 * agreement-loop re-acceptance flow (B-close-3).
 *
 * Design: B-close-3 took the "auto-hash" route over a manually-bumped
 * markets.current_agreement_version column. Trade-off:
 *   + No migration. No manager UI for "bump version." Self-maintaining.
 *   + Any change to the manager's selections triggers re-acceptance —
 *     which is semantically correct (the agreement DID change).
 *   - Order of statement IDs doesn't matter (we sort), but placeholder
 *     value changes do not trigger re-acceptance. Manager editing the
 *     {distance_miles} value alone won't nag everyone. Acceptable for
 *     v1; placeholder-only edits are usually clarifications, not new terms.
 *
 * The hash is a short stable string; goes into
 * vendor_market_agreement_acceptances.agreement_version. UNIQUE constraint
 * (vendor_profile_id, market_id, agreement_version) means re-accepting the
 * same set is idempotent (PG returns 23505; caller treats as success).
 */

/** Compute the version string from a sorted list of statement_ids. Pure. */
export function computeAgreementVersion(statementIds: string[]): string {
  if (statementIds.length === 0) return 'v0:empty'
  const sorted = [...statementIds].sort()
  // Lightweight FNV-like hash — collision risk is fine here (small input
  // space, version is per-market scoped). Two different sets producing
  // the same hash would just cause one false-negative "you're up to
  // date" prompt; the rendered agreement would still show the real
  // statements.
  let h = 2166136261
  for (const id of sorted) {
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i)
      h = (h * 16777619) >>> 0
    }
    h ^= 124 // pipe separator
    h = (h * 16777619) >>> 0
  }
  // Format: v1:<count>:<hex8> — count helps debugging, hex8 is the hash
  return `v1:${sorted.length}:${h.toString(16).padStart(8, '0')}`
}

/** Convenience: extract statement_ids from a snapshot array and hash them.
 *  Skips synthetic entries (those starting with `_`) so info-sharing-only
 *  changes don't trigger re-acceptance on their own. */
export function computeAgreementVersionFromSnapshot(snapshot: SnapshotStatement[]): string {
  const ids = snapshot
    .map((s) => s.statement_id)
    .filter((id) => !id.startsWith('_'))
  return computeAgreementVersion(ids)
}

/**
 * Fetch the market's current agreement version (computed from the
 * manager's current statement selections). Cheap — same query the
 * agreement block uses, just sliced for the version string.
 */
export async function getCurrentMarketAgreementVersion(
  marketId: string
): Promise<string> {
  const { snapshot } = await fetchMarketOptinForVendor(marketId)
  return computeAgreementVersionFromSnapshot(snapshot)
}

export interface AgreementStaleness {
  /** True when the vendor's latest acceptance for this market has a
   *  different agreement_version than the current computed version. */
  is_stale: boolean
  /** Current computed version (from manager's selections right now). */
  current_version: string
  /** Vendor's latest acceptance.agreement_version for this market, or null
   *  if no acceptance exists (i.e., the auto-created market_vendors row
   *  predates the acceptance loop). */
  last_accepted_version: string | null
  /** Whether ANY acceptance row exists for this (vendor, market). When
   *  false, vendor was auto-associated by a pre-loop signup or by manual
   *  admin action — re-prompt is appropriate but the UI may want to
   *  treat it differently than a "your manager changed terms" prompt. */
  has_any_acceptance: boolean
}

/**
 * Compare a vendor's most-recent acceptance for this market against the
 * manager's current statements. Returns true `is_stale` when the vendor
 * should be prompted to re-accept.
 *
 * Uses service client because vendor_market_agreement_acceptances is
 * default-deny (mig 138). Auth must be enforced upstream.
 *
 * Edge cases:
 *   - No acceptance row exists → is_stale=true, has_any_acceptance=false
 *     (let caller decide whether to nag)
 *   - Vendor has multiple acceptance rows (different versions over time)
 *     → use the most recent one by accepted_at
 *   - Current version is `v0:empty` AND vendor's latest is `v0:empty` →
 *     fresh, no prompt (no statements = no need to re-accept)
 */
export async function getVendorAgreementStaleness(
  vendorProfileId: string,
  marketId: string
): Promise<AgreementStaleness> {
  const serviceClient = createServiceClient()

  const [currentVersion, acceptanceResult] = await Promise.all([
    getCurrentMarketAgreementVersion(marketId),
    serviceClient
      .from('vendor_market_agreement_acceptances')
      .select('agreement_version, accepted_at')
      .eq('vendor_profile_id', vendorProfileId)
      .eq('market_id', marketId)
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const latest = acceptanceResult.data
  const lastAcceptedVersion = (latest?.agreement_version as string | null) ?? null
  const hasAnyAcceptance = !!latest

  // If no acceptance exists, the vendor needs to accept — treat as stale.
  // (Caller decides UI treatment based on has_any_acceptance.)
  if (!hasAnyAcceptance) {
    return {
      is_stale: true,
      current_version: currentVersion,
      last_accepted_version: null,
      has_any_acceptance: false,
    }
  }

  return {
    is_stale: lastAcceptedVersion !== currentVersion,
    current_version: currentVersion,
    last_accepted_version: lastAcceptedVersion,
    has_any_acceptance: true,
  }
}
