/**
 * Q2 admin queue × sales tax — the REAL resolve route against a fake database
 * (owner Q2 2026-09-24; built 2026-09-26). The rules are the spec:
 *  - only a platform admin may allocate (accounting is platform work);
 *  - each ticked item writes ONE dashboard_refund ledger row keyed by the
 *    queue row's Stripe refund id — whole item = the snapshot, a percent =
 *    that share of the base, capped by earlier reversals;
 *  - an item that is not a live item of that order is refused, nothing written;
 *  - the queue row is closed with who / when / note; an already-closed row is
 *    refused (409); an empty allocation needs a note.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { computeItemTax } from '@/lib/tax/jurisdictions'

const H = vi.hoisted(() => {
  type Q = { table: string; op: string; values: Record<string, unknown> | null; filters: Array<{ m: string; args: unknown[] }> }
  const state: { resolver: (q: Q) => { data: unknown; error: unknown }; calls: Q[]; scope: unknown } = {
    resolver: () => ({ data: null, error: null }), calls: [], scope: null,
  }
  return { state }
})
type QRec = (typeof H.state.calls)[number]

function makeClient() {
  return {
    from(table: string) {
      const q: QRec = { table, op: 'select', values: null, filters: [] }
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'gt', 'gte', 'lte', 'or', 'order', 'limit']) {
        chain[m] = (...args: unknown[]) => { q.filters.push({ m, args }); return chain }
      }
      chain.update = (values: Record<string, unknown>) => { q.op = 'update'; q.values = values; return chain }
      chain.insert = (values: Record<string, unknown>) => { q.op = 'insert'; q.values = values; return chain }
      const resolve = () => { H.state.calls.push(q); return H.state.resolver(q) }
      chain.single = async () => resolve()
      chain.maybeSingle = async () => resolve()
      chain.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => Promise.resolve(resolve()).then(onOk, onErr)
      return chain
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => makeClient()), createServiceClient: vi.fn(() => makeClient()) }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), init: vi.fn(), withScope: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ success: true, remaining: 10 })),
  getClientIp: vi.fn(() => '127.0.0.1'),
  rateLimitResponse: vi.fn(() => new Response('rate limited', { status: 429 })),
  rateLimits: { auth: {}, submit: {}, api: {}, admin: {}, webhook: {}, sensitive: {}, deletion: {} },
}))
vi.mock('@/lib/auth/admin', () => ({ verifyAdminScope: vi.fn(async () => H.state.scope) }))

import { POST as resolvePOST } from '../admin/tax-reversals/[id]/resolve/route'

const AUSTIN = [
  { code: '7000000', name: 'TEXAS', level: 'state' as const, rate_pct: 6.25 },
  { code: '2227000', name: 'AUSTIN', level: 'city' as const, rate_pct: 1.0 },
  { code: '3227000', name: 'AUSTIN MTA', level: 'transit' as const, rate_pct: 1.0 },
]
const snap = computeItemTax(1065, true, AUSTIN) // 67 + 11 + 11 = 89
const ITEM_A = { id: 'item-a', order_id: 'order-1', cancelled_at: null, taxable_amount_cents: 1065, tax_amount_cents: 89, tax_jurisdictions: snap.jurisdictions, tax_rate_version: '2026-Q3' }
const ITEM_B = { id: 'item-b', order_id: 'order-1', cancelled_at: null, taxable_amount_cents: 1065, tax_amount_cents: 89, tax_jurisdictions: snap.jurisdictions, tax_rate_version: '2026-Q3' }
const QUEUE_ROW = { id: '11111111-1111-4111-8111-111111111111', order_id: 'order-1', stripe_refund_id: 're_dash', refund_amount_cents: 900, resolved_at: null }
const PLATFORM = { authorized: true, isPlatformAdmin: true, userId: 'admin-1', effectiveVerticalId: null }
const VERTICAL = { authorized: true, isPlatformAdmin: false, userId: 'vadmin-1', effectiveVerticalId: 'farmers_market' }

function resolveWith(queueRow: Record<string, unknown> | null, ledger: Array<Record<string, unknown>> = []) {
  H.state.resolver = (q) => {
    if (q.table === 'order_tax_reversal_queue' && q.op === 'select') return { data: queueRow, error: null }
    if (q.table === 'order_tax_reversal_queue' && q.op === 'update') return { data: null, error: null }
    if (q.table === 'order_items') return { data: [ITEM_A, ITEM_B], error: null }
    if (q.table === 'order_item_tax_reversals' && q.op === 'select') {
      const itemId = q.filters.find((f) => f.m === 'eq' && f.args[0] === 'order_item_id')?.args[1]
      return { data: ledger.filter((l) => l.order_item_id === itemId), error: null }
    }
    if (q.table === 'order_item_tax_reversals' && q.op === 'insert') return { data: null, error: null }
    return { data: null, error: null }
  }
}
const req = (body: unknown) => new NextRequest(new Request('http://localhost/api/admin/tax-reversals/x/resolve', { method: 'POST', body: JSON.stringify(body) }))
const params = { params: Promise.resolve({ id: QUEUE_ROW.id }) }
const ledgerInserts = () => H.state.calls.filter((c) => c.table === 'order_item_tax_reversals' && c.op === 'insert').map((c) => c.values!)
const queueUpdates = () => H.state.calls.filter((c) => c.table === 'order_tax_reversal_queue' && c.op === 'update').map((c) => c.values!)

beforeEach(() => { H.state.calls = []; H.state.scope = PLATFORM })

describe('resolve — the admin allocates a partial dashboard refund to items', () => {
  it('whole item + 75% of another → two dashboard_refund rows under the queue row\'s refund id; row closed with who/note', async () => {
    resolveWith(QUEUE_ROW)
    const res = await resolvePOST(req({ allocations: [{ orderItemId: 'item-a', portion: 'full' }, { orderItemId: 'item-b', portion: 75 }], note: 'salsa returned, half the chips' }), params)
    expect(res.status).toBe(200)
    const body = await res.json()
    const rows = ledgerInserts()
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ order_item_id: 'item-a', order_id: 'order-1', reversal_kind: 'dashboard_refund', refund_ref: 're_dash', tax_cents: 89, taxable_amount_cents: 1065 })
    // 75%: base round(1065 × .75) = 799 → round(89 × 799 / 1065) = 67
    expect(rows[1]).toMatchObject({ order_item_id: 'item-b', reversal_kind: 'dashboard_refund', refund_ref: 're_dash', tax_cents: 67, taxable_amount_cents: 799 })
    expect(body.taxReversedCents).toBe(89 + 67)
    expect(queueUpdates()).toEqual([expect.objectContaining({ resolved_by: 'admin-1', note: 'salsa returned, half the chips', resolved_at: expect.any(String) })])
  })
  it('an item already partly reversed only gets what remains (cap)', async () => {
    resolveWith(QUEUE_ROW, [{ order_item_id: 'item-a', tax_cents: 60 }])
    await resolvePOST(req({ allocations: [{ orderItemId: 'item-a', portion: 'full' }] }), params)
    expect(ledgerInserts()[0]).toMatchObject({ tax_cents: 29 })
  })
  it('an item that is not a live item of that order → 400, nothing written, row stays open', async () => {
    resolveWith(QUEUE_ROW)
    const res = await resolvePOST(req({ allocations: [{ orderItemId: 'item-zzz', portion: 'full' }] }), params)
    expect(res.status).toBe(400)
    expect(ledgerInserts()).toEqual([])
    expect(queueUpdates()).toEqual([])
  })
  it('no items and no note → 400; no items WITH a note → row closes, nothing reversed', async () => {
    resolveWith(QUEUE_ROW)
    expect((await resolvePOST(req({ allocations: [] }), params)).status).toBe(400)
    H.state.calls = []
    const res = await resolvePOST(req({ allocations: [], note: 'refund covered the tip only' }), params)
    expect(res.status).toBe(200)
    expect(ledgerInserts()).toEqual([])
    expect(queueUpdates()[0]).toMatchObject({ note: 'refund covered the tip only' })
  })
  it('an already-resolved row → 409, nothing written', async () => {
    resolveWith({ ...QUEUE_ROW, resolved_at: '2026-09-26T00:00:00Z' })
    const res = await resolvePOST(req({ allocations: [{ orderItemId: 'item-a', portion: 'full' }] }), params)
    expect(res.status).toBe(409)
    expect(ledgerInserts()).toEqual([])
  })
  it('a vertical admin is refused (platform-only)', async () => {
    H.state.scope = VERTICAL
    resolveWith(QUEUE_ROW)
    const res = await resolvePOST(req({ allocations: [{ orderItemId: 'item-a', portion: 'full' }] }), params)
    expect(res.status).toBeGreaterThanOrEqual(401)
    expect(res.status).toBeLessThan(500)
    expect(ledgerInserts()).toEqual([])
  })
  it('a bad percent is refused', async () => {
    resolveWith(QUEUE_ROW)
    expect((await resolvePOST(req({ allocations: [{ orderItemId: 'item-a', portion: 150 }] }), params)).status).toBe(400)
    expect((await resolvePOST(req({ allocations: [{ orderItemId: 'item-a', portion: 0 }] }), params)).status).toBe(400)
  })
})
