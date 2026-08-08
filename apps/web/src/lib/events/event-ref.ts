/**
 * Resolve an event URL parameter that may be EITHER a `catering_requests.id`
 * (uuid) or an `event_token`.
 *
 * WHY THIS EXISTS — the address deadlock (owner testing 2026-08-06).
 *
 * `event_token` is minted at APPROVAL, not at intake (`api/event-requests`,
 * `lib/events/event-actions.ts`). Every organizer-facing surface was keyed by
 * token, so an event that could not be approved — e.g. one submitted without a
 * street address, which `api/admin/events/[id]` refuses to approve — had no
 * token, therefore no editor to add the address, and no working cancel button.
 * It could not be fixed and could not be escaped.
 *
 * The fix is to let the organizer's own surfaces address an event by its id.
 * That is safe because those routes authenticate the ORGANIZER
 * (`organizer_user_id` / `contact_email` match), not the token — the token is a
 * bearer credential for ATTENDEE pages, and nothing here relies on it being
 * secret. Accepting an id grants no access that the session did not already
 * carry.
 *
 * WHY A UUID TEST IS SAFE AS THE DISCRIMINATOR: an `event_token` is
 * `<company-slug>-<18 url-safe chars>` (event-actions.ts). For it to match the
 * uuid shape it would have to be exactly 36 characters with hyphens at indexes
 * 8/13/18/23 — but a 36-char token means a 17-char slug, which forces the
 * joining hyphen to index 17, not 18. A token can never be a valid uuid.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Which `catering_requests` column this reference should be matched against.
 * Use as `.eq(eventRefColumn(ref), ref)`.
 */
export function eventRefColumn(ref: string): 'id' | 'event_token' {
  return UUID_RE.test(ref) ? 'id' : 'event_token'
}
