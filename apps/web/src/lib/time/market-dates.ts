/**
 * Per-market calendar-date helpers.
 *
 * Market-local date columns (pickup_date, event_date, scheduled_date,
 * end_date, ...) must be compared against "today" resolved in the market's
 * OWN timezone — never against a UTC-derived date. Every US market is behind
 * UTC, so a UTC "today" runs a day ahead each evening (after UTC midnight,
 * before market midnight), making same-day rows look past-due.
 *
 * `now` is injectable so the UTC/market boundary is unit-testable. The
 * fallback timezone is America/Chicago to stay consistent with the DB
 * (mig 054 COALESCE(timezone,'America/Chicago')) and the survey-cron JS
 * helpers (nowInTimezoneAsLocalIso). Null timezone should be rare — the real
 * remedy is a markets.timezone backfill, not per-site state inference.
 */

export const DEFAULT_TIMEZONE = 'America/Chicago'

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Calendar date (YYYY-MM-DD) that it currently is in `timezone`. */
export function todayInTimezone(timezone?: string | null, now: Date = new Date()): string {
  const tz = timezone || DEFAULT_TIMEZONE
  return ymd(new Date(now.toLocaleString('en-US', { timeZone: tz })))
}

/** Calendar date one day after today in `timezone`. */
export function tomorrowInTimezone(timezone?: string | null, now: Date = new Date()): string {
  const tz = timezone || DEFAULT_TIMEZONE
  const local = new Date(now.toLocaleString('en-US', { timeZone: tz }))
  local.setDate(local.getDate() + 1)
  return ymd(local)
}

/**
 * Add `days` calendar days to a YYYY-MM-DD string, returning YYYY-MM-DD.
 * Timezone-independent (pure calendar math, done in UTC to avoid DST shifts).
 */
export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d!))
  dt.setUTCDate(dt.getUTCDate() + days)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}
