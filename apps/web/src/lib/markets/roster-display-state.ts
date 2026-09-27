/**
 * What the public market page shows a logged-in vendor at the top of the header
 * (owner rulings 2026-09-27, TR-133) — exactly ONE of:
 *   'apply'   → "Apply now" button        (no roster row at all)
 *   'applied' → "Applied" pill            (waiting on the manager; also an invited
 *                                          vendor who has not answered, and an approved
 *                                          vendor at an EVENT — events never book weeks)
 *   'book'    → "Book now" button         (approved at a non-event market)
 *   'hidden'  → nothing                   (the manager removed the vendor, or the vendor
 *                                          declined the manager's invitation)
 *
 * "Approved" is the booking gate's own test (lib/markets/booking-gates.ts, BR-1):
 * approved === true and nothing else — so the button and the page it opens can
 * never disagree. Pure; no I/O.
 */
export type RosterDisplayState = 'apply' | 'applied' | 'book' | 'hidden'

export interface RosterRowForDisplay {
  approved: boolean | null
  /** Set by the manager's revoke (vendor-approval route); cleared on re-approval. */
  revoked_at: string | null
  /** 'invited' | 'accepted' | 'declined' for invitation rows; null for a self-application. */
  response_status: string | null
}

export function rosterDisplayState(row: RosterRowForDisplay | null, isEvent: boolean): RosterDisplayState {
  if (!row) return 'apply'
  if (row.approved === true) return isEvent ? 'applied' : 'book'
  if (row.revoked_at) return 'hidden'
  if (row.response_status === 'declined') return 'hidden'
  return 'applied'
}
