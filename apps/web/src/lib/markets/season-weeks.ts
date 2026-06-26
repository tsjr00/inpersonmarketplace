import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Phase E — season/partial booking week enumeration.
 *
 * The booth rental unit is keyed on a Sunday `week_start_date` (mig 139). A
 * "season" is the set of Sunday-weeks within [start_date, end_date] where the
 * market operates at least one NON-cancelled day (week-grain rule, confirmed
 * 2026-06-25): one bookable week -> one `book_weekly_booth_atomic` call -> one
 * child `weekly_booth_rentals` row. A week is skipped only when ALL of its
 * operating days that week are cancelled.
 *
 * All date math is in UTC to avoid the DATE-parsed-as-local off-by-one.
 */

export interface SeasonWeek {
  /** Sunday anchoring the week (YYYY-MM-DD) — the weekly_booth_rentals.week_start_date key. */
  weekStartDate: string
  /** Non-cancelled operating dates in this week that fall within the season window. */
  operatingDates: string[]
}

/** Parse YYYY-MM-DD as a UTC date (no timezone drift). */
function parseUtc(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** Format a UTC date back to YYYY-MM-DD. */
function fmtUtc(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Enumerate the bookable Sunday-weeks for a season. Pure — no I/O.
 *
 * @param scheduleDows  distinct active market_schedules.day_of_week (0=Sun..6=Sat)
 * @param cancelledDates  YYYY-MM-DD dates with a cancelled market_date_override
 * @param startDate  season start, YYYY-MM-DD (inclusive)
 * @param endDate  season end, YYYY-MM-DD (inclusive)
 */
export function computeSeasonWeeks(
  scheduleDows: number[],
  cancelledDates: Set<string>,
  startDate: string,
  endDate: string,
): SeasonWeek[] {
  const dows = new Set(scheduleDows)
  if (dows.size === 0) return []

  const start = parseUtc(startDate)
  const end = parseUtc(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return []

  const byWeek = new Map<string, string[]>()

  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay()
    if (!dows.has(dow)) continue
    const dateStr = fmtUtc(d)
    if (cancelledDates.has(dateStr)) continue

    // Sunday that anchors this date's week.
    const sunday = new Date(d)
    sunday.setUTCDate(sunday.getUTCDate() - dow)
    const weekStart = fmtUtc(sunday)

    const arr = byWeek.get(weekStart)
    if (arr) arr.push(dateStr)
    else byWeek.set(weekStart, [dateStr])
  }

  return Array.from(byWeek.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([weekStartDate, operatingDates]) => ({ weekStartDate, operatingDates }))
}

/**
 * DB-backed: fetch the market's active schedule days + cancelled override dates
 * in [startDate, endDate], then compute the bookable weeks. Service-client only
 * (callers gate via isMarketManager / vendor-self upstream).
 */
export async function getSeasonBookableWeeks(
  serviceClient: SupabaseClient,
  marketId: string,
  startDate: string,
  endDate: string,
): Promise<SeasonWeek[]> {
  const [schedRes, ovrRes] = await Promise.all([
    serviceClient
      .from('market_schedules')
      .select('day_of_week')
      .eq('market_id', marketId)
      .eq('active', true),
    serviceClient
      .from('market_date_overrides')
      .select('override_date')
      .eq('market_id', marketId)
      .eq('status', 'cancelled')
      .gte('override_date', startDate)
      .lte('override_date', endDate),
  ])

  if (schedRes.error) throw schedRes.error
  if (ovrRes.error) throw ovrRes.error

  const dows = (schedRes.data ?? []).map((r) => r.day_of_week as number)
  const cancelled = new Set((ovrRes.data ?? []).map((r) => r.override_date as string))

  return computeSeasonWeeks(dows, cancelled, startDate, endDate)
}
