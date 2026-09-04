/**
 * Host menu pare-down validation (P1, owner decisions 2026-09-03 —
 * decisions.md "Host menu pare-down").
 *
 * The organizer may trim a truck's PROPOSED event menu (its
 * event_vendor_listings rows) before the shopping page publishes:
 *   · minimum kept items = 2 (owner: "min items is 2")
 *   · a truck that proposed ≤2 items cannot be pared at all
 *   · pared ids must be a subset of the truck's own proposal
 * Timing (first-selection-round only) and the backup exemption are enforced
 * by the caller (the select route) — they are event-state facts, not list
 * arithmetic.
 */

export const MIN_KEPT_ITEMS = 2

export function validatePare(
  proposedListingIds: string[],
  paredListingIds: string[]
): { ok: true } | { ok: false; error: string } {
  if (paredListingIds.length === 0) return { ok: true }
  const proposed = new Set(proposedListingIds)
  for (const id of paredListingIds) {
    if (!proposed.has(id)) {
      return { ok: false, error: 'An item being removed is not on this vendor\'s proposed menu' }
    }
  }
  if (proposedListingIds.length <= MIN_KEPT_ITEMS) {
    return { ok: false, error: `Menus with ${MIN_KEPT_ITEMS} or fewer items can't be trimmed` }
  }
  const kept = proposedListingIds.length - new Set(paredListingIds).size
  if (kept < MIN_KEPT_ITEMS) {
    return { ok: false, error: `Each vendor keeps at least ${MIN_KEPT_ITEMS} items` }
  }
  return { ok: true }
}
