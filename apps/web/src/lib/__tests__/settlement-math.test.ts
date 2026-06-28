/**
 * Phase E — season-end settlement math (Layer 1, pure/deterministic).
 *
 * IMPORTANT: These tests assert what the BUSINESS RULE requires, not what the
 * code currently returns. If a test fails, fix the code — do NOT change the
 * expectation to match it. See CLAUDE.md ABSOLUTE RULE 2.
 *
 * Rules under test (LOCKED 2026-06-27):
 *  - Per-day proration: owed = max(0, cancelledDays − refundCapDays)
 *      × (total_manager_cents ÷ (weekCount × activeDaysPerWeek)), rounded.
 *      Days within the cap owe nothing; no active days ⇒ $0 owed (no div-by-zero).
 *  - Cancelled-day count: a cancelled date counts only if its Sunday-week is one
 *      the group bought AND it falls on/after the group's purchase_date.
 */
import { describe, it, expect } from 'vitest'
import { owedForGroup, isSeasonFullyResolved } from '@/lib/markets/settlement-math'
import { computeCancelledDays } from '@/lib/markets/cancelled-days'

// $25.00/week booth ⇒ manager-held base $23.37 (2337¢) per week (pricing.ts).
const PER_WEEK_MANAGER = 2337

describe('owedForGroup — per-day proration (LOCKED 2026-06-27)', () => {
  // 17-week season, 1 market day/week ⇒ perDayBase = total ÷ (17 × 1) = $23.37.
  const total17 = PER_WEEK_MANAGER * 17 // 39_729

  it('owes nothing when cancelled days are within the cap', () => {
    expect(owedForGroup(total17, 17, 1, 1, 1)).toEqual({ owedDays: 0, owedCents: 0 })
  })

  it('owes nothing when no days were cancelled', () => {
    expect(owedForGroup(total17, 17, 1, 0, 1)).toEqual({ owedDays: 0, owedCents: 0 })
  })

  it('owes nothing when cancelled days are below the cap', () => {
    expect(owedForGroup(total17, 17, 1, 1, 2)).toEqual({ owedDays: 0, owedCents: 0 })
  })

  it('prorates the days BEYOND the cap at the per-day base (3 cancelled, cap 1 ⇒ 2 × $23.37 = $46.74)', () => {
    expect(owedForGroup(total17, 17, 1, 3, 1)).toEqual({ owedDays: 2, owedCents: 4674 })
  })

  it('owes $0 cash but still reports owedDays when the market has no active days (no divide-by-zero)', () => {
    expect(owedForGroup(total17, 17, 0, 3, 1)).toEqual({ owedDays: 2, owedCents: 0 })
  })

  it('prorates per market-day for multi-day weeks and rounds (10 wks × 2 days, 4 cancelled, cap 1 ⇒ 3 × $11.685 = $35.06)', () => {
    const total10 = PER_WEEK_MANAGER * 10 // 23_370; perDayBase = ÷20 = 1168.5
    expect(owedForGroup(total10, 10, 2, 4, 1)).toEqual({ owedDays: 3, owedCents: 3506 })
  })
})

describe('computeCancelledDays — counts cancelled days the group prepaid for', () => {
  // 2026-05-03 and 2026-05-10 are Sundays (week-start anchors the group bought).
  const boughtWeeks = ['2026-05-03', '2026-05-10']

  it('counts a cancelled date whose Sunday-week the group bought', () => {
    expect(computeCancelledDays(boughtWeeks, ['2026-05-06'], '2026-04-01')).toBe(1)
  })

  it('does NOT count a cancelled date in a week the group did not buy', () => {
    expect(computeCancelledDays(boughtWeeks, ['2026-05-17'], '2026-04-01')).toBe(0)
  })

  it('does NOT count a date cancelled before the purchase date (late-buyer cutoff)', () => {
    expect(computeCancelledDays(boughtWeeks, ['2026-05-06'], '2026-05-10')).toBe(0)
  })

  it('counts every in-week cancellation when there is no purchase-date cutoff', () => {
    expect(computeCancelledDays(boughtWeeks, ['2026-05-03', '2026-05-10'], null)).toBe(2)
  })

  it('buckets a mid-week cancelled date to its prior Sunday', () => {
    // 2026-05-09 is a Saturday ⇒ buckets to Sunday 2026-05-03, which the group bought.
    expect(computeCancelledDays(boughtWeeks, ['2026-05-09'], '2026-04-01')).toBe(1)
  })
})

describe('isSeasonFullyResolved — clean-close gate (LOCKED 2026-06-27)', () => {
  it('is resolved when there are no groups', () => {
    expect(isSeasonFullyResolved([], new Set())).toBe(true)
  })

  it('is resolved when no group has a shortfall (cancelled days within cap)', () => {
    const groups = [{ id: 'a', hasShortfall: false }, { id: 'b', hasShortfall: false }]
    expect(isSeasonFullyResolved(groups, new Set())).toBe(true)
  })

  it('is NOT resolved while a shortfall group is unresolved', () => {
    const groups = [{ id: 'a', hasShortfall: true }]
    expect(isSeasonFullyResolved(groups, new Set())).toBe(false)
  })

  it('is resolved once the shortfall group has a settlement row', () => {
    const groups = [{ id: 'a', hasShortfall: true }]
    expect(isSeasonFullyResolved(groups, new Set(['a']))).toBe(true)
  })

  it('is NOT resolved when one shortfall is resolved but another is not', () => {
    const groups = [{ id: 'a', hasShortfall: true }, { id: 'b', hasShortfall: true }]
    expect(isSeasonFullyResolved(groups, new Set(['a']))).toBe(false)
  })

  it('ignores an unresolved group that has no shortfall', () => {
    const groups = [{ id: 'a', hasShortfall: true }, { id: 'b', hasShortfall: false }]
    expect(isSeasonFullyResolved(groups, new Set(['a']))).toBe(true)
  })
})
