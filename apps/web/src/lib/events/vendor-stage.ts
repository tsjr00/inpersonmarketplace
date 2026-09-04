/**
 * Vendor event stage — ONE classifier for "where is this vendor in the event
 * flow", consumed by every surface that answers that question:
 *
 *   1. Vendor Event Page header status line (eventStage() layers fee-detail
 *      labels on top of the 'selected' stage)
 *   2. Locations-page event pill (EventMarketsSection)
 *
 * Owner finding 2026-09-03: the pill said "Attending" for a merely-ACCEPTED
 * truck the organizer might never select — accepted ≠ selected. The page and
 * the pill each derived the stage independently, so they drifted. The ladder
 * lives here so they cannot.
 *
 * Derivation order matters (mirrors the page's eventStage, 2026-08-29 (d)):
 * declined/withdrawn first, then non-acceptance, then bench, then selection.
 * `is_backup` outranks `organizer_selected_at` — the selection round leaves
 * non-selected vendors 'accepted' with is_backup=true (mig 234 notes).
 */

export type VendorEventStage =
  | 'declined'          // response_status = 'declined'
  | 'withdrawn'         // response_status = 'cancelled' (vendor cancelled participation)
  | 'invited'           // invitation exists, no answer yet
  | 'bench'             // accepted but benched (is_backup) — not attending unless promoted
  | 'accepted_awaiting' // said yes, organizer has not selected them
  | 'selected'          // organizer selected them — attending (fee state is a per-surface detail)
  | 'none'              // no market_vendors row at all (public event found by browsing)

export function classifyVendorEventStage(d: {
  response_status: string | null
  organizer_selected_at?: string | null
  is_backup?: boolean | null
}): VendorEventStage {
  if (d.response_status === 'declined') return 'declined'
  if (d.response_status === 'cancelled') return 'withdrawn'
  if (d.response_status === 'accepted') {
    if (d.is_backup === true) return 'bench'
    return d.organizer_selected_at ? 'selected' : 'accepted_awaiting'
  }
  if (d.response_status) return 'invited'
  return 'none'
}
