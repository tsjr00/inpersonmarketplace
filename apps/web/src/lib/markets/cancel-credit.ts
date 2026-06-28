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
): CancelCreditResult {
  const beforeStart = !referenceStart || today < referenceStart

  if (beforeStart) {
    // Manager-held base value of all paid weeks (the manager funds redemption from this).
    const creditCents = weeks.reduce((sum, w) => sum + calculateBoothRentalFees(w.priceCents).managerReceivesCents, 0)
    return { beforeStart: true, creditCents, source: 'vendor_cancel_pre', idsToCancel: weeks.map((w) => w.id) }
  }

  // Remaining (not-yet-elapsed) weeks → manager-held base value minus penalty.
  const remaining = weeks.filter((w) => w.weekStartDate >= today)
  const remainingValue = remaining.reduce((sum, w) => sum + calculateBoothRentalFees(w.priceCents).managerReceivesCents, 0)
  const creditCents = Math.round(remainingValue * (1 - postStartPenaltyPct / 100))
  return { beforeStart: false, creditCents, source: 'vendor_cancel_post', idsToCancel: remaining.map((w) => w.id) }
}
