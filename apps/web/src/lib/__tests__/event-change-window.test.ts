import { describe, it, expect } from 'vitest'
import {
  BLOCK_FLOOR_HOURS,
  RECONFIRM_RUNWAY_HOURS,
  RECONFIRM_TIME_SHIFT_MINUTES,
  blockStartHoursBeforeEvent,
  hoursUntilEvent,
  evaluateChangeWindow,
  changeRequiresReconfirmation,
  describeTimeUntil,
} from '../events/change-window'

describe('the thresholds themselves', () => {
  // Owner decisions, 2026-08-09. A failure here is a decision point, not a
  // number to update.
  it('attendees get a 72-hour floor to answer', () => {
    expect(BLOCK_FLOOR_HOURS).toBe(72)
  })

  it('a change can never land within 24 hours of the refund deadline', () => {
    expect(RECONFIRM_RUNWAY_HOURS).toBe(24)
  })

  it('a start time moving under 30 minutes does not disturb anyone', () => {
    expect(RECONFIRM_TIME_SHIFT_MINUTES).toBe(30)
  })
})

describe('blockStartHoursBeforeEvent', () => {
  // THE RULE: whichever is later — the floor, or the cutoff plus a runway.
  // Using the cutoff alone was rejected because at the long end the block would
  // engage exactly when ordering closes, leaving zero re-confirmation runway.
  it('uses the floor for the default 24h cutoff', () => {
    expect(blockStartHoursBeforeEvent(24)).toBe(72)
  })

  it('still uses the floor at 48h, where cutoff+runway is smaller', () => {
    expect(blockStartHoursBeforeEvent(48)).toBe(72)
  })

  it('a long cutoff pushes the block EARLIER, never later', () => {
    expect(blockStartHoursBeforeEvent(168)).toBe(192)
    expect(blockStartHoursBeforeEvent(96)).toBe(120)
  })

  it('never returns a window that leaves zero runway — the bug this replaced', () => {
    // For every legal cutoff, the gap between the block and the refund deadline
    // must be at least the runway. If this fails, a change could be legal at the
    // exact moment unconfirmed orders refund.
    for (let cutoff = 12; cutoff <= 168; cutoff++) {
      const gap = blockStartHoursBeforeEvent(cutoff) - cutoff
      expect(gap, `cutoff ${cutoff}`).toBeGreaterThanOrEqual(RECONFIRM_RUNWAY_HOURS)
    }
  })

  it('treats a missing cutoff as the 24h default', () => {
    expect(blockStartHoursBeforeEvent(null)).toBe(blockStartHoursBeforeEvent(24))
    expect(blockStartHoursBeforeEvent(undefined)).toBe(blockStartHoursBeforeEvent(24))
  })

  it('clamps a corrupt value the way approval does, rather than trusting it', () => {
    expect(blockStartHoursBeforeEvent(-500)).toBe(blockStartHoursBeforeEvent(12))
    expect(blockStartHoursBeforeEvent(99999)).toBe(blockStartHoursBeforeEvent(168))
    expect(blockStartHoursBeforeEvent(NaN)).toBe(blockStartHoursBeforeEvent(24))
  })
})

describe('hoursUntilEvent', () => {
  const CHI = 'America/Chicago'

  it('measures forward to the start time', () => {
    // 2026-08-20 12:00 Chicago = 17:00 UTC (CDT, UTC-5)
    const now = new Date('2026-08-20T17:00:00Z')
    expect(hoursUntilEvent('2026-08-21', '12:00:00', CHI, now)).toBeCloseTo(24, 1)
  })

  it('goes negative once the event has started', () => {
    const now = new Date('2026-08-20T17:00:00Z')
    const h = hoursUntilEvent('2026-08-20', '10:00:00', CHI, now)
    expect(h).not.toBeNull()
    expect(h!).toBeLessThan(0)
  })

  it('treats a missing start time as midnight — erring toward blocking sooner', () => {
    const now = new Date('2026-08-20T17:00:00Z')
    const withTime = hoursUntilEvent('2026-08-25', '12:00:00', CHI, now)!
    const without = hoursUntilEvent('2026-08-25', null, CHI, now)!
    expect(without).toBeLessThan(withTime)
  })

  it('returns null rather than guessing at an unusable date', () => {
    const now = new Date('2026-08-20T17:00:00Z')
    expect(hoursUntilEvent(null, '12:00:00', CHI, now)).toBeNull()
    expect(hoursUntilEvent('not-a-date', '12:00:00', CHI, now)).toBeNull()
  })
})

