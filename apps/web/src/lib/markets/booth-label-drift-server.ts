import type { SupabaseClient } from '@supabase/supabase-js'
import { detectBoothLabelDrift } from '@/lib/markets/booth-labels'

/**
 * Server-only helper. Called from the booth-inventory routes after any
 * mutation (POST a new tier, PATCH a tier's count, DELETE a tier). If
 * the new inventory total no longer matches the manager's configured
 * booth-label range (`markets.booth_label_start` / `_end`), auto-clear
 * the range and return a warning the caller can surface to the manager.
 *
 * Why auto-clear instead of blocking the mutation: the manager is in
 * the middle of editing inventory; blocking with a 409 forces them to
 * go fix labels first then come back. Auto-clearing lets the inventory
 * edit succeed and tells them to re-save labels next — flows better.
 *
 * Returns null when:
 *   - markets row not found
 *   - labels not configured (both null)
 *   - parse fails
 *   - counts already match
 * Otherwise returns a warning message describing the drift + that
 * labels were cleared. Caller includes it in the response body.
 */
export async function reconcileBoothLabelsAfterInventoryChange(
  serviceClient: SupabaseClient,
  marketId: string
): Promise<string | null> {
  // Fetch labels + inventory rows in parallel
  const [marketResult, inventoryResult] = await Promise.all([
    serviceClient
      .from('markets')
      .select('booth_label_start, booth_label_end')
      .eq('id', marketId)
      .maybeSingle(),
    serviceClient
      .from('market_booth_inventory')
      .select('count')
      .eq('market_id', marketId),
  ])

  if (!marketResult.data) return null

  const start = (marketResult.data.booth_label_start as string | null) ?? null
  const end = (marketResult.data.booth_label_end as string | null) ?? null
  const totalCount = (inventoryResult.data ?? []).reduce(
    (sum, row) => sum + ((row.count as number) ?? 0),
    0
  )

  const drift = detectBoothLabelDrift(start, end, totalCount)
  if (!drift) return null

  // Drift detected. Auto-clear the labels and tell the manager.
  await serviceClient
    .from('markets')
    .update({ booth_label_start: null, booth_label_end: null })
    .eq('id', marketId)

  return (
    `Heads up: your booth label range covered ${drift.rangeCount} booth${drift.rangeCount === 1 ? '' : 's'} ` +
    `but your inventory now totals ${drift.totalCount}. We cleared your label range — ` +
    `set it again under "Booth numbering" so the system can auto-assign labels for new bookings.`
  )
}
