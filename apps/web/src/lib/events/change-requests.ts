/**
 * Change requests — the way out of the hard block.
 *
 * An organizer inside the block is refused: their event is close enough that
 * attendees could not answer a re-confirmation in time. Refusing with no exit
 * would be the address deadlock in a different costume, so the refusal becomes
 * a request an admin reviews.
 *
 * Owner decisions this module enforces (2026-08-09):
 *   · An ADMIN ALWAYS REVIEWS. Auto-approving self-declared emergencies on the
 *     strength of attribution alone was proposed and rejected.
 *   · The explanation is REQUIRED on every reason, not just "other" — the
 *     category is for us, the sentence is what vendors read.
 *   · An admin may EDIT the change before approving on ADMIN-ASSISTED events
 *     only; a self-service request is approved or declined exactly as asked.
 */

export const CHANGE_REQUEST_REASONS = [
  { value: 'venue_cancelled', label: 'Our venue cancelled or changed on us' },
  { value: 'weather_safety', label: 'Weather or a safety problem' },
  { value: 'personal_emergency', label: 'A personal or family emergency' },
  { value: 'venue_scheduling_conflict', label: 'A scheduling conflict at the venue' },
  { value: 'wrong_date_booked', label: 'We booked the wrong date' },
  { value: 'other', label: 'Something else' },
] as const

export type ChangeRequestReason = (typeof CHANGE_REQUEST_REASONS)[number]['value']

export const CHANGE_REQUEST_REASON_VALUES: readonly string[] =
  CHANGE_REQUEST_REASONS.map(r => r.value)

export function reasonLabel(value: string): string {
  return CHANGE_REQUEST_REASONS.find(r => r.value === value)?.label ?? value
}

/**
 * The only fields a change request may carry.
 *
 * Exactly the set the block refuses — asking an admin to approve a budget-note
 * edit would be theatre, and an unbounded blob could not be validated on the
 * way back out when it is applied.
 */
export const CHANGEABLE_FIELDS = [
  'event_date',
  'address',
  'event_start_time',
  'event_end_time',
] as const

export type ChangeableField = (typeof CHANGEABLE_FIELDS)[number]

/** Matches the DB CHECK on `explanation`. Kept in step deliberately. */
export const EXPLANATION_MIN = 10
export const EXPLANATION_MAX = 1000

export interface ValidatedChangeRequest {
  reason_category: ChangeRequestReason
  explanation: string
  requested_changes: Record<string, string>
}

export type ChangeRequestValidation =
  | { ok: true; value: ValidatedChangeRequest }
  | { ok: false; error: string }

/**
 * Validate a submitted request. Mirrors the table's CHECK constraints so the
 * organizer gets a sentence they can act on instead of a raw constraint
 * violation — the constraints remain the real boundary.
 */
export function validateChangeRequest(body: {
  reason_category?: unknown
  explanation?: unknown
  requested_changes?: unknown
}): ChangeRequestValidation {
  const reason = String(body.reason_category ?? '')
  if (!CHANGE_REQUEST_REASON_VALUES.includes(reason)) {
    return { ok: false, error: 'Please choose a reason for the change.' }
  }

  const explanation = String(body.explanation ?? '').trim()
  if (explanation.length < EXPLANATION_MIN) {
    return {
      ok: false,
      error: `Please tell us what happened in your own words — at least ${EXPLANATION_MIN} characters. The people who committed to your event will read this, so a sentence or two is plenty.`,
    }
  }
  if (explanation.length > EXPLANATION_MAX) {
    return {
      ok: false,
      error: `Please keep your explanation under ${EXPLANATION_MAX} characters.`,
    }
  }

  const raw = body.requested_changes
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'No change was included in the request.' }
  }

  const changes: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(CHANGEABLE_FIELDS as readonly string[]).includes(k)) {
      return { ok: false, error: `"${k}" is not something this request can change.` }
    }
    const s = String(v ?? '').trim()
    if (!s) {
      return { ok: false, error: `Please provide a value for ${k.replace(/_/g, ' ')}.` }
    }
    if (k === 'event_date' && !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return { ok: false, error: 'The new date must be a real date.' }
    }
    if ((k === 'event_start_time' || k === 'event_end_time') && !/^\d{2}:\d{2}(:\d{2})?$/.test(s)) {
      return { ok: false, error: 'The new time must look like 14:30.' }
    }
    changes[k] = k === 'address' ? s.slice(0, 500) : s
  }

  if (Object.keys(changes).length === 0) {
    return { ok: false, error: 'No change was included in the request.' }
  }

  return {
    ok: true,
    value: {
      reason_category: reason as ChangeRequestReason,
      explanation,
      requested_changes: changes,
    },
  }
}

/** Readable one-liner describing a change, for admin and vendor copy. */
export function describeChanges(changes: Record<string, unknown>): string {
  const parts: string[] = []
  if (changes.event_date) parts.push(`date to ${changes.event_date}`)
  if (changes.address) parts.push(`address to ${changes.address}`)
  if (changes.event_start_time) {
    parts.push(`start time to ${String(changes.event_start_time).slice(0, 5)}`)
  }
  if (changes.event_end_time) {
    parts.push(`end time to ${String(changes.event_end_time).slice(0, 5)}`)
  }
  if (parts.length === 0) return 'no changes'
  if (parts.length === 1) return parts[0]!
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}