describe('evaluateChangeWindow', () => {
  const CHI = 'America/Chicago'
  const now = new Date('2026-08-01T17:00:00Z') // noon Chicago

  const at = (date: string) =>
    evaluateChangeWindow(
      { eventDate: date, eventStartTime: '12:00:00', timezone: CHI, cutoffHours: 24 },
      now
    )

  it('is open well ahead of the block', () => {
    expect(at('2026-08-20').state).toBe('open')
  })

  it('is blocked inside 72 hours', () => {
    expect(at('2026-08-03').state).toBe('blocked') // 48h out
    expect(at('2026-08-02').state).toBe('blocked') // 24h out
  })

  it('is open just outside the block and blocked just inside it', () => {
    // Block at 72h → 2026-08-04 12:00 is exactly 72h out.
    expect(at('2026-08-05').state).toBe('open') // 96h
    expect(at('2026-08-04').state).toBe('blocked') // exactly 72h — inclusive
  })

  it('reports a past event as past, not blocked', () => {
    expect(at('2026-07-30').state).toBe('past')
  })

  it('says unknown rather than guessing when the date is unusable', () => {
    expect(
      evaluateChangeWindow(
        { eventDate: null, eventStartTime: null, timezone: CHI, cutoffHours: 24 },
        now
      ).state
    ).toBe('unknown')
  })

  it('a long cutoff blocks earlier than the floor would', () => {
    const r = evaluateChangeWindow(
      { eventDate: '2026-08-08', eventStartTime: '12:00:00', timezone: CHI, cutoffHours: 168 },
      now
    )
    expect(r.blockAtHours).toBe(192)
    expect(r.state).toBe('blocked') // 168h out, inside a 192h block
  })
})

describe('changeRequiresReconfirmation', () => {
  const base = {
    event_date: '2026-08-20',
    address: '12 Main St',
    event_start_time: '11:00:00',
  }

  it('a date change always counts', () => {
    expect(changeRequiresReconfirmation(base, { event_date: '2026-08-21' })).toBe(true)
  })

  it('an address change always counts', () => {
    expect(changeRequiresReconfirmation(base, { address: '99 Other Rd' })).toBe(true)
  })

  it('ignores whitespace and casing in the address — that is not a move', () => {
    expect(changeRequiresReconfirmation(base, { address: '  12 main st ' })).toBe(false)
  })

  it('ignores a small time shift', () => {
    expect(changeRequiresReconfirmation(base, { event_start_time: '11:15:00' })).toBe(false)
    expect(changeRequiresReconfirmation(base, { event_start_time: '10:45:00' })).toBe(false)
  })

  it('counts a shift of exactly the threshold, and anything larger', () => {
    expect(changeRequiresReconfirmation(base, { event_start_time: '11:30:00' })).toBe(true)
    expect(changeRequiresReconfirmation(base, { event_start_time: '10:30:00' })).toBe(true)
    expect(changeRequiresReconfirmation(base, { event_start_time: '15:00:00' })).toBe(true)
  })

  it('ignores fields an attendee never agreed to', () => {
    // Budget notes and dietary preferences are none of the attendee's business.
    // Asking them to re-confirm over one would burn the only attention we get.
    expect(changeRequiresReconfirmation(base, {})).toBe(false)
  })

  it('does not fire when a field is present but unchanged', () => {
    expect(changeRequiresReconfirmation(base, { event_date: '2026-08-20' })).toBe(false)
    expect(changeRequiresReconfirmation(base, { event_start_time: '11:00:00' })).toBe(false)
  })
})

describe('describeTimeUntil', () => {
  it('reads naturally at each scale', () => {
    expect(describeTimeUntil(0.5)).toBe('less than an hour')
    expect(describeTimeUntil(1)).toBe('1 hour')
    expect(describeTimeUntil(5)).toBe('5 hours')
    expect(describeTimeUntil(24)).toBe('1 day')
    expect(describeTimeUntil(72)).toBe('3 days')
  })
})
