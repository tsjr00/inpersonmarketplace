/**
 * Event lead time — how far ahead an event must be booked.
 *
 * WHY THIS EXISTS (owner, 2026-08-09)
 *
 * Lead time is a REVENUE lever on self-service events, not a scheduling
 * nicety. The platform earns on transaction volume, so an event with no
 * pre-order runway costs us matching, invitations, emails and support and
 * returns nothing. The owner's words: "if we don't get pre-orders then we are
 * doing all this for free."
 *
 * It is also the cheapest layer of late-change protection. An organizer who
 * booked too soon is precisely the one who then has to move the date — and a
 * moved date means attendees re-confirming and unconfirmed orders refunding,
 * after vendors have already committed. Preventing the rushed booking is
 * cheaper than handling its consequences.
 *
 * The mechanics that set the floor: self-service waits up to 48h for vendor
 * responses, then the organizer selects, then attendees need real time to
 * receive the event page link and pre-order.
 *
 * TWO THRESHOLDS, deliberately:
 *   < MIN  → rejected outright
 *   < WARN → allowed, but the organizer must acknowledge they are rushing it
 *
 * The warning is not a softer rejection. Its job is to make a rushed organizer
 * AWARE they are rushing, so they line up their details and their people
 * before the clock starts.
 *
 * ⚠ Admin-created events (`api/admin/events` POST) do not pass through here —
 * that path is the intentional escape hatch for a genuine exception.
 */

/** Hard floor. An event date closer than this is rejected at intake. */
export const MIN_EVENT_LEAD_DAYS = 10

/** Inside this window the organizer must acknowledge that they are rushing. */
export const RUSHED_EVENT_LEAD_DAYS = 14

export type LeadTimeStatus =
  /** Not a parseable YYYY-MM-DD date. */
  | 'invalid'
  /** Closer than MIN_EVENT_LEAD_DAYS — reject. */
  | 'too_soon'
  /** Between MIN and RUSHED — allow, but require acknowledgment. */
  | 'rushed'
  /** RUSHED_EVENT_LEAD_DAYS or more away — no friction. */
  | 'ok'

/**
 * Whole calendar days between today and `eventDate` (YYYY-MM-DD).
 * Negative for past dates, 0 for today. Null if unparseable.
 *
 * Deliberately compares CALENDAR DAYS, not elapsed milliseconds: both sides are
 * normalised to UTC midnight, so DST transitions and times-of-day cannot shift
 * the answer. `Date.parse` on a bare YYYY-MM-DD already yields UTC midnight,
 * but we build it explicitly rather than rely on that.
 *
 * ⚠ Known ±1 day at the boundary: the server runs UTC (Vercel) while the
 * organizer books in their own timezone, and we do not know it at intake.
 * Accepted — a 10-day floor is not a boundary where one day changes anything,
 * and the alternative is timezone plumbing that does not exist on this path.
 */
export function eventLeadDays(eventDate: string, now: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(eventDate ?? '').trim())
  if (!m) return null

  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const target = Date.UTC(year, month - 1, day)
  // Round-trip guard: catches 2026-02-31, which Date.UTC silently rolls over.
  const rt = new Date(target)
  if (rt.getUTCFullYear() !== year || rt.getUTCMonth() !== month - 1 || rt.getUTCDate() !== day) {
    return null
  }

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((target - today) / 86_400_000)
}

/** Classify an event date against both thresholds. */
export function leadTimeStatus(eventDate: string, now: Date = new Date()): LeadTimeStatus {
  const days = eventLeadDays(eventDate, now)
  if (days === null) return 'invalid'
  if (days < MIN_EVENT_LEAD_DAYS) return 'too_soon'
  if (days < RUSHED_EVENT_LEAD_DAYS) return 'rushed'
  return 'ok'
}

/**
 * The earliest bookable date as YYYY-MM-DD — for the date input's `min`.
 * Uses the caller's LOCAL calendar day, because that is the calendar the
 * organizer is looking at while they pick.
 */
export function earliestBookableDate(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + MIN_EVENT_LEAD_DAYS)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Rejection copy for a date inside the hard floor. Shared so both sides agree. */
export function tooSoonMessage(): string {
  return `Events need at least ${MIN_EVENT_LEAD_DAYS} days' notice. Vendors respond over about two days, then you choose who you want, and your guests need time to pre-order before the day arrives — that pre-ordering is what makes the event run smoothly. Please pick a date at least ${MIN_EVENT_LEAD_DAYS} days out.`
}

/** Acknowledgment copy for the rushed window. */
export function rushedWarning(days: number, vendorWord: string): string {
  return `Your event is ${days} ${days === 1 ? 'day' : 'days'} away, which is a tight turnaround. It can work — but only if you already have your details settled and people ready to respond quickly to us and to the ${vendorWord}. You will also have less time to share your event page and collect pre-orders, which is what keeps lines short on the day. If any of that is still up in the air, a later date will serve you better.`
}
