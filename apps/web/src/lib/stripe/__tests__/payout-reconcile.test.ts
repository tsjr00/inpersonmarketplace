import { describe, it, expect, vi } from 'vitest'

// Controllable stripe.transfers.retrieve. The helper imports { stripe } from
// '@/lib/stripe/config', so we mock that module. We use a PLAIN function bound to
// a mutable impl (not vi.fn): vitest 4's async mock-result tracking on a vi.fn
// that returns a rejected promise leaks that rejection as "unhandled" and fails
// the test even though the helper catches it. A plain function has no tracking.
const state = vi.hoisted(() => ({
  impl: (async () => undefined) as (id: string) => Promise<unknown>,
}))
vi.mock('@/lib/stripe/config', () => ({
  stripe: { transfers: { retrieve: (id: string) => state.impl(id) } },
}))

import { classifyExistingTransfer } from '../payout-reconcile'

describe('S3-1 classifyExistingTransfer — fails safe, only "missing" allows a re-send', () => {
  it('live: transfer exists and is not reversed → money already moved, do NOT re-send', async () => {
    state.impl = async () => ({ id: 'tr_1', amount: 5000, amount_reversed: 0 })
    expect(await classifyExistingTransfer('tr_1')).toBe('live')
  })

  it('live: partially reversed transfer is still live (some money is out)', async () => {
    state.impl = async () => ({ id: 'tr_1', amount: 5000, amount_reversed: 2000 })
    expect(await classifyExistingTransfer('tr_1')).toBe('live')
  })

  it('reversed: fully reversed transfer is ambiguous → needs review, do NOT re-send', async () => {
    state.impl = async () => ({ id: 'tr_1', amount: 5000, amount_reversed: 5000 })
    expect(await classifyExistingTransfer('tr_1')).toBe('reversed')
  })

  it('missing: Stripe resource_missing → id is stale, a re-send is safe', async () => {
    state.impl = async () => { throw { code: 'resource_missing' } }
    expect(await classifyExistingTransfer('tr_stale')).toBe('missing')
  })

  it('missing: HTTP 404 → treated as stale id', async () => {
    state.impl = async () => { throw { statusCode: 404 } }
    expect(await classifyExistingTransfer('tr_stale')).toBe('missing')
  })

  it('unverifiable: transient/network error → cannot confirm, do NOT re-send this run', async () => {
    state.impl = async () => { throw { code: 'rate_limit', statusCode: 429 } }
    expect(await classifyExistingTransfer('tr_1')).toBe('unverifiable')
  })

  it('unverifiable: a generic thrown Error is not mistaken for missing', async () => {
    state.impl = async () => { throw new Error('ECONNRESET') }
    expect(await classifyExistingTransfer('tr_1')).toBe('unverifiable')
  })
})
