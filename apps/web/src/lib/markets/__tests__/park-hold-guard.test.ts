import { describe, it, expect } from 'vitest'
import { datesBlockedByHolds, heldSpotMessage, type StandingHoldRow } from '../park-hold-guard'

/**
 * F1 (booth_model_design.md §7, owner 2026-09-19/20): a one-off spot booking
 * respects another truck's ACTIVE recurring hold on that spot + weekday until
 * the anchor forfeits the date. The rules the pure half must hold:
 */

// 2026-09-26 is a Saturday, 2026-09-23 a Wednesday.
const SAT_HOLD: StandingHoldRow = { id: 'h1', vendor_profile_id: 'anchor', spot_id: 'A', day_of_week: 6, status: 'active', requested_start_date: null }

describe('datesBlockedByHolds (F1-1)', () => {
  it('blocks another truck on the held weekday only', () => {
    const out = datesBlockedByHolds(['2026-09-23', '2026-09-26', '2026-10-03'], [SAT_HOLD], 'A', 'other')
    expect(out.map((c) => c.date)).toEqual(['2026-09-26', '2026-10-03'])
    expect(out[0]).toMatchObject({ holdId: 'h1', holderVendorId: 'anchor' })
  })
  it('never blocks the anchor booking their own spot early', () => {
    expect(datesBlockedByHolds(['2026-09-26'], [SAT_HOLD], 'A', 'anchor')).toEqual([])
  })
  it('a hold on a different spot does not block', () => {
    expect(datesBlockedByHolds(['2026-09-26'], [SAT_HOLD], 'B', 'other')).toEqual([])
  })
  it('a requested (not yet approved) or suspended hold does not block', () => {
    expect(datesBlockedByHolds(['2026-09-26'], [{ ...SAT_HOLD, status: 'requested' }], 'A', 'other')).toEqual([])
    expect(datesBlockedByHolds(['2026-09-26'], [{ ...SAT_HOLD, status: 'suspended' }], 'A', 'other')).toEqual([])
  })
  it('respects the hold\'s requested start date (dates before it are open)', () => {
    const later: StandingHoldRow = { ...SAT_HOLD, requested_start_date: '2026-10-01' }
    expect(datesBlockedByHolds(['2026-09-26', '2026-10-03'], [later], 'A', 'other').map((c) => c.date)).toEqual(['2026-10-03'])
  })
})

describe('heldSpotMessage', () => {
  it('names the weekday and the prepay cutoff, and offers the way out', () => {
    const msg = heldSpotMessage('Spot A', '2026-09-26')
    expect(msg).toMatch(/^Spot A is held by a recurring truck on Saturdays\./)
    expect(msg).toContain('2026-09-24') // Thursday-before cutoff (PARK_STANDING_PREPAY_CUTOFF_DAYS = 2)
    expect(msg).toMatch(/pick another spot/)
  })
})
