/**
 * The vendor Markets card as a SEQUENCE (owner 2026-09-25, OB-030 (f)) — PURE.
 *
 * Tester: "Needs a prompt to set your schedule before payment, a sequence to set
 * up a booking." Owner: order the card's buttons left → right in the order the
 * work happens, add an Apply step, and reinforce it lightly (numbers + "Next").
 *
 * THE ORDER
 *   1. Apply          — only at a MANAGED market (BR-1: approval before days).
 *   2. Set Schedule   — pick the days you attend (BR-13: before booking).
 *   3. Book a booth   — only where the market takes booth bookings online.
 *   4. Manage Listings — attach items (at a fee market they sell only in a paid week).
 *   5. Prep Sheet     — market-day tool; never "the next step".
 *
 * "Next" = the first step not yet done. A step whose done-state the page does
 * not know (bookDone === null, e.g. food-truck spot days) is numbered but never
 * marked done and never chosen as Next — it never blocks the sequence.
 * While an application is waiting on the manager, nothing after it is Next:
 * the vendor's next move is to wait (the day picker refuses until approval).
 */

export type MarketStepKey = 'apply' | 'schedule' | 'book' | 'listings' | 'prep'

export interface MarketStepInput {
  isManaged: boolean
  /** 'approved' | 'pending' | 'revoked' | null (no roster row). */
  rosterStatus: 'approved' | 'pending' | 'revoked' | null
  hasAttendance: boolean
  hasListings: boolean
  /** Market takes booth/spot bookings online (Stripe-ready). */
  bookable: boolean
  /** true/false when known; null when this page cannot tell. */
  bookDone: boolean | null
}

export interface MarketStep {
  key: MarketStepKey
  number: number
  done: boolean
  isNext: boolean
}

export interface MarketStepsResult {
  steps: MarketStep[]
  /** The Apply step exists but the manager has not decided yet. */
  awaitingApproval: boolean
  next: MarketStepKey | null
}

export function computeMarketSteps(i: MarketStepInput): MarketStepsResult {
  const raw: Array<{ key: MarketStepKey; done: boolean | null }> = []
  if (i.isManaged) raw.push({ key: 'apply', done: i.rosterStatus === 'approved' })
  raw.push({ key: 'schedule', done: i.hasAttendance })
  if (i.bookable) raw.push({ key: 'book', done: i.bookDone })
  raw.push({ key: 'listings', done: i.hasListings })
  raw.push({ key: 'prep', done: null })

  const awaitingApproval = i.isManaged && i.rosterStatus === 'pending'
  let next: MarketStepKey | null = null
  if (!awaitingApproval) {
    const first = raw.find((s) => s.done === false)
    next = first ? first.key : null
  }

  return {
    steps: raw.map((s, idx) => ({ key: s.key, number: idx + 1, done: s.done === true, isNext: s.key === next })),
    awaitingApproval,
    next,
  }
}
