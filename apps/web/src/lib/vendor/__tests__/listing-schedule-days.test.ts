/**
 * Listing save → market days, one at a time (owner 2026-10-09).
 * A day the conflict trigger refuses is skipped and named to the vendor;
 * the rule text comes from the manager-side sentence of mig 262.
 */
import { describe, it, expect } from 'vitest'
import { conflictMarketName, isScheduleConflictError, skippedListingDaysNotice } from '../listing-schedule-days'

const MSG = 'Schedule conflict: overlapping times with "River Road Farmers Market" on the same day. Deactivate the other schedule first, or declare in your profile that you can staff more than one location at the same time.'

describe('conflictMarketName', () => {
  it('pulls the other market out of the trigger message', () => {
    expect(conflictMarketName(MSG)).toBe('River Road Farmers Market')
  })
  it('null when the message has no market', () => {
    expect(conflictMarketName('something else')).toBeNull()
    expect(conflictMarketName(null)).toBeNull()
  })
})

describe('isScheduleConflictError', () => {
  it('recognises the mig-262 code and, on an older environment, the message', () => {
    expect(isScheduleConflictError({ code: 'P0020', message: 'anything' })).toBe(true)
    expect(isScheduleConflictError({ code: 'P0001', message: MSG })).toBe(true)
  })
  it('anything else is not a conflict', () => {
    expect(isScheduleConflictError({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isScheduleConflictError(null)).toBe(false)
  })
})

describe('skippedListingDaysNotice', () => {
  it('empty when nothing was skipped', () => {
    expect(skippedListingDaysNotice([])).toBe('')
  })
  it('one day names the market, the day and where the vendor is instead', () => {
    expect(skippedListingDaysNotice([{ marketName: 'Market 2 Test', dayOfWeek: 6, conflictWith: 'River Road Farmers Market' }])).toBe(
      'Saved. This day was not added: Saturday at Market 2 Test because you\'re already at River Road Farmers Market then. To attend it too, free the other schedule or tick "I can staff more than one location at the same time" in your profile, then add the day on your Markets page.'
    )
  })
  it('several days at one market read as a list in weekday order; no named market falls back to a plain reason', () => {
    const s = skippedListingDaysNotice([
      { marketName: 'Market 2 Test', dayOfWeek: 6, conflictWith: null },
      { marketName: 'Market 2 Test', dayOfWeek: 3, conflictWith: null },
    ])
    expect(s.startsWith('Saved. These days were not added: Wednesday and Saturday at Market 2 Test because you\'re scheduled at another market at that time.')).toBe(true)
    expect(s).toContain('add the days on your Markets page')
  })
  it('two markets are separated with a semicolon', () => {
    const s = skippedListingDaysNotice([
      { marketName: 'A', dayOfWeek: 1, conflictWith: 'X' },
      { marketName: 'B', dayOfWeek: 2, conflictWith: 'Y' },
    ])
    expect(s).toContain('Monday at A because you\'re already at X then; Tuesday at B because you\'re already at Y then.')
  })
})
