/**
 * "Continue payment" for a pending booth week — the rules are the spec
 * (owner 2026-09-25, OB-030 D1 + ruling (a)):
 *  - an OPEN Stripe page → back to that same page (never a second session);
 *  - Stripe says COMPLETE → the money is in, nothing is released;
 *  - an EXPIRED page → the unpaid booking is released so the week can be rebooked;
 *  - a paid week, a cancelled row, a season week, or a row that never reached
 *    Stripe is never resumed or released here.
 */
import { describe, it, expect } from 'vitest'
import { precheckPendingRental, decideFromSession } from '../pending-booth-rental'

const pending = { status: 'pending_payment', groupId: null, sessionId: 'cs_test_1' }

describe('precheckPendingRental — which rows may continue', () => {
  it('a pending one-off week with a Stripe page goes on to ask Stripe', () => {
    expect(precheckPendingRental(pending)).toBeNull()
  })
  it('a PAID week is reported as paid and never released', () => {
    expect(precheckPendingRental({ ...pending, status: 'paid' })).toEqual({ action: 'already_paid' })
  })
  it('a cancelled week is refused', () => {
    expect(precheckPendingRental({ ...pending, status: 'cancelled' })).toMatchObject({ action: 'refuse', status: 409 })
  })
  it('a season week is refused (seasons have their own flow)', () => {
    expect(precheckPendingRental({ ...pending, groupId: 'grp-1' })).toMatchObject({ action: 'refuse', status: 409 })
  })
  it('a row that never reached Stripe is refused, not released', () => {
    expect(precheckPendingRental({ ...pending, sessionId: null })).toMatchObject({ action: 'refuse', status: 409 })
  })
})

describe('decideFromSession — what Stripe says decides', () => {
  it('open page → resume at the SAME url', () => {
    expect(decideFromSession({ status: 'open', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }))
      .toEqual({ action: 'resume', checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1' })
  })
  it('complete → confirming; the booking is never released', () => {
    expect(decideFromSession({ status: 'complete', url: null })).toEqual({ action: 'confirming' })
  })
  it('expired → release', () => {
    expect(decideFromSession({ status: 'expired', url: null })).toEqual({ action: 'release' })
  })
  it('open but no url, or an unknown status → refuse (try again), never release', () => {
    expect(decideFromSession({ status: 'open', url: null })).toMatchObject({ action: 'refuse' })
    expect(decideFromSession({ status: null, url: null })).toMatchObject({ action: 'refuse' })
  })
})
