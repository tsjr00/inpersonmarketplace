import { describe, it, expect } from 'vitest'
import { bucketRosterRows, isInvitedAwaiting, isPendingApproval } from '../roster-buckets'

/**
 * Owner rulings 2026-09-27 (tester OB-034, TR-107/TR-140): "pending your approval"
 * counts only trucks the manager can act on; an invited truck that has not
 * answered is its own line; a truck that declined is neither. Expected values
 * come from the owner's rulings, not from the code.
 */
describe('manager roster buckets (owner 2026-09-27, TR-107/TR-140)', () => {
  const row = (over: Partial<{ approved: boolean | null; revoked_at: string | null; response_status: string | null }>) => ({
    approved: false,
    revoked_at: null,
    response_status: null,
    ...over,
  })

  it('a vendor who applied and is waiting → pending approval', () => {
    expect(isPendingApproval(row({}))).toBe(true)
    expect(isInvitedAwaiting(row({}))).toBe(false)
  })

  it('invited by the manager, no answer yet → invited-waiting, NOT pending approval (TR-107)', () => {
    const r = row({ response_status: 'invited' })
    expect(isPendingApproval(r)).toBe(false)
    expect(isInvitedAwaiting(r)).toBe(true)
  })

  it('declined the invitation → neither (owner ruling a)', () => {
    const r = row({ response_status: 'declined' })
    expect(isPendingApproval(r)).toBe(false)
    expect(isInvitedAwaiting(r)).toBe(false)
  })

  it('removed by the manager → neither (mig 217 rule kept)', () => {
    const r = row({ revoked_at: '2026-09-27T00:00:00Z' })
    expect(isPendingApproval(r)).toBe(false)
    expect(isInvitedAwaiting(r)).toBe(false)
  })

  it('approved → neither, whatever the invitation answer was', () => {
    expect(isPendingApproval(row({ approved: true }))).toBe(false)
    expect(isPendingApproval(row({ approved: true, response_status: 'declined' }))).toBe(false)
    expect(isInvitedAwaiting(row({ approved: true, response_status: 'invited' }))).toBe(false)
  })

  it('a mixed roster counts each bucket once (the tester\'s park: one invited, one applied, one declined, one approved)', () => {
    expect(bucketRosterRows([
      row({ response_status: 'invited' }),
      row({}),
      row({ response_status: 'declined' }),
      row({ approved: true, response_status: 'accepted' }),
    ])).toEqual({ pendingApproval: 1, invitedAwaiting: 1 })
  })
})
