import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Phase E — cancelled-day counter for season settlement (O4/O6).
 *
 * How many market days that a booth_booking_group PREPAID for were later
 * cancelled (market_date_overrides status='cancelled'). A cancelled date counts
 * when its Sunday-week is one the group bought AND it falls on/after the group's
 * purchase_date (late-buyer cutoff — no credit for days cancelled before the
 * vendor bought in). Compare the result to market_seasons.refund_cap_days.
 *
 * Derived, not materialized — Phase C already stores the override rows.
 */

function parseUtc(d: string): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}
function fmtUtc(d: Date): string {
  return d.toISOString().slice(0, 10)
}
/** Sunday (YYYY-MM-DD) anchoring the week that contains `dateStr`. */
function sundayOf(dateStr: string): string {
  const d = parseUtc(dateStr)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return fmtUtc(d)
}

/** Pure: count cancelled dates whose week the group bought, on/after purchaseDate. */
export function computeCancelledDays(
  groupWeekStarts: string[],
  cancelledDates: string[],
  purchaseDate: string | null,
): number {
  const weeks = new Set(groupWeekStarts)
  let n = 0
  for (const d of cancelledDates) {
    if (purchaseDate && d < purchaseDate) continue
    if (weeks.has(sundayOf(d))) n++
  }
  return n
}

/**
 * DB-backed: count the cancelled days a paid group prepaid for. Fetches the
 * group's child week_start_dates + the market's cancelled overrides, then
 * applies the purchase-date cutoff.
 */
export async function getGroupCancelledDays(
  serviceClient: SupabaseClient,
  groupId: string,
): Promise<{ cancelledDays: number; weekStarts: string[]; purchaseDate: string | null } | null> {
  const { data: group } = await serviceClient
    .from('booth_booking_groups')
    .select('id, market_id, purchase_date')
    .eq('id', groupId)
    .maybeSingle()
  if (!group) return null

  const { data: rentals } = await serviceClient
    .from('weekly_booth_rentals')
    .select('week_start_date')
    .eq('group_id', groupId)
  const weekStarts = (rentals ?? []).map((r) => r.week_start_date as string)
  if (weekStarts.length === 0) {
    return { cancelledDays: 0, weekStarts: [], purchaseDate: (group.purchase_date as string | null) ?? null }
  }

  const { data: overrides } = await serviceClient
    .from('market_date_overrides')
    .select('override_date')
    .eq('market_id', group.market_id as string)
    .eq('status', 'cancelled')
  const cancelledDates = (overrides ?? []).map((o) => o.override_date as string)

  const purchaseDate = (group.purchase_date as string | null) ?? null
  return {
    cancelledDays: computeCancelledDays(weekStarts, cancelledDates, purchaseDate),
    weekStarts,
    purchaseDate,
  }
}
