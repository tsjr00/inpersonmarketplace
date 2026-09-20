import { describe, it, expect } from 'vitest'
import { weekDates, perDayShareCents, capCredit, vendorPaidCents } from '@/lib/markets/booth-cancel-credit'
import { calculateBoothRentalFees } from '@/lib/pricing'

/**
 * Booth-week cancellation credit math — owner rulings 2026-09-19 (BR-9/BR-10,
 * booth_model_design.md §6-3). Expected values come from the RULING, not the
 * code: "apply the FT rule to the FM week — but make sure vendors can't get
 * credit back for more than they paid or can't get credit for days they were
 * not scheduled to be there. If they had 3 days potential to schedule for, and
 * they only chose 2, cancelling the week should only pay them 2, or 1 if they
 * already attended one of the scheduled days."
 */
describe('Booth cancellation credit (BR-9/BR-10, owner 2026-09-19)', () => {
  it('a week is the Sunday and the six days after it', () => {
    expect(weekDates('2026-10-04')).toEqual([
      '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10',
    ])
  })

  it("the per-day share divides what the vendor paid by the days they DECLARED, not the market's days", () => {
    // Owner's example: 3 possible days, vendor chose 2 → each cancelled day is half.
    expect(perDayShareCents(10000, 2)).toBe(5000)
    expect(perDayShareCents(10000, 3)).toBe(3333)
    expect(perDayShareCents(10000, 0), 'nothing declared → nothing per day').toBe(0)
  })

  it('a full-week cancel with 2 declared days pays 2/2; after attending one, 1/2', () => {
    const paid = 8000
    const share = perDayShareCents(paid, 2)
    expect(share * 2).toBe(paid)          // both days still ahead
    expect(share * 1).toBe(paid / 2)      // one already attended
  })

  it('total credits on a booking never exceed what the vendor paid (cap c)', () => {
    expect(capCredit(5000, 10000, 0)).toBe(5000)
    expect(capCredit(5000, 10000, 7000), 'second day capped to the remainder').toBe(3000)
    expect(capCredit(5000, 10000, 10000), 'already made whole → 0').toBe(0)
    expect(capCredit(5000, 10000, 12000), 'never negative').toBe(0)
  })

  it("what the vendor paid is their side of the fee split from pricing.ts (single source of truth)", () => {
    expect(vendorPaidCents(10000)).toBe(calculateBoothRentalFees(10000).vendorPaysCents)
  })
})
