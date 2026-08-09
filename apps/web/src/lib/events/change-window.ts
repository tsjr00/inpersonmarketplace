import { nowInTimezoneLocalIso, DEFAULT_TIMEZONE } from '@/lib/time/market-dates'

/**
 * When is it too late for an organizer to change their event?
 *
 * THE MISTAKE THIS AVOIDS (owner decision, 2026-08-09)
 *
 * The obvious answer is "at the ordering cutoff", and it is wrong. One number
 * was being asked to do two different jobs:
 *
 *   cutoff_hours  → when do VENDORS need certainty about quantities
 *   the block     → when is it too late to ask ATTENDEES a question
 *
 * Those deadlines are not the same, and using the cutoff for both collides at
 * the long end. With a 7-day cutoff the block would engage exactly when
 * ordering closes — so a change made a moment before it would be legal, and the
 * refund deadline for unconfirmed orders would be that same moment. Every
 * unconfirmed order would refund with zero chance to answer.
 *
 * So the block engages at whichever is later: a floor that guarantees attendees
 * time to respond, or the cutoff plus a runway so a change can never land ON
 * the refund deadline.
 *
 *   cutoff 24h (the only value in practice today) → block 72h, runway 48h
 *   cutoff 48h                                    → block 72h, runway 24h
 *   cutoff 168h                                   → block 192h, runway 24h
 *
 * The `+ runway` term only binds when someone sets a cutoff longer than the
 * floor — which is itself a declaration that their vendors need early
 * certainty, so being held to it is consistent rather than arbitrary.
 *
 * ⚠ NOT the whole ladder. This module answers only the TIME question. Whether a
 * change needs an acknowledgment first depends on CONSEQUENCE — whether anyone
 * has pre-ordered — which the caller supplies. An event with no pre-orders
 * skips the friction entirely (owner): there is nobody to re-confirm.
 */

/** Attendees need this long to answer a re-confirmation, at minimum. */
export const BLOCK_FLOOR_HOURS = 72

/** A change must never land ON the refund deadline. This is the gap it keeps. */
export const RECONFIRM_RUNWAY_HOURS = 24

/** Approval clamps `cutoff_hours` into this range (event-actions.ts). */
const CUTOFF_MIN_HOURS = 12
const CUTOFF_MAX_HOURS = 168
const CUTOFF_DEFAULT_HOURS = 24

/**
 * How many hours before the event the hard block engages.
 *
 * Mirrors approval's clamp so a corrupt or out-of-range stored value cannot
 * produce a nonsensical window — a null cutoff behaves exactly like the 24h
 * default every self-service event actually has.
 */
export function blockStartHoursBeforeEvent(cutoffHours: number | null | undefined): number {
  const raw = typeof cutoffHours === 'number' && Number.isFinite(cutoffHours)
    ? cutoffHours
    : CUTOFF_DEFAULT_HOURS
  const cutoff = Math.min(Math.max(raw, CUTOFF_MIN_HOURS), CUTOFF_MAX_HOURS)
  return Math.max(BLOCK_FLOOR_HOURS, cutoff + RECONFIRM_RUNWAY_HOURS)
}

/**
 * Hours from now until the event starts, in the MARKET'S timezone.
 *
 * Vercel runs UTC while the event happens somewhere else, so both sides are
 * rendered as naive local strings in the market's zone and parsed identically.
 * The runner's own timezone cancels out of the subtraction.
 *
 * A missing start time is treated as MIDNIGHT, not as approval's 11:00 default:
 * midnight is earlier, so the block engages sooner. When the data is
 * incomplete, err toward protecting the people who already committed.
 *
 * Returns null if the date is unusable.
 */
