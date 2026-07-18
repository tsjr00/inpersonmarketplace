/**
 * Money-Authorization Business-Rule Tests (user-approved spec, 2026-07-13)
 *
 * THE SPEC (8 rules, user sign-off 2026-07-13 — do NOT weaken to match code):
 *  R1. An order item on an order with no succeeded payment can never produce
 *      a Stripe transfer — via fulfill, buyer-confirm, cron Phase 4 or 7.
 *  R2. An item in 'cancelled' or 'refunded' can never transition to
 *      'fulfilled'/'expired', by any path.
 *  R3. A non-duplicate vendor_payouts insert failure always blocks the transfer.
 *  R4. A completed vendor payout is never modified by webhook events for a
 *      DIFFERENT transfer.
 *  R5. When every item in an order is cancelled/rejected, the buyer's refund
 *      includes the tip + small-order fee (decision VOR-5B).
 *  R6. An issue-refund on a paid-out item always produces a fee-ledger debit
 *      or a payout cancellation (decision VOR-6B).
 *  R7. A blocked truck can neither create nor pay for any park booking or
 *      occurrence.
 *  R8. An unpaid park booking can never reach 'paid' except via the Stripe
 *      webhook flip.
 *
 * Rules 1-3 are exercised BEHAVIORALLY: the real fulfill / buyer-confirm
 * route handlers are invoked against a fixture-driven Supabase mock, and we
 * assert the money outcome (transfer called or not, status written or not).
 * Rules 1(cron)/4/5/6/7/8 are anchored STRUCTURALLY (the enforcing code must
 * exist at its site) — full behavioral drive for those paths is staging/prod
 * verification. A failing test here is a DECISION POINT, not a to-do item.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

// ── Hoisted state shared with vi.mock factories ─────────────────────

const H = vi.hoisted(() => {
  interface Q {
    table: string
    op: 'select' | 'update' | 'insert' | 'delete'
    values: Record<string, unknown> | null
    filters: Array<{ m: string; args: unknown[] }>
  }
  const state: {
    resolver: (q: Q) => { data: unknown; error: unknown; count?: number }
    calls: Q[]
    user: { id: string } | null
  } = {
    resolver: () => ({ data: null, error: null }),
    calls: [],
    user: null,
  }
  return {
    state,
    mockTransferToVendor: vi.fn(),
    mockGetChargeId: vi.fn(),
    mockCreateRefund: vi.fn(),
    mockSendNotification: vi.fn(async () => ({})),
    mockGetVendorProfile: vi.fn(),
  }
})

type QRec = (typeof H.state.calls)[number]

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: H.state.user }, error: null }) },
    rpc: vi.fn(async () => ({ data: null, error: null })),
    from(table: string) {
      const q: QRec = { table, op: 'select', values: null, filters: [] }
      const chain: Record<string, unknown> = {}
      const chainMethods = ['select', 'eq', 'neq', 'in', 'is', 'not', 'gte', 'lte', 'order', 'limit']
      for (const m of chainMethods) {
        chain[m] = (...args: unknown[]) => {
          q.filters.push({ m, args })
          return chain
        }
      }
      chain.update = (values: Record<string, unknown>) => { q.op = 'update'; q.values = values; return chain }
      chain.insert = (values: Record<string, unknown>) => { q.op = 'insert'; q.values = values; return chain }
      chain.delete = () => { q.op = 'delete'; return chain }
      const resolve = () => {
        H.state.calls.push(q)
        return H.state.resolver(q)
      }
      chain.single = async () => resolve()
      chain.maybeSingle = async () => resolve()
      chain.then = (onOk: (v: unknown) => unknown) => Promise.resolve(resolve()).then(onOk)
      return chain
    },
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

vi.mock('@/lib/stripe/payments', () => ({
  transferToVendor: H.mockTransferToVendor,
  getChargeIdFromPaymentIntent: H.mockGetChargeId,
  createRefund: H.mockCreateRefund,
}))

vi.mock('@/lib/stripe/connect', () => ({ getAccountStatus: vi.fn() }))

vi.mock('@/lib/notifications', () => ({
  sendNotification: H.mockSendNotification,
  notifyOrderExpired: vi.fn(async () => ({})),
}))

vi.mock('@/lib/vendor/getVendorProfile', () => ({
  getVendorProfileForVertical: H.mockGetVendorProfile,
}))

vi.mock('@/lib/payments/vendor-fees', () => ({
  getVendorFeeBalance: vi.fn(async () => ({ balanceCents: 0, oldestUnpaidAt: null, requiresPayment: false })),
  calculateAutoDeductAmount: vi.fn(() => 0),
  recordFeeCredit: vi.fn(async () => ({ success: true })),
  recordExternalPaymentFee: vi.fn(async () => ({ success: true })),
  // mig 197 claim-first refactor: handlers now claim atomically; 0 grant keeps
  // every payout-math expectation identical to the old zero-balance mocks.
  claimVendorFeeDeduction: vi.fn(async () => ({ grantedCents: 0 })),
}))

import { POST as fulfillPOST } from '../vendor/orders/[id]/fulfill/route'
import { POST as confirmPOST } from '../buyer/orders/[id]/confirm/route'

// ── Fixtures ─────────────────────────────────────────────────────────

const VENDOR_USER = { id: 'vendor-user-1' }
const BUYER_USER = { id: 'buyer-user-1' }
const VENDOR_PROFILE = { id: 'vp-1', stripe_account_id: 'acct_test', stripe_payouts_enabled: true, user_id: 'vendor-user-1' }

function fulfillItem(overrides: Record<string, unknown> = {}, orderOverrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1', status: 'ready', vendor_payout_cents: 1855, order_id: 'order-1',
    subtotal_cents: 2000, vendor_profile_id: 'vp-1',
    buyer_confirmed_at: '2026-07-13T00:00:00Z', vendor_confirmed_at: null,
    confirmation_window_expires_at: null, cancelled_at: null,
    order: {
      id: 'order-1', order_number: 'FM-1', buyer_user_id: 'buyer-user-1',
      vertical_id: 'farmers_market', payment_method: 'stripe', payment_model: null,
      tip_amount: 0, tip_on_platform_fee_cents: 0, status: 'pending',
      ...orderOverrides,
    },
    listing: { title: 'Eggs', vendor_profiles: { profile_data: { business_name: 'Farm' } } },
    ...overrides,
  }
}

const req = (url: string) => new NextRequest(new Request(`http://localhost${url}`, { method: 'POST' }))
const params = (id: string) => ({ params: Promise.resolve({ id }) })

function updatesOf(table: string, statusValue?: string) {
  return H.state.calls.filter(c =>
    c.table === table && c.op === 'update' &&
    (statusValue === undefined || (c.values as Record<string, unknown>)?.status === statusValue))
}

beforeEach(() => {
  H.state.calls = []
  H.state.resolver = () => ({ data: null, error: null })
  H.mockTransferToVendor.mockReset().mockResolvedValue({ id: 'tr_test' })
  H.mockGetChargeId.mockReset().mockResolvedValue('ch_test')
  H.mockCreateRefund.mockReset().mockResolvedValue({ id: 're_test' })
  H.mockGetVendorProfile.mockReset().mockResolvedValue({ profile: VENDOR_PROFILE, error: null })
})

// ═══ R1 — no transfer without a succeeded payment ════════════════════

describe('R1: unpaid order can never produce a transfer', () => {
  it('fulfill: unpaid order (status pending, no succeeded payment) → blocked, no transfer, no fulfilled flip', async () => {
    H.state.user = VENDOR_USER
    const item = fulfillItem()
    H.state.resolver = (q) => {
      if (q.table === 'order_items' && q.op === 'select') return { data: item, error: null }
      if (q.table === 'payments') return { data: null, error: null } // no succeeded payment
      return { data: null, error: null }
    }
    const res = await fulfillPOST(req('/api/vendor/orders/item-1/fulfill'), params('item-1'))
    expect(res.status).toBeGreaterThanOrEqual(400)
    const body = await res.json()
    expect(JSON.stringify(body)).toMatch(/not been paid|ERR_ORDER_007/i)
    expect(H.mockTransferToVendor).not.toHaveBeenCalled()
    expect(updatesOf('order_items', 'fulfilled')).toHaveLength(0)
  })

  it('fulfill: PAID order proceeds — gate does not false-block (positive control)', async () => {
    H.state.user = VENDOR_USER
    const item = fulfillItem({}, { status: 'paid' })
    H.state.resolver = (q) => {
      if (q.table === 'order_items' && q.op === 'select' && q.filters.some(f => f.m === 'select' && String(f.args[0]).includes('order:orders'))) {
        return { data: item, error: null }
      }
      if (q.table === 'order_items' && q.op === 'update') return { data: [{ id: 'item-1' }], error: null }
      if (q.table === 'order_items' && q.op === 'select') return { data: null, error: null, count: 1 }
      if (q.table === 'payments') return { data: { stripe_payment_intent_id: 'pi_1' }, error: null }
      if (q.table === 'vendor_payouts' && q.op === 'select') return { data: null, error: null }
      if (q.table === 'vendor_payouts' && q.op === 'insert') return { data: { id: 'po-1' }, error: null }
      if (q.table === 'vendor_payouts' && q.op === 'update') return { data: null, error: null }
      return { data: null, error: null }
    }
    const res = await fulfillPOST(req('/api/vendor/orders/item-1/fulfill'), params('item-1'))
    const body = await res.json()
    expect(body.success, `expected success, got: ${JSON.stringify(body)}`).toBe(true)
    expect(H.mockTransferToVendor).toHaveBeenCalledTimes(1)
    // and the transfer is tied to the charge (Session-74 rule)
    expect(H.mockTransferToVendor.mock.calls[0][0]).toHaveProperty('sourceTransaction', 'ch_test')
  })

  it('buyer-confirm edge (vendor fulfilled first): unpaid order → blocked before any write', async () => {
    H.state.user = BUYER_USER
    const item = {
      id: 'item-1', status: 'fulfilled', buyer_confirmed_at: null, vendor_confirmed_at: '2026-07-13T00:00:00Z',
      vendor_profile_id: 'vp-1', vendor_payout_cents: 1855, order_id: 'order-1', cancelled_at: null,
      order: {
        id: 'order-1', order_number: 'FM-1', buyer_user_id: 'buyer-user-1', vertical_id: 'farmers_market',
        payment_method: 'stripe', payment_model: null, tip_amount: 0, tip_on_platform_fee_cents: 0, status: 'pending',
      },
    }
    H.state.resolver = (q) => {
      if (q.table === 'order_items' && q.op === 'select') return { data: item, error: null }
      if (q.table === 'vendor_profiles') return { data: VENDOR_PROFILE, error: null }
      if (q.table === 'payments') return { data: null, error: null }
      return { data: null, error: null }
    }
    const res = await confirmPOST(req('/api/buyer/orders/item-1/confirm'), { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(H.mockTransferToVendor).not.toHaveBeenCalled()
    expect(updatesOf('order_items')).toHaveLength(0) // gate fires BEFORE the confirm write
  })

  it('cron Phases 4 and 7 carry the same gate (structural anchor)', () => {
    const cron = fs.readFileSync(path.resolve(__dirname, '../cron/expire-orders/route.ts'), 'utf8')
    const gates = cron.match(/ERR_ORDER_007/g) ?? []
    expect(gates.length, 'expire-orders lost a paid-gate (Phase 4 no-show + Phase 7 auto-fulfill must each block unpaid orders)').toBeGreaterThanOrEqual(2)
  })
})

// ═══ R2 — cancelled/refunded items never flip to fulfilled ═══════════

describe('R2: cancelled/refunded item can never be fulfilled', () => {
  it('fulfill else-branch: refunded item → guarded update matches 0 rows → error, stays refunded', async () => {
    H.state.user = VENDOR_USER
    const item = fulfillItem({ status: 'refunded', buyer_confirmed_at: null }, { status: 'paid' })
    H.state.resolver = (q) => {
      if (q.table === 'order_items' && q.op === 'select') return { data: item, error: null }
      if (q.table === 'payments') return { data: { stripe_payment_intent_id: 'pi_1' }, error: null }
      if (q.table === 'order_items' && q.op === 'update') return { data: [], error: null } // guard matched 0 rows
      return { data: null, error: null }
    }
    const res = await fulfillPOST(req('/api/vendor/orders/item-1/fulfill'), params('item-1'))
    expect(res.status).toBeGreaterThanOrEqual(400)
    const body = await res.json()
    expect(JSON.stringify(body)).toMatch(/no longer be fulfilled|cancelled or refunded|ERR_ORDER_004/i)
    expect(H.mockTransferToVendor).not.toHaveBeenCalled()
  })

  it('buyer-confirm: refunded item is not confirmable', async () => {
    H.state.user = BUYER_USER
    const item = {
      id: 'item-1', status: 'refunded', buyer_confirmed_at: null, vendor_confirmed_at: null,
      vendor_profile_id: 'vp-1', vendor_payout_cents: 1855, order_id: 'order-1',
      order: { id: 'order-1', order_number: 'FM-1', buyer_user_id: 'buyer-user-1', vertical_id: 'farmers_market', payment_method: 'stripe', payment_model: null, tip_amount: 0, tip_on_platform_fee_cents: 0, status: 'paid' },
    }
    H.state.resolver = (q) => {
      if (q.table === 'order_items' && q.op === 'select') return { data: item, error: null }
      return { data: null, error: null }
    }
    const res = await confirmPOST(req('/api/buyer/orders/item-1/confirm'), { params: Promise.resolve({ id: 'item-1' }) })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(updatesOf('order_items')).toHaveLength(0)
  })
})

// ═══ R3 — payout insert failure blocks the transfer ══════════════════

describe('R3: non-duplicate payout-insert failure blocks the transfer', () => {
  it('fulfill: vendor_payouts insert error (non-23505) → 500, transfer NOT fired', async () => {
    H.state.user = VENDOR_USER
    const item = fulfillItem({}, { status: 'paid' })
    H.state.resolver = (q) => {
      if (q.table === 'order_items' && q.op === 'select' && q.filters.some(f => f.m === 'select' && String(f.args[0]).includes('order:orders'))) {
        return { data: item, error: null }
      }
      if (q.table === 'order_items' && q.op === 'update') return { data: [{ id: 'item-1' }], error: null }
      if (q.table === 'order_items' && q.op === 'select') return { data: null, error: null, count: 1 }
      if (q.table === 'vendor_payouts' && q.op === 'select') return { data: null, error: null }
      if (q.table === 'vendor_payouts' && q.op === 'insert') {
        return { data: null, error: { code: 'XX000', message: 'db exploded' } }
      }
      return { data: null, error: null }
    }
    const res = await fulfillPOST(req('/api/vendor/orders/item-1/fulfill'), params('item-1'))
    expect(res.status).toBeGreaterThanOrEqual(500)
    expect(H.mockTransferToVendor).not.toHaveBeenCalled()
  })
})

// ═══ R4-R8 — structural anchors (site-level enforcement must exist) ══

const readSrc = (p: string) => fs.readFileSync(path.resolve(__dirname, '../../..', p), 'utf8')

describe('R4-R8: structural spec anchors', () => {
  it('R4: transfer webhooks are scoped (status-scope on created, transfer-id on reversed)', () => {
    const webhooks = readSrc('lib/stripe/webhooks.ts')
    expect((webhooks.match(/\.in\('status', \['pending', 'processing'\]\)/g) ?? []).length, 'transfer.created updates lost their live-row status scoping (MBX-3/7)').toBeGreaterThanOrEqual(2)
    expect((webhooks.match(/\.eq\('stripe_transfer_id', transfer\.id\)/g) ?? []).length, 'transfer.reversed updates lost their transfer-id scoping (MBX-3/7)').toBeGreaterThanOrEqual(2)
  })

  it('R5: full-order rejection refunds the tip + small-order fee (VOR-5B) in both sites', () => {
    for (const f of ['app/api/vendor/orders/[id]/reject/route.ts', 'app/api/vendor/orders/[id]/resolve-issue/route.ts']) {
      const code = readSrc(f)
      expect(code.includes('-order-fees'), `${f} lost the VOR-5B order-level tip/fee refund`).toBe(true)
      expect(code.includes('calculateSmallOrderFee'), `${f} lost the small-order-fee recompute`).toBe(true)
    }
  })

  it('R6: issue-refund claws back the payout (debit) or cancels unpaid payout rows (VOR-6B)', () => {
    const code = readSrc('app/api/vendor/orders/[id]/resolve-issue/route.ts')
    expect(code.includes("vendor_fee_ledger"), 'resolve-issue lost the VOR-6B ledger debit').toBe(true)
    expect(code.includes("type: 'debit'"), 'resolve-issue lost the debit insert').toBe(true)
    expect(code.includes("'pending_stripe_setup'"), 'resolve-issue lost the unpaid-payout cancellation (Phase-5 retry hole)').toBe(true)
  })

  it('R7: blocked trucks are stopped at booking, occurrence-pay, and occurrence generation', () => {
    expect(readSrc('app/api/vendor/markets/[id]/book-park-spot/route.ts').includes('blocked === true'), 'book-park-spot lost the vetting block gate').toBe(true)
    expect(readSrc('app/api/vendor/park-occurrences/[bookingId]/pay/route.ts').includes('blocked === true'), 'pay-occurrence lost the vetting block gate (PRK-4)').toBe(true)
    expect(readSrc('lib/markets/park-standing.ts').includes('blockedKeys'), 'sweep generation lost the vetting block skip (PRK-4)').toBe(true)
  })

  it("R8: the webhook flip is the ONLY writer of park booking status 'paid', and it is guarded", () => {
    const srcRoot = path.resolve(__dirname, '../../..')
    const writers: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) {
          if (e.name === '__tests__' || e.name === 'node_modules') continue
          walk(p)
        } else if (e.name.endsWith('.ts') && !e.name.includes('.test.')) {
          const code = fs.readFileSync(p, 'utf8')
          let idx = 0
          while ((idx = code.indexOf(".from('park_spot_bookings')", idx)) !== -1) {
            const chunk = code.slice(idx, idx + 900)
            if (/\.update\(\s*\{[\s\S]*?\bstatus\s*:\s*'paid'/.test(chunk)) {
              writers.push(path.relative(srcRoot, p).replace(/\\/g, '/'))
              expect(chunk.includes(".eq('status', 'pending_payment')"), `${p}: the paid-flip lost its pending_payment guard`).toBe(true)
            }
            idx += 10
          }
        }
      }
    }
    walk(srcRoot)
    expect(writers, "exactly one file may flip park bookings to 'paid' (the guarded webhook)").toEqual(['lib/stripe/webhooks.ts'])
  })
})
