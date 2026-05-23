/**
 * Cron-side helpers for survey generation. Pure functions (no DB) so
 * they're unit-testable. The cron handler at /api/cron/surveys/route.ts
 * wires them up to actual queries + mutations.
 *
 * Key invariant (Session 81 lock-in): a market day's surveys fire at
 *   - 18:00 local IF the market closed BEFORE 18:00 that day
 *   - 08:00 local NEXT DAY IF the market closed AT 18:00 OR LATER
 *
 * This avoids interrupting the buyer's evening or hitting them too
 * early after a late market. Buffer was tuned to give attendees time
 * to drive home + check email before the survey lands.
 */

/**
 * Parse a `HH:MM:SS` time string from `market_schedules.end_time` into
 * minutes-since-midnight. Returns null on parse failure.
 */
export function parseTimeToMinutes(t: string | null | undefined): number | null {
  if (!t || typeof t !== 'string') return null
  const m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!m) return null
  const hh = parseInt(m[1]!, 10)
  const mm = parseInt(m[2]!, 10)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

/**
 * Given a market_date (YYYY-MM-DD) and the market's end_time for that
 * day_of_week, compute the FIRE moment as a UTC ISO timestamp. The
 * caller passes in the market's local timezone offset hints so the
 * comparison against "now" stays correct under DST.
 *
 * Returns null if end_time can't be parsed (defensive).
 */
export function computeFireMomentLocal(
  marketDate: string,
  endTime: string | null
): { fireAtLocalIso: string; sameDay: boolean } | null {
  const minutes = parseTimeToMinutes(endTime)
  if (minutes === null) return null

  const closesEarly = minutes < 18 * 60 // before 18:00 local
  const sameDay = closesEarly

  // Compute the fire date (same day or +1)
  const fireDate = parseYMD(marketDate)
  if (!fireDate) return null
  if (!closesEarly) {
    fireDate.setDate(fireDate.getDate() + 1)
  }

  // Build "fire local" string. We don't shift into UTC here — we
  // return the local-time descriptor and let the caller compare against
  // "now in market_timezone" using the same TZ-aware Date construction
  // that the rest of the codebase uses (cron expire-orders pattern).
  const yyyy = fireDate.getFullYear()
  const mm = String(fireDate.getMonth() + 1).padStart(2, '0')
  const dd = String(fireDate.getDate()).padStart(2, '0')
  const fireHour = closesEarly ? 18 : 8

  // We return ISO-ish local string (no offset). Caller compares against
  // "now in market_timezone" formatted the same way.
  const fireAtLocalIso = `${yyyy}-${mm}-${dd}T${String(fireHour).padStart(2, '0')}:00:00`
  return { fireAtLocalIso, sameDay }
}

/**
 * Returns "now" in the market's local TZ as an ISO-ish local string
 * (no offset suffix) — mirrors `computeFireMomentLocal`'s output shape
 * so simple string comparison works.
 */
export function nowInTimezoneAsLocalIso(timezone: string): string {
  const tz = timezone || 'America/Chicago'
  const localDate = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
  const yyyy = localDate.getFullYear()
  const mm = String(localDate.getMonth() + 1).padStart(2, '0')
  const dd = String(localDate.getDate()).padStart(2, '0')
  const hh = String(localDate.getHours()).padStart(2, '0')
  const mins = String(localDate.getMinutes()).padStart(2, '0')
  const ss = String(localDate.getSeconds()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${mins}:${ss}`
}

/**
 * Today + yesterday in the market's local TZ, as YYYY-MM-DD strings.
 * Used by the cron loop to pick candidate market_dates to consider.
 */
export function recentLocalDates(timezone: string): {
  today: string
  yesterday: string
  todayDayOfWeek: number
  yesterdayDayOfWeek: number
} {
  const tz = timezone || 'America/Chicago'
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
  const today = formatYMD(now)
  const todayDayOfWeek = now.getDay()
  const ydate = new Date(now)
  ydate.setDate(ydate.getDate() - 1)
  const yesterday = formatYMD(ydate)
  const yesterdayDayOfWeek = ydate.getDay()
  return { today, yesterday, todayDayOfWeek, yesterdayDayOfWeek }
}

/** YYYY-MM-DD → Date in local components. Returns null on parse failure. */
export function parseYMD(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const y = parseInt(m[1]!, 10)
  const mo = parseInt(m[2]!, 10)
  const d = parseInt(m[3]!, 10)
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
  return new Date(y, mo - 1, d)
}

export function formatYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** Display-formatted market date, e.g. "Saturday, May 17, 2026". */
export function formatMarketDateDisplay(ymd: string): string {
  const d = parseYMD(ymd)
  if (!d) return ymd
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}
