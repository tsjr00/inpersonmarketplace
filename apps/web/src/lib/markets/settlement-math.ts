/**
 * Phase E — season-end settlement math (pure; no I/O).
 *
 * Extracted from the manager settlement route so the proration rule is unit
 * testable without importing a Next route. The route imports owedForGroup from
 * here; behavior is identical.
 *
 * Rule (LOCKED 2026-06-27, "per-day proration"): when a season's cancelled
 * operating days exceed its refund_cap_days, the manager owes each affected paid
 * group the manager-held base value of the cancelled days BEYOND the cap,
 * prorated per prepaid day:
 *   perDayBase = total_manager_cents / (weekCount * activeDaysPerWeek)
 *   owedDays   = max(0, cancelledDays - refundCapDays)
 *   owedCents  = round(owedDays * perDayBase)
 * Days within the cap owe nothing; a group with no active market days owes 0
 * cash (no divide-by-zero) while still reporting owedDays for the manager.
 */
export function owedForGroup(
  totalManagerCents: number,
  weekCount: number,
  activeDaysPerWeek: number,
  cancelledDays: number,
  refundCapDays: number,
): { owedDays: number; owedCents: number } {
  const owedDays = Math.max(0, cancelledDays - refundCapDays)
  if (owedDays === 0) return { owedDays: 0, owedCents: 0 }
  const totalPrepaidDays = weekCount * activeDaysPerWeek
  if (totalPrepaidDays <= 0) return { owedDays, owedCents: 0 }
  const perDayBase = totalManagerCents / totalPrepaidDays
  return { owedDays, owedCents: Math.round(owedDays * perDayBase) }
}

/**
 * Clean-close gate (LOCKED 2026-06-27): a season may be marked 'settled' only
 * when every paid group that has a shortfall (owedDays > 0) has been resolved.
 * Groups with no shortfall don't block the close. A group is resolved when its
 * id is in resolvedIds (a season_settlement booth_credits row references it).
 */
export function isSeasonFullyResolved(
  groups: { id: string; hasShortfall: boolean }[],
  resolvedIds: Set<string>,
): boolean {
  return !groups.some((g) => g.hasShortfall && !resolvedIds.has(g.id))
}
