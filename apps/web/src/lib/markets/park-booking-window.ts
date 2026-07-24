/**
 * Park same-day booking window — tester finding 2026-07-23 (owner decision).
 *
 * A truck could book a spot for TODAY at any hour, including after the park
 * had already opened and even after it had closed: the booking route only
 * rejected dates strictly in the past. The owner's rule (2026-07-23):
 *
 *   Same-day booking is allowed, but ONLY:
 *     1. up to PARK_SAME_DAY_CUTOFF_MINUTES before that day's opening time, AND
 *     2. for trucks with an established relationship at THIS park —
 *        a COMPLETED past day here (booking_date < today), or documents the
 *        operator has marked `reviewed` (park_vendor_vetting.review_status).
 *
 * Why relationship-based and not operator confirmation: an approval step would
 * need an SLA and a timeout, and every resolution of "the operator didn't
 * answer before opening" is bad (auto-approve makes the gate meaningless;
 * auto-reject costs the truck a selling day and forces a refund; holding the
 * money needs auth-and-capture, which the park destination-charge path does not
 * do). Both signals here are already true or false when the truck loads the
 * page, so nothing can time out. The operator's after-the-fact remedies
 * (block / bar — the truck forfeits the fee) remain the enforcement teeth.
 *
 * Pure functions, no I/O — shared by the booking route (authoritative), the
 * recurring-occurrence pay route, and the booking form (mirrors the rule so a
 * truck never sees a day it cannot buy).
 */

/** Minutes before a park's opening time that same-day booking closes. */
export const PARK_SAME_DAY_CUTOFF_MINUTES = 60

/** A row from market_schedules (day_of_week + start_time are all we need). */
export interface ScheduleOpenSlot {
  day_of_week: number
  start_time: string
}

/**
 * Parse a Postgres TIME ("11:00:00", "11:00") into minutes since midnight.
 * Returns null for anything unparseable — callers treat null as "no known
 * opening time", which skips the cutoff rather than guessing at one.
 */
export function timeToMinutes(time: string | null | undefined): number | null {
  if (typeof time !== 'string') return null
  const m = time.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

/**
 * Earliest opening time per day-of-week, in minutes since midnight.
 *
 * A park with two slots on the same day (e.g. a lunch block and a dinner
 * block) "opens" at the earlier one — that is the moment the day starts for
 * the operator, so it is the moment the cutoff is measured against.
 */
export function earliestOpenByDow(schedules: readonly ScheduleOpenSlot[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const s of schedules) {
    const mins = timeToMinutes(s.start_time)
    if (mins === null) continue
    const prev = out.get(s.day_of_week)
    if (prev === undefined || mins < prev) out.set(s.day_of_week, mins)
  }
  return out
}

/** Minutes since midnight for a Date already expressed in the park's timezone. */
export function localMinutesOfDay(localNow: Date): number {
  return localNow.getHours() * 60 + localNow.getMinutes()
}

/**
 * True once same-day booking has closed for a day opening at `openMinutes`.
 *
 * A null `openMinutes` (park has no schedule row for that weekday, or an
 * unparseable time) returns false: with no known opening time there is no
 * cutoff to enforce, and the separate "park isn't open on that day" check
 * already rejects those dates.
 */
export function isPastSameDayCutoff(
  nowMinutes: number,
  openMinutes: number | null,
  cutoffMinutes: number = PARK_SAME_DAY_CUTOFF_MINUTES,
): boolean {
  if (openMinutes === null) return false
  return nowMinutes > openMinutes - cutoffMinutes
}

/** Format minutes-since-midnight as a display clock time ("10:00 AM"). */
export function formatClockMinutes(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440
  const h24 = Math.floor(wrapped / 60)
  const m = wrapped % 60
  const suffix = h24 < 12 ? 'AM' : 'PM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

/**
 * The two reasons a same-day booking is refused. Callers turn these into
 * user-facing copy; keeping them as codes means the route and the form say the
 * same thing for the same cause.
 */
export type SameDayDenialReason = 'not_established' | 'past_cutoff'

/**
 * Explain why same-day booking is refused, or null when it is allowed.
 *
 * `established` = completed a past day at this park OR operator-reviewed docs.
 * Order matters: the relationship check comes first, because telling a truck
 * "you missed the cutoff" when they could never have booked today at all
 * sends them back tomorrow to hit a different wall.
 */
export function denySameDayReason(
  established: boolean,
  nowMinutes: number,
  openMinutes: number | null,
  cutoffMinutes: number = PARK_SAME_DAY_CUTOFF_MINUTES,
): SameDayDenialReason | null {
  if (!established) return 'not_established'
  if (isPastSameDayCutoff(nowMinutes, openMinutes, cutoffMinutes)) return 'past_cutoff'
  return null
}
