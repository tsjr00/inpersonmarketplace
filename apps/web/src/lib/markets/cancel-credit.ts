import { calculateBoothRentalFees } from '@/lib/pricing'

/**
 * Phase E — vendor whole-group cancel credit (pure; no I/O).
 *
 * Extracted from api/vendor/booth-groups/[groupId]/cancel so the credit formula
 * is unit testable. The route maps its child rentals into this shape and applies
 * the returned cancellation; behavior is identical.
 *
 * Rule (LOCKED 2026-06-27): credit is on the MANAGER-HELD BASE basis
 * (managerReceivesCents — the only cash the manager holds and can fund a future
 * redemption with, so the platform never loses its fee).
 *   - BEFORE the season starts (today < referenceStart, or no reference) →
 *     full manager-held base of ALL paid weeks, no penalty; cancel every week.
 *   - AFTER it starts → manager-held base of the REMAINING (week_start >= today)
 *     weeks × (1 − penalty%), rounded; elapsed weeks keep no credit and are not
 *     cancelled.
 *
 * D5 (Item 4): if a booth credit was already REDEEMED against this group, the
 * manager only received (gross − appliedCredit), so the cancel credit is granted
 * on the manager's NET receipts — appliedCredit is allocated to the cancelled
 * weeks in proportion to their share of the group's gross manager base. The route
 * separately RELEASES the redeemed amount back to the vendor. appliedCreditCents=0
 * → net == gross (no redemption; original behavior, unit-tested).
 */

export interface CancelCreditWeek {
  id: string
  weekStartDate: string
  priceCents: number
}

export interface CancelCreditResult {
  beforeStart: boolean
  creditCents: number
  source: 'vendor_cancel_pre' | 'vendor_cancel_post'
  idsToCancel: string[]
}

export function computeCancelCredit(
  weeks: CancelCreditWeek[],
  today: string,
  referenceStart: string | null,
  postStartPenaltyPct: number,
  appliedCreditCents = 0,
): CancelCreditResult {
  const beforeStart = !referenceStart || today < referenceStart
  const mgr = (w: CancelCreditWeek) => calculateBoothRentalFees(w.priceCents).managerReceivesCents

  // Weeks being cancelled: all before start; only not-yet-elapsed weeks after.
  const cancelledWeeks = beforeStart ? weeks : weeks.filter((w) => w.weekStartDate >= today)

  // Grant on the manager's NET receipts for the cancelled weeks (D5).
  const grossTotal = weeks.reduce((sum, w) => sum + mgr(w), 0)
  const grossCancelled = cancelledWeeks.reduce((sum, w) => sum + mgr(w), 0)
  const allocated = grossTotal > 0 ? Math.round(appliedCreditCents * (grossCancelled / grossTotal)) : 0
  const netCancelled = Math.max(0, grossCancelled - allocated)

  if (beforeStart) {
    return { beforeStart: true, creditCents: netCancelled, source: 'vendor_cancel_pre', idsToCancel: cancelledWeeks.map((w) => w.id) }
  }
  const creditCents = Math.round(netCancelled * (1 - postStartPenaltyPct / 100))
  return { beforeStart: false, creditCents, source: 'vendor_cancel_post', idsToCancel: cancelledWeeks.map((w) => w.id) }
}