export function hoursUntilEvent(
  eventDate: string | null | undefined,
  eventStartTime: string | null | undefined,
  timezone: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null

  const time = /^\d{2}:\d{2}(:\d{2})?$/.test(String(eventStartTime ?? ''))
    ? String(eventStartTime).slice(0, 8).padEnd(8, ':00').slice(0, 8)
    : '00:00:00'

  const eventLocal = Date.parse(`${eventDate}T${time}`)
  const nowLocal = Date.parse(nowInTimezoneLocalIso(timezone || DEFAULT_TIMEZONE, now))
  if (Number.isNaN(eventLocal) || Number.isNaN(nowLocal)) return null

  return (eventLocal - nowLocal) / 3_600_000
}

export type ChangeWindowState =
  /** Far enough out that timing alone imposes nothing. */
  | 'open'
  /** Inside the block — refuse, and route to an admin override. */
  | 'blocked'
  /** The event has already started or passed. */
  | 'past'
  /** Date unusable — cannot decide, so do not pretend to. */
  | 'unknown'

export interface ChangeWindowResult {
  state: ChangeWindowState
  /** Hours until the event starts; null when unknown. */
  hoursUntil: number | null
  /** Hours before the event at which the block engages. */
  blockAtHours: number
}

export function evaluateChangeWindow(
  args: {
    eventDate: string | null | undefined
    eventStartTime: string | null | undefined
    timezone: string | null | undefined
    cutoffHours: number | null | undefined
  },
  now: Date = new Date()
): ChangeWindowResult {
  const blockAtHours = blockStartHoursBeforeEvent(args.cutoffHours)
  const hoursUntil = hoursUntilEvent(args.eventDate, args.eventStartTime, args.timezone, now)

  if (hoursUntil === null) return { state: 'unknown', hoursUntil: null, blockAtHours }
  if (hoursUntil <= 0) return { state: 'past', hoursUntil, blockAtHours }
  if (hoursUntil <= blockAtHours) return { state: 'blocked', hoursUntil, blockAtHours }
  return { state: 'open', hoursUntil, blockAtHours }
}

/**
 * A start time moving by less than this is not worth disturbing anyone over.
 * Owner, 2026-08-09: date and address changes always count; a time change only
 * counts past this, "otherwise we spam over a rounding adjustment and train
 * people to ignore it".
 */
export const RECONFIRM_TIME_SHIFT_MINUTES = 30

export interface EventFactsForChange {
  event_date?: string | null
  address?: string | null
  event_start_time?: string | null
}

/** Minutes since midnight for an HH:MM[:SS] string, or null. */
function minutesOfDay(t: string | null | undefined): number | null {
  const m = /^(\d{2}):(\d{2})/.exec(String(t ?? ''))
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * Would this edit change something an attendee agreed to when they ordered?
 *
 * Deliberately NOT "did any field change". An attendee committed to being at a
 * place, on a day, at roughly a time. Budget notes and dietary preferences are
 * none of their business, and asking them to re-confirm over one would burn the
 * only attention we get.
 */
export function changeRequiresReconfirmation(
  before: EventFactsForChange,
  after: EventFactsForChange
): boolean {
  if ('event_date' in after && after.event_date !== before.event_date) return true

  if ('address' in after) {
    const a = String(before.address ?? '').trim().toLowerCase()
    const b = String(after.address ?? '').trim().toLowerCase()
    // Whitespace/casing normalised: "12 Main St " -> "12 Main St" is not a move.
    if (a !== b) return true
  }

  if ('event_start_time' in after) {
    const wasMin = minutesOfDay(before.event_start_time)
    const nowMin = minutesOfDay(after.event_start_time)
    if (wasMin === null || nowMin === null) {
      // One side unset — treat any change as material rather than guess.
      if (before.event_start_time !== after.event_start_time) return true
    } else if (Math.abs(nowMin - wasMin) >= RECONFIRM_TIME_SHIFT_MINUTES) {
      return true
    }
  }

  return false
}

/** Human phrasing for how long is left — for organizer-facing copy. */
export function describeTimeUntil(hours: number): string {
  if (hours < 1) return 'less than an hour'
  if (hours < 24) {
    const h = Math.round(hours)
    return `${h} ${h === 1 ? 'hour' : 'hours'}`
  }
  const days = Math.round(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'}`
}
