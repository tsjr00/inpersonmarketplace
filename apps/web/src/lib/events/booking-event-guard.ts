/**
 * Reverse-direction event conflict check (owner go 2026-09-05).
 *
 * R3-4 / mig 238 writes blackouts in ONE direction: at event-ACCEPT time,
 * against the commitments that exist at that moment. This module covers the
 * other direction — a vendor who already accepted an event tries to BOOK a
 * market/park day on one of the event's dates. Without this, the booking
 * goes through, no blackout exists, and a single-truck vendor is committed
 * to two places (the truck3 staging finding, 2026-09-05).
 *
 * The commitment definition MIRRORS availability.ts's "other events" query
 * (:404-421): response_status='accepted', NOT benched (is_backup), event
 * date range covering the date — plus revoked_at IS NULL (a revoked
 * invitation is not a commitment) and the same multiple_trucks exemption
 * the whole R3-4 rule carries (a flagged fleet CAN be in two places).
 *
 * Booking routes REJECT conflicted dates outright rather than offering the
 * accept-flow's choose-the-event dialog: choosing the market here would
 * mean withdrawing from an accepted event, which is its own explicit flow —
 * a paid booking must never silently imply it.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { observed } from '@/lib/errors'

export interface EventDayConflict {
  date: string
  eventMarketId: string
  eventName: string
}

export async function vendorEventConflictsOnDates(
  service: SupabaseClient,
  vendorProfileId: string,
  dates: string[]
): Promise<EventDayConflict[]> {
  if (dates.length === 0) return []

  // Multi-truck fleets are exempt from the one-place rule (same exemption
  // as availability.ts:292).
  const { data: vp } = await observed(service
    .from('vendor_profiles')
    .select('profile_data')
    .eq('id', vendorProfileId)
    .maybeSingle(), { table: 'vendor_profiles' })
  if (((vp?.profile_data as Record<string, unknown> | null)?.multiple_trucks) === true) return []

  const { data: rows } = await observed(service
    .from('market_vendors')
    .select('market_id, is_backup, revoked_at, markets:market_id ( id, name, market_type, event_start_date, event_end_date )')
    .eq('vendor_profile_id', vendorProfileId)
    .eq('response_status', 'accepted'), { table: 'market_vendors' })

  const sorted = [...dates].sort()
  const minDate = sorted[0]!
  const maxDate = sorted[sorted.length - 1]!

  const conflicts: EventDayConflict[] = []
  for (const r of rows ?? []) {
    if (r.is_backup === true || r.revoked_at) continue
    const m = Array.isArray(r.markets) ? r.markets[0] : r.markets
    if (!m || m.market_type !== 'event' || !m.event_start_date) continue
    const start = m.event_start_date as string
    const end = (m.event_end_date as string | null) ?? start
    if (start > maxDate || end < minDate) continue
    for (const date of dates) {
      if (date >= start && date <= end) {
        conflicts.push({ date, eventMarketId: m.id as string, eventName: m.name as string })
      }
    }
  }
  return conflicts
}

/** One human sentence for a booking rejection. */
export function describeEventDayConflicts(conflicts: EventDayConflict[]): string {
  const first = conflicts[0]!
  const dates = [...new Set(conflicts.map(c => c.date))].sort()
  return dates.length === 1
    ? `You've accepted "${first.eventName}" on ${dates[0]} — a booking there can't overlap it. Withdraw from the event first if your plans changed.`
    : `You've accepted event(s) on ${dates.join(', ')} — a booking can't overlap them. Withdraw from the event first if your plans changed.`
}
