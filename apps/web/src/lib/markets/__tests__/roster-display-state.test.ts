import { describe, it, expect } from 'vitest'
import { rosterDisplayState } from '../roster-display-state'

/**
 * Owner rulings 2026-09-27 (tester OB-034, TR-133): which ONE control a logged-in
 * vendor sees at the top of a market page. The expected values come from the
 * owner's table, not from the code.
 */
describe('market page header control by roster state (owner 2026-09-27, TR-133)', () => {
  const row = (over: Partial<{ approved: boolean | null; revoked_at: string | null; response_status: string | null }>) => ({
    approved: false,
    revoked_at: null,
    response_status: null,
    ...over,
  })

  it('never applied → "Apply now"', () => {
    expect(rosterDisplayState(null, false)).toBe('apply')
  })

  it('applied, manager has not decided → "Applied" pill', () => {
    expect(rosterDisplayState(row({}), false)).toBe('applied')
  })

  it('invited by the manager, has not answered → "Applied" pill (owner case 2)', () => {
    expect(rosterDisplayState(row({ response_status: 'invited' }), false)).toBe('applied')
  })

  it('approved at a market → "Book now"', () => {
    expect(rosterDisplayState(row({ approved: true }), false)).toBe('book')
    expect(rosterDisplayState(row({ approved: true, response_status: 'accepted' }), false)).toBe('book')
  })

  it('approved at an EVENT → "Applied" pill, never "Book now" (owner case 4: events do not book weeks)', () => {
    expect(rosterDisplayState(row({ approved: true }), true)).toBe('applied')
  })

  it('removed by the manager → nothing (owner case 1)', () => {
    expect(rosterDisplayState(row({ revoked_at: '2026-09-27T00:00:00Z' }), false)).toBe('hidden')
  })

  it('declined the manager\'s invitation → nothing (owner case 3)', () => {
    expect(rosterDisplayState(row({ response_status: 'declined' }), false)).toBe('hidden')
  })

  it('approval wins over a stale revoked_at (admin re-approval leaves the stamp)', () => {
    expect(rosterDisplayState(row({ approved: true, revoked_at: '2026-09-01T00:00:00Z' }), false)).toBe('book')
  })
})
