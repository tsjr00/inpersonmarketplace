/**
 * The vendor Markets card sequence — the owner's order is the spec
 * (2026-09-25, OB-030 (f)): Apply (managed only) → Set Schedule → Book (where
 * online booking exists) → Manage Listings → Prep Sheet; "Next" = the first
 * step not done; nothing is Next while an application waits on the manager.
 */
import { describe, it, expect } from 'vitest'
import { computeMarketSteps, type MarketStepInput } from '../market-steps'

const base: MarketStepInput = {
  isManaged: true, rosterStatus: null, hasAttendance: false, hasListings: false, bookable: true, bookDone: false,
}
const keys = (i: MarketStepInput) => computeMarketSteps(i).steps.map((s) => s.key)

describe('order', () => {
  it('managed + bookable market: Apply, Schedule, Book, Listings, Prep — numbered 1..5', () => {
    const r = computeMarketSteps(base)
    expect(r.steps.map((s) => [s.key, s.number])).toEqual([['apply', 1], ['schedule', 2], ['book', 3], ['listings', 4], ['prep', 5]])
  })
  it('a market with no manager has no Apply step', () => {
    expect(keys({ ...base, isManaged: false })).toEqual(['schedule', 'book', 'listings', 'prep'])
  })
  it('a market without online booking has no Book step', () => {
    expect(keys({ ...base, isManaged: false, bookable: false })).toEqual(['schedule', 'listings', 'prep'])
  })
})

describe('next step', () => {
  it('not applied yet → Apply is next', () => {
    expect(computeMarketSteps(base).next).toBe('apply')
  })
  it('application waiting on the manager → nothing is next', () => {
    const r = computeMarketSteps({ ...base, rosterStatus: 'pending' })
    expect(r.awaitingApproval).toBe(true)
    expect(r.next).toBeNull()
    expect(r.steps.some((s) => s.isNext)).toBe(false)
  })
  it('revoked → Apply is next again (not approved)', () => {
    expect(computeMarketSteps({ ...base, rosterStatus: 'revoked' }).next).toBe('apply')
  })
  it('approved → Set Schedule; then Book; then Listings', () => {
    expect(computeMarketSteps({ ...base, rosterStatus: 'approved' }).next).toBe('schedule')
    expect(computeMarketSteps({ ...base, rosterStatus: 'approved', hasAttendance: true }).next).toBe('book')
    expect(computeMarketSteps({ ...base, rosterStatus: 'approved', hasAttendance: true, bookDone: true }).next).toBe('listings')
  })
  it('everything done → no next step; Prep is never next', () => {
    const r = computeMarketSteps({ ...base, rosterStatus: 'approved', hasAttendance: true, bookDone: true, hasListings: true })
    expect(r.next).toBeNull()
    expect(r.steps.find((s) => s.key === 'prep')!.done).toBe(false)
  })
  it('an unknown booking state never blocks: Listings becomes next', () => {
    const r = computeMarketSteps({ ...base, isManaged: false, hasAttendance: true, bookDone: null })
    expect(r.next).toBe('listings')
    expect(r.steps.find((s) => s.key === 'book')).toMatchObject({ done: false, isNext: false })
  })
  it('done flags follow the inputs', () => {
    const r = computeMarketSteps({ ...base, rosterStatus: 'approved', hasAttendance: true })
    expect(r.steps.filter((s) => s.done).map((s) => s.key)).toEqual(['apply', 'schedule'])
  })
})
