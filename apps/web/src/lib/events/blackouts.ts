/**
 * Vendor date blackouts (R3-4, mig 238).
 *
 * A blackout row says "this vendor is NOT selling at this location on this
 * date". `get_available_pickup_dates` (newest definer: mig 238) drops the
 * date, so the listing page, the cart validator and the vendor's own pickup
 * calendar all stop offering it — the owner's "turn off pre-orders for that
 * timeframe" — with one write and no per-consumer logic.
 *
 * Written ONLY by the event accept route, for a non-flagged vendor who chose
 * the event over a conflicting location (lib/events/availability.ts).
 * Lifted on every event exit: benched by the organizer, withdrew, or the
 * event was cancelled — the flow-integrity suite asserts each exit calls
 * `liftEventBlackouts`. Rows also age out naturally (dates pass).
 *
 * Both helpers are tolerant of the table not existing yet (deploy order:
 * code may land before mig 238 is pasted) — they report, never throw.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { VendorConflict } from './availability'

export interface BlackoutWriteResult {
  written: number
  error: string | null
}

export async function writeEventBlackouts(
  service: SupabaseClient,
  vendorProfileId: string,
  eventMarketId: string,
  conflicts: VendorConflict[],
  reason: string
): Promise<BlackoutWriteResult> {
  // Never black out another EVENT — a non-flagged vendor cannot hold two
  // anyway (blockedByEvent), and the blackout is for the location being skipped.
  const seen = new Set<string>()
  const rows = conflicts
    .filter(c => c.kind !== 'event')
    .filter(c => {
      const key = `${c.marketId}|${c.date}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map(c => ({
      vendor_profile_id: vendorProfileId,
      market_id: c.marketId,
      blackout_date: c.date,
      source_event_market_id: eventMarketId,
      reason,
    }))
  if (rows.length === 0) return { written: 0, error: null }

  const { error } = await service
    .from('vendor_date_blackouts')
    .upsert(rows, { onConflict: 'vendor_profile_id,market_id,blackout_date', ignoreDuplicates: true })
  if (error) return { written: 0, error: error.message }
  return { written: rows.length, error: null }
}

/**
 * Remove every blackout this event caused — for one vendor (benched /
 * withdrew) or for all of them (event cancelled) when vendorProfileId is
 * omitted.
 */
export async function liftEventBlackouts(
  service: SupabaseClient,
  eventMarketId: string,
  vendorProfileId?: string
): Promise<{ error: string | null }> {
  let q = service
    .from('vendor_date_blackouts')
    .delete()
    .eq('source_event_market_id', eventMarketId)
  if (vendorProfileId) q = q.eq('vendor_profile_id', vendorProfileId)
  const { error } = await q
  return { error: error ? error.message : null }
}
