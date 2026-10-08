/**
 * Resend bounce webhook × email suppression — the REAL route, executed.
 *
 * Rule (NOT-5, mig 202, decisions 2026-07-18): a HARD bounce or a spam
 * complaint suppresses the user's email channel; a soft (temporary) bounce
 * never does. Resend names the types "Permanent" and "Temporary"
 * (docs: webhooks/emails/bounced; real Prod payload 2026-10-08 = "Permanent").
 *
 * Found 2026-10-08 while confirming the webhook after its URL was fixed:
 * the route tested `bounceType !== 'soft'`, a value Resend never sends, so a
 * "Temporary" bounce would have suppressed the user. These run the route
 * with a verified-looking payload and assert what it writes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { isPermanentBounce } from '@/lib/notifications/bounce'

const H = vi.hoisted(() => ({
  payload: null as unknown,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; values: Record<string, unknown>; filters: Array<{ m: string; args: unknown[] }> }>,
  sendNotification: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({})),
}))

vi.mock('svix', () => ({
  Webhook: class { verify() { return H.payload } },
}))
vi.mock('@/lib/notifications', () => ({ sendNotification: H.sendNotification }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), init: vi.fn(), withScope: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from(table: string) {
      return {
        insert: async (values: Record<string, unknown>) => { H.inserts.push({ table, values }); return { error: null } },
        update(values: Record<string, unknown>) {
          const rec = { table, values, filters: [] as Array<{ m: string; args: unknown[] }> }
          H.updates.push(rec)
          const chain = {
            eq: (...args: unknown[]) => { rec.filters.push({ m: 'eq', args }); return chain },
            is: (...args: unknown[]) => { rec.filters.push({ m: 'is', args }); return chain },
            select: async () => ({ data: [{ user_id: 'user-1' }], error: null }),
          }
          return chain
        },
      }
    },
  }),
}))

import { POST } from '../webhooks/resend/route'

function bounceEvent(type: string | undefined, eventType = 'email.bounced') {
  return {
    type: eventType,
    created_at: '2026-10-08T23:38:02.295Z',
    data: {
      email_id: 'email-1',
      from: 'Platform Alerts <updates@mail.farmersmarketing.app>',
      to: ['someone@example.com'],
      subject: 'Your order',
      ...(eventType === 'email.bounced'
        ? { bounce: { message: 'bounced', ...(type === undefined ? {} : { type }) } }
        : { complaint: { message: 'marked as spam' } }),
    },
  }
}

function signedRequest() {
  return new NextRequest('http://localhost/api/webhooks/resend', {
    method: 'POST',
    headers: { 'svix-id': 'msg_1', 'svix-timestamp': '1', 'svix-signature': 'v1,abc', 'content-type': 'application/json' },
    body: '{}',
  })
}

describe('isPermanentBounce — only Resend\'s "Permanent" (or legacy "hard") is a hard bounce', () => {
  it.each([
    ['Permanent', true],
    ['permanent', true],
    [' Permanent ', true],
    ['hard', true],
    ['Temporary', false],
    ['Transient', false],
    ['soft', false],
    ['Undetermined', false],
    ['', false],
    [null, false],
    [undefined, false],
  ])('%s → %s', (value, expected) => {
    expect(isPermanentBounce(value)).toBe(expected)
  })
})

describe('Resend bounce webhook: suppression follows the bounce type (route executed)', () => {
  beforeEach(() => {
    vi.stubEnv('RESEND_WEBHOOK_SECRET', 'whsec_test')
    vi.stubEnv('ADMIN_ALERT_EMAIL', '')
    H.inserts.length = 0
    H.updates.length = 0
    H.sendNotification.mockClear()
  })

  it('a Permanent bounce is stored AND suppresses the address (reason hard_bounce), with one in-app notice', async () => {
    H.payload = bounceEvent('Permanent')
    const res = await POST(signedRequest())
    expect(res.status).toBe(200)
    expect(H.inserts).toHaveLength(1)
    expect(H.inserts[0]).toMatchObject({ table: 'email_events', values: { event_type: 'email.bounced', bounce_type: 'Permanent', email_to: 'someone@example.com' } })
    expect(H.updates).toHaveLength(1)
    expect(H.updates[0]!.table).toBe('user_profiles')
    expect(H.updates[0]!.values).toMatchObject({ email_suppression_reason: 'hard_bounce' })
    expect(H.updates[0]!.filters).toEqual([
      { m: 'eq', args: ['email', 'someone@example.com'] },
      { m: 'is', args: ['email_suppressed_at', null] },
    ])
    expect(H.sendNotification).toHaveBeenCalledTimes(1)
    expect(H.sendNotification.mock.calls[0]![1]).toBe('email_suppressed_notice')
  })

  it.each([['Temporary'], ['Transient'], ['soft'], [undefined]])(
    'a %s bounce is stored but NEVER suppresses the address',
    async (type) => {
      H.payload = bounceEvent(type)
      const res = await POST(signedRequest())
      expect(res.status).toBe(200)
      expect(H.inserts).toHaveLength(1)
      expect(H.inserts[0]!.values).toMatchObject({ event_type: 'email.bounced', bounce_type: type ?? null })
      expect(H.updates).toHaveLength(0)
      expect(H.sendNotification).not.toHaveBeenCalled()
    }
  )

  it('a spam complaint suppresses the address with reason complaint', async () => {
    H.payload = bounceEvent(undefined, 'email.complained')
    const res = await POST(signedRequest())
    expect(res.status).toBe(200)
    expect(H.updates).toHaveLength(1)
    expect(H.updates[0]!.values).toMatchObject({ email_suppression_reason: 'complaint' })
  })

  it('a delivery event that is not tracked writes nothing', async () => {
    H.payload = { type: 'email.delivered', created_at: '', data: { email_id: 'e', from: '', to: ['a@b.c'], subject: '' } }
    const res = await POST(signedRequest())
    expect(res.status).toBe(200)
    expect(H.inserts).toHaveLength(0)
    expect(H.updates).toHaveLength(0)
  })
})
