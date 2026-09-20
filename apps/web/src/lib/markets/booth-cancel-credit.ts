import type { SupabaseClient } from '@supabase/supabase-js'
import { observed } from '@/lib/errors'
import { calculateBoothRentalFees } from '@/lib/pricing'

/**
 * FM booth-week cancellation credits (owner rulings 2026-09-19 — design
 * apps/web/.claude/booth_model_design.md BR-9 / BR-10 / §6-3). Mirrors the FT
 * park-date-cancel model (mig 201) on the FM WEEK, with the owner's three caps:
 *
 *   (a) credit only for days the vendor was SCHEDULED to attend that week — the
 *       market's operating days in the week that the vendor's DECLARATION
 *       (vendor_market_schedules) covers;
 *   (b) never for a day already past — a manager cancelling a paid week after
 *       Wednesday was attended credits only the remaining declared days;
 *   (c) total credits on one booking never exceed what the vendor paid.
 *
 * Per-day share = vendorPaysCents ÷ declared operating days in that week.
 * Owner's example: 3 possible days, vendor declared 2 → a full-week cancel pays
 * 2/2; after attending one → 1/2. BR-13 makes "no declared days" impossible for
 * bookings made after 2026-09-19; older rows fall back to the market's operating
 * days so a paid week is never credited $0 for want of a declaration.
 *
 * Money is CREDIT, never cash (mig 166 rationale — the manager already holds it).
 */

/** Sunday..Saturday dates of the week a rental covers. */
export function weekDates(weekStartSunday: string): string[] {
  const [y, m, d] = weekStartSunday.split('-').map(Number)
  const out: string[] = []
  for (let i = 0; i < 7; i++) {
    out.push(new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10))
  }
  return out
}

/** The market's operating dates in the week that this vendor DECLARED (a). */
export async function declaredDatesForWeek(
  service: SupabaseClient,
  input: { marketId: string; vendorProfileId: string; weekStartSunday: string },
): Promise<string[]> {
  const [{ data: sched }, { data: mine }] = await Promise.all([
    observed(service
      .from('market_schedules')
      .select('id, day_of_week')
      .eq('market_id', input.marketId)
      .eq('active', true), { table: 'market_schedules' }),
    observed(service
      .from('vendor_market_schedules')
      .select('schedule_id')
      .eq('market_id', input.marketId)
      .eq('vendor_profile_id', input.vendorProfileId)
      .eq('is_active', true), { table: 'vendor_market_schedules' }),
  ])
  const declaredScheduleIds = new Set((mine ?? []).map((r) => r.schedule_id as string))
  const marketDows = (sched ?? []).map((s) => ({ id: s.id as string, dow: s.day_of_week as number }))
  // Pre-BR-13 rows may have no declaration: fall back to every operating day.
  const dows = new Set(
    (declaredScheduleIds.size > 0 ? marketDows.filter((s) => declaredScheduleIds.has(s.id)) : marketDows).map((s) => s.dow)
  )
  return weekDates(input.weekStartSunday).filter((date) => {
    const [y, m, d] = date.split('-').map(Number)
    return dows.has(new Date(Date.UTC(y, m - 1, d)).getUTCDay())
  })
}

/** What the vendor paid for the week (their side of the fee split). */
export function vendorPaidCents(priceCents: number): number {
  return calculateBoothRentalFees(priceCents).vendorPaysCents
}

/** Share of the week for one declared day; 0 when nothing was declared. */
export function perDayShareCents(vendorPaid: number, declaredDayCount: number): number {
  if (declaredDayCount <= 0) return 0
  return Math.round(vendorPaid / declaredDayCount)
}

/** Credits already granted on this booking for cancellations (cap (c)). */
export async function cancellationCreditsGranted(service: SupabaseClient, rentalId: string): Promise<number> {
  const { data } = await observed(service
    .from('booth_credits')
    .select('amount_cents')
    .eq('related_rental_id', rentalId)
    .in('source', ['fm_date_cancel', 'manager_week_cancel'])
    .gt('amount_cents', 0), { table: 'booth_credits' })
  return (data ?? []).reduce((sum, r) => sum + (r.amount_cents as number), 0)
}

/** Apply cap (c): never more in total than the vendor paid. */
export function capCredit(requested: number, vendorPaid: number, alreadyGranted: number): number {
  return Math.max(0, Math.min(requested, vendorPaid - alreadyGranted))
}
