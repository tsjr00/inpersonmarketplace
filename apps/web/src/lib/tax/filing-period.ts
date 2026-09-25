/**
 * Tax filing-period boundaries in TEXAS time (owner 2026-09-25: "use central
 * time for the tax report").
 *
 * We file MONTHLY. A Texas return covers a local calendar month, but the app
 * stores UTC timestamps and the other admin reports cut days at UTC midnight —
 * which puts every sale made after ~7 pm Central on the last day of a month
 * onto the NEXT month's return. This converts a report's "YYYY-MM-DD" dates to
 * the exact UTC instants of Central midnight, DST-aware, with no library.
 *
 * Scope: the tax report only. The other reports keep their UTC days (owner).
 */
export const TAX_FILING_TIME_ZONE = 'America/Chicago'

/** Offset (ms) of `timeZone` from UTC at `instant` — positive east of UTC. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant))
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - (instant - (instant % 1000))
}

/** UTC instant of 00:00 local time on `date` ("YYYY-MM-DD") in `timeZone`. */
export function zonedDayStartUtc(date: string, timeZone: string = TAX_FILING_TIME_ZONE): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) throw new Error(`Expected YYYY-MM-DD, got "${date}"`)
  const naive = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  // Two passes: the offset at the guess can differ from the offset at the
  // answer only across a DST switch, and one correction settles it.
  let utc = naive - zoneOffsetMs(naive, timeZone)
  utc = naive - zoneOffsetMs(utc, timeZone)
  return new Date(utc)
}

/**
 * The report range [start, end] as ISO strings for a query:
 * start = Central midnight opening `dateFrom`; end = the last millisecond
 * before Central midnight after `dateTo` (so `dateTo` is included whole).
 */
export function taxPeriodBoundsUtc(dateFrom: string, dateTo: string, timeZone: string = TAX_FILING_TIME_ZONE): { startIso: string; endIso: string } {
  const start = zonedDayStartUtc(dateFrom, timeZone)
  const [y, mo, d] = dateTo.split('-').map(Number)
  const next = new Date(Date.UTC(y, mo - 1, d + 1)).toISOString().slice(0, 10)
  const end = new Date(zonedDayStartUtc(next, timeZone).getTime() - 1)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}
