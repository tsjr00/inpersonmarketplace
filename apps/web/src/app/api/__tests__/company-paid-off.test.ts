/**
 * Company-paid event ordering is SWITCHED OFF — the real order route, executed.
 *
 * Rule (owner 2026-10-03, lib/events/company-paid.ts): until the host-paid
 * events build, no order may be created by POST /api/events/[token]/order —
 * it creates orders outside checkout, so they would carry no sales tax
 * (tax/flags.ts condition 3). The route must say so plainly and must not
 * touch the database: no event lookup, no `create_company_paid_order` call,
 * no notification.
 *
 * The flow-integrity pin proves the SHAPE (the refusal sits ahead of the RPC);
 * this runs the route and asserts what actually leaves it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const H = vi.hoisted(() => ({
  state: { user: null as { id: string } | null },
  from: vi.fn(),
  rpc: vi.fn(),
  mockSendNotification: vi.fn(async () => ({})),
}))

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: H.state.user }, error: null }) },
    from: H.from,
    rpc: H.rpc,
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => makeClient()),
  createServiceClient: vi.fn(() => makeClient()),
}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), init: vi.fn(), withScope: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ success: true, remaining: 10 })),
  getClientIp: vi.fn(() => '127.0.0.1'),
  rateLimitResponse: vi.fn(() => new Response('rate limited', { status: 429 })),
  rateLimits: { auth: {}, submit: {}, api: {}, admin: {}, webhook: {}, sensitive: {}, deletion: {} },
}))
vi.mock('@/lib/notifications', () => ({ sendNotification: H.mockSendNotification }))

import { POST } from '../events/[token]/order/route'
import { COMPANY_PAID_ORDERING_ENABLED, COMPANY_PAID_UNAVAILABLE_MESSAGE } from '@/lib/events/company-paid'

function orderRequest() {
  return new NextRequest('http://localhost/api/events/tok-123/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reservation_id: 'res-1',
      listing_id: 'listing-1',
      vendor_profile_id: 'vendor-1',
      wave_id: 'wave-1',
      access_code: 'ACME2026',
    }),
  })
}
const ctx = { params: Promise.resolve({ token: 'tok-123' }) }

describe('Company-paid event ordering is switched off (route executed)', () => {
  beforeEach(() => {
    H.state.user = null
    H.from.mockClear()
    H.rpc.mockClear()
    H.mockSendNotification.mockClear()
  })

  it('the switch is off', () => {
    expect(COMPANY_PAID_ORDERING_ENABLED).toBe(false)
  })

  it('a signed-in attendee with a complete, valid-looking order is refused in plain words', async () => {
    H.state.user = { id: 'attendee-1' }
    const res = await POST(orderRequest(), ctx)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: COMPANY_PAID_UNAVAILABLE_MESSAGE })
  })

  it('the refusal touches nothing: no table read, no order function call, no notification', async () => {
    H.state.user = { id: 'attendee-1' }
    await POST(orderRequest(), ctx)
    expect(H.from).not.toHaveBeenCalled()
    expect(H.rpc).not.toHaveBeenCalled()
    expect(H.mockSendNotification).not.toHaveBeenCalled()
  })

  it('a visitor who is not signed in is still asked to sign in first', async () => {
    const res = await POST(orderRequest(), ctx)
    expect(res.status).toBe(401)
    expect(H.rpc).not.toHaveBeenCalled()
  })
})
