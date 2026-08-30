/**
 * Admin queue badges (phase 1 of the admin UI rebuild, owner 2026-08-30).
 *
 * "Needs you now" counts for the AdminShell nav (and, phase 2, the hub's
 * queue tiles). One parallel batch of HEAD counts; a null vertical means
 * platform scope (no vertical filter). Badge set v1 approved by the owner:
 * pending vendors, pending markets, event requests, open order issues,
 * error reports, unremitted cause funds, activity flags.
 *
 * Status vocabulary verified against the pages/routes that own each queue
 * (2026-08-30): vendors pending = status 'submitted' (the hub's own filter);
 * markets 'pending'; catering_requests 'new'/'reviewing'; order issues =
 * reported and issue_status null/'new'/'in_review' (order-issues route
 * counts); error_reports 'pending'/'acknowledged' (errors page vocabulary);
 * activity flags 'pending'; cause = remittance rows with paid_at null
 * (platform only — the table has no vertical column).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { observed, type SupabaseError } from '@/lib/errors'

export type AdminBadgeKey =
  | 'pendingVendors'
  | 'pendingMarkets'
  | 'eventRequests'
  | 'orderIssues'
  | 'errorReports'
  | 'activityFlags'
  | 'causeUnremitted'

export type AdminBadges = Partial<Record<AdminBadgeKey, number>>

interface CountResult {
  data: unknown
  error: SupabaseError | null
  count: number | null
}

/** Await a HEAD-count query; failures are logged through observed() and
 *  render as 0 — a broken badge must never break the admin layout. */
async function headCount(q: PromiseLike<CountResult>, table: string): Promise<number> {
  const res = await q
  if (res.error) {
    await observed(Promise.resolve({ data: res.data, error: res.error }), { table })
    return 0
  }
  return res.count ?? 0
}

export async function getAdminQueueBadges(
  service: SupabaseClient,
  vertical: string | null
): Promise<AdminBadges> {
  const head = { count: 'exact' as const, head: true }

  let vendorsQ = service.from('vendor_profiles').select('id', head).eq('status', 'submitted')
  if (vertical) vendorsQ = vendorsQ.eq('vertical_id', vertical)
  let marketsQ = service.from('markets').select('id', head).eq('status', 'pending')
  if (vertical) marketsQ = marketsQ.eq('vertical_id', vertical)
  let eventsQ = service.from('catering_requests').select('id', head).in('status', ['new', 'reviewing'])
  if (vertical) eventsQ = eventsQ.eq('vertical_id', vertical)
  let issuesQ = service
    .from('order_items')
    .select('id, orders!inner ( vertical_id )', head)
    .not('issue_reported_at', 'is', null)
    .or('issue_status.is.null,issue_status.in.(new,in_review)')
  if (vertical) issuesQ = issuesQ.eq('orders.vertical_id', vertical)
  let errorsQ = service.from('error_reports').select('id', head).in('status', ['pending', 'acknowledged'])
  if (vertical) errorsQ = errorsQ.eq('vertical_id', vertical)
  let flagsQ = service.from('vendor_activity_flags').select('id', head).eq('status', 'pending')
  if (vertical) flagsQ = flagsQ.eq('vertical_id', vertical)

  const [vendors, markets, events, issues, errors, flags, cause] = await Promise.all([
    headCount(vendorsQ, 'vendor_profiles'),
    headCount(marketsQ, 'markets'),
    headCount(eventsQ, 'catering_requests'),
    headCount(issuesQ, 'order_items'),
    headCount(errorsQ, 'error_reports'),
    headCount(flagsQ, 'vendor_activity_flags'),
    vertical
      ? Promise.resolve<number | null>(null)
      : headCount(service.from('cause_remittances').select('id', head).is('paid_at', null), 'cause_remittances'),
  ])

  const badges: AdminBadges = {
    pendingVendors: vendors,
    pendingMarkets: markets,
    eventRequests: events,
    orderIssues: issues,
    errorReports: errors,
    activityFlags: flags,
  }
  if (cause !== null) badges.causeUnremitted = cause
  return badges
}
