/**
 * Approval skipped-days helper (mig 262, owner 2026-10-09).
 *
 * Rule: a skipped day is an ACTIVE market day for which the vendor has NO
 * vendor_market_schedules row at this market — the auto-create trigger skipped
 * it because of a conflict at another market. A row that exists but is
 * inactive is the vendor's own earlier choice and is never reported. The
 * sentence names the day and, when known, where the vendor is instead.
 */
import { describe, it, expect } from 'vitest'
import { computeSkippedDays, skippedDaysSentence } from '../approval-skipped-days'

const DAYS = [
  { id: 'sat', day_of_week: 6 },
  { id: 'wed', day_of_week: 3 },
  { id: 'sun', day_of_week: 0 },
]

describe('computeSkippedDays', () => {
  it('reports only the active days the vendor got no row for, in weekday order', () => {
    const skipped = computeSkippedDays(DAYS, [{ schedule_id: 'wed' }], [])
    expect(skipped.map((s) => [s.scheduleId, s.dayName])).toEqual([['sun', 'Sunday'], ['sat', 'Saturday']])
  })

  it('nothing skipped when every day has a row', () => {
    expect(computeSkippedDays(DAYS, [{ schedule_id: 'sat' }, { schedule_id: 'wed' }, { schedule_id: 'sun' }], [])).toEqual([])
  })

  it('a row the vendor deactivated themselves is NOT a skip (it exists)', () => {
    // The caller passes every row at the market regardless of is_active —
    // existence is the signal; ON CONFLICT DO NOTHING left that row alone.
    const skipped = computeSkippedDays(DAYS, [{ schedule_id: 'sat' }, { schedule_id: 'wed' }, { schedule_id: 'sun' }], [])
    expect(skipped).toEqual([])
  })

  it('names where the vendor is instead on that weekday, de-duplicated', () => {
    const skipped = computeSkippedDays(DAYS, [{ schedule_id: 'wed' }, { schedule_id: 'sun' }], [
      { day_of_week: 6, market_name: 'River Road Farmers Market' },
      { day_of_week: 6, market_name: 'River Road Farmers Market' },
      { day_of_week: 3, market_name: 'Somewhere Else' },
    ])
    expect(skipped).toEqual([
      { scheduleId: 'sat', dayOfWeek: 6, dayName: 'Saturday', elsewhere: ['River Road Farmers Market'] },
    ])
  })
})

describe('skippedDaysSentence', () => {
  const one = computeSkippedDays(DAYS, [{ schedule_id: 'wed' }, { schedule_id: 'sun' }], [
    { day_of_week: 6, market_name: 'River Road Farmers Market' },
  ])
  const two = computeSkippedDays(DAYS, [{ schedule_id: 'wed' }], [])

  it('is empty when nothing was skipped', () => {
    expect(skippedDaysSentence([], 'manager')).toBe('')
    expect(skippedDaysSentence([], 'vendor')).toBe('')
  })

  it('manager: names the day, where the vendor is, and what the vendor can do', () => {
    expect(skippedDaysSentence(one, 'manager')).toBe(
      'Saturday (already at River Road Farmers Market that day) was not added: the vendor is scheduled at another market at that time. They can add that day from their Markets page once they free it or declare they can staff more than one location.'
    )
  })

  it('vendor: tells them what to change and where', () => {
    const s = skippedDaysSentence(one, 'vendor')
    expect(s).toContain('Saturday (already at River Road Farmers Market that day) was not added because you\'re scheduled at another market at that time.')
    expect(s).toContain('tick "I can staff more than one location at the same time" in your profile')
    expect(s).toContain('on your Markets page')
  })

  it('two days read as a list with plural wording', () => {
    const s = skippedDaysSentence(two, 'manager')
    expect(s.startsWith('Sunday and Saturday were not added')).toBe(true)
    expect(s).toContain('those days')
  })
})
