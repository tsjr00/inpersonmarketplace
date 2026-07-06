import type { SupabaseClient } from '@supabase/supabase-js'
import { sendNotification } from '@/lib/notifications'

/**
 * FT park-manager B3 — docs-to-review sweep (decoupled from the doc-upload
 * routes; option B). Every doc upload bumps `vendor_verifications.updated_at`
 * (coi / category-documents / documents routes). This sweep notifies a park
 * operator once when an affiliated, consented truck's docs have changed since
 * the operator last reviewed OR was last notified — so it's one ping per
 * change, not per file.
 *
 * All comparisons are ABSOLUTE INSTANTS (TIMESTAMPTZ vs TIMESTAMPTZ) — no
 * market-local date math, so there's no timezone-drift risk here. (The cron
 * SCHEDULE handles the "business hours" window; the sweep logic is tz-agnostic.)
 *
 * Requires (from B1/B2): a `market_vendors` row (auto-affiliate) + the
 * `_info_sharing_consent` snapshot entry (unlocks the operator's doc access).
 */
export interface ParkDocsReviewSummary {
  parksConsidered: number
  notificationsSent: number
  errors: string[]
}

export async function runParkDocsReviewSweep(
  serviceClient: SupabaseClient
): Promise<ParkDocsReviewSummary> {
  const summary: ParkDocsReviewSummary = { parksConsidered: 0, notificationsSent: 0, errors: [] }

  // 1) FT parks that have a manager to notify.
  const { data: markets } = await serviceClient
    .from('markets')
    .select('id, name, manager_user_id, vertical_id')
    .eq('vertical_id', 'food_trucks')
    .not('manager_user_id', 'is', null)
  if (!markets || markets.length === 0) return summary
  summary.parksConsidered = markets.length
  const marketIds = markets.map((m) => m.id as string)
  const marketById = new Map(markets.map((m) => [m.id as string, m]))

  // 2) Affiliated trucks at those parks.
  const { data: mvRows } = await serviceClient
    .from('market_vendors')
    .select('market_id, vendor_profile_id')
    .in('market_id', marketIds)
  if (!mvRows || mvRows.length === 0) return summary

  // 3) Info-sharing consent per (market, truck) — without it the operator can't
  //    view the docs, so there's nothing to review.
  const { data: acceptances } = await serviceClient
    .from('vendor_market_agreement_acceptances')
    .select('market_id, vendor_profile_id, statements_snapshot')
    .in('market_id', marketIds)
  const consent = new Set<string>()
  for (const a of acceptances ?? []) {
    const snap = a.statements_snapshot as Array<{ statement_id?: string }> | null
    if (Array.isArray(snap) && snap.some((s) => s?.statement_id === '_info_sharing_consent')) {
      consent.add(`${a.market_id}|${a.vendor_profile_id}`)
    }
  }

  // 4) Vetting markers per (market, truck): last-notified + last-reviewed.
  const { data: vetting } = await serviceClient
    .from('park_vendor_vetting')
    .select('market_id, vendor_profile_id, docs_notified_at, docs_reviewed_at')
    .in('market_id', marketIds)
  const markerByKey = new Map<string, number>()
  for (const v of vetting ?? []) {
    const notified = v.docs_notified_at ? new Date(v.docs_notified_at as string).getTime() : 0
    const reviewed = v.docs_reviewed_at ? new Date(v.docs_reviewed_at as string).getTime() : 0
    markerByKey.set(`${v.market_id}|${v.vendor_profile_id}`, Math.max(notified, reviewed))
  }

  // 5) Each truck's docs "changed at" (updated_at) + display name.
  const vendorIds = Array.from(new Set(mvRows.map((r) => r.vendor_profile_id as string)))
  const [{ data: verifications }, { data: profiles }] = await Promise.all([
    serviceClient.from('vendor_verifications').select('vendor_profile_id, updated_at').in('vendor_profile_id', vendorIds),
    serviceClient.from('vendor_profiles').select('id, profile_data').in('id', vendorIds),
  ])
  const updatedByVendor = new Map<string, number>()
  for (const vf of verifications ?? []) {
    if (vf.updated_at) updatedByVendor.set(vf.vendor_profile_id as string, new Date(vf.updated_at as string).getTime())
  }
  const nameByVendor = new Map<string, string>()
  for (const p of profiles ?? []) {
    const pd = p.profile_data as { business_name?: string; farm_name?: string } | null
    nameByVendor.set(p.id as string, pd?.business_name || pd?.farm_name || 'A food truck')
  }

  // 6) Notify where docs changed since the later of (last notified, last reviewed).
  for (const mv of mvRows) {
    const marketId = mv.market_id as string
    const vendorProfileId = mv.vendor_profile_id as string
    const key = `${marketId}|${vendorProfileId}`
    if (!consent.has(key)) continue
    const updatedAt = updatedByVendor.get(vendorProfileId)
    if (updatedAt === undefined) continue // no verification record / no docs
    const marker = markerByKey.get(key) ?? 0
    if (marker && updatedAt <= marker) continue // nothing new since last ping/review

    const market = marketById.get(marketId)
    const managerUserId = market?.manager_user_id as string | null | undefined
    if (!managerUserId) continue

    try {
      await sendNotification(
        managerUserId,
        'park_truck_docs_to_review',
        {
          marketName: (market?.name as string) || 'your park',
          vendorName: nameByVendor.get(vendorProfileId) || 'A food truck',
          marketId,
        },
        { vertical: 'food_trucks' }
      )
      // Stamp the marker (creates the vetting row if absent; only touches
      // docs_notified_at — blocked/review_status/etc. are untouched).
      await serviceClient
        .from('park_vendor_vetting')
        .upsert(
          { market_id: marketId, vendor_profile_id: vendorProfileId, docs_notified_at: new Date().toISOString() },
          { onConflict: 'market_id,vendor_profile_id' }
        )
      summary.notificationsSent++
    } catch (err) {
      summary.errors.push(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  return summary
}
