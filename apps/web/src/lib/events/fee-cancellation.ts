/**
 * Event Vendor Fee cancellation money — bands and windows (Phase 3, 2026-08-16).
 *
 * Owner model (decisions.md "Backup vendors — model decided", decision 6 +
 * the 2026-08-16 session answers):
 *   - Cancel BEFORE the 72h protection window → fee refunded in full
 *     (with transfer reversal), no stain.
 *   - Cancel INSIDE 72h → fee forfeited INSTANTLY. Forfeit moves no money —
 *     the payment split already happened at pay time; forfeiting = not
 *     refunding. The organizer holds the waiver lever (their undo): they may
 *     refund the forfeited fee until WAIVE_WINDOW_DAYS after the event date.
 *   - Free events / never-paid vendors: no monetary consequence (reputation
 *     only, via vendor_quality_findings — pre-existing).
 *
 * The 72h boundary deliberately matches the late_event_cancellation quality
 * finding (vendor cancel route) so "late" means ONE thing platform-wide.
 */

/** Hours before event start inside which a cancelled fee forfeits. */
export const FEE_PROTECTION_WINDOW_HOURS = 72

/** Days after the event date the organizer may still waive a forfeit. */
export const WAIVE_WINDOW_DAYS = 14

export type FeeCancellationOutcome = 'refund' | 'forfeit'

/**
 * Which money band a vendor cancellation falls in. A cancellation after the
 * event has started (negative hours) is still a forfeit — showing up in the
 * refund band by walking past zero would reward the latest cancel of all.
 */
export function decideFeeOutcome(hoursUntilEvent: number): FeeCancellationOutcome {
  return hoursUntilEvent >= FEE_PROTECTION_WINDOW_HOURS ? 'refund' : 'forfeit'
}

/**
 * Last instant the organizer can waive a forfeit: end of the day
 * WAIVE_WINDOW_DAYS after the event date. Same date-string convention as the
 * cancel route's 72h math (`event_start_date + 'T00:00:00'`, server clock —
 * Vercel runs UTC) so the two windows drift together, not apart.
 */
export function waivableUntil(eventDate: string): Date {
  const d = new Date(eventDate + 'T00:00:00')
  d.setDate(d.getDate() + WAIVE_WINDOW_DAYS + 1) // through end-of-day
  return d
}

export function isWaivable(eventDate: string, now: Date = new Date()): boolean {
  return now.getTime() < waivableUntil(eventDate).getTime()
}
