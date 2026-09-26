/**
 * Refund routes × sales tax — the REAL route code run against a fake database
 * and a mocked Stripe (the money-authorization harness), with a TAXED item.
 *
 * Why this exists (owner 2026-09-26: "is the protective pin enough?"): the
 * flow-integrity pins prove every refund path has the right SHAPE; while the
 * tax stream is dark no taxed branch ever executes, so a wrong fraction at a
 * site would pass every pin. These tests execute the branches with tax ON the
 * item and assert what leaves the route:
 *  - the Stripe refund amount and the stored refund_amount_cents are
 *    tax-INCLUSIVE (readiness §3: the buyer gets their tax back);
 *  - a full refund reverses the whole snapshot; under the 25% cancellation
 *    fee 75% of the tax comes back (owner Q1 2026-09-24), conservation-exact;
 *  - exactly one ledger row is written, AFTER Stripe, keyed by the Stripe
 *    refund id, in the snapshot's shape (mig 260);
 *  - an item with NO tax (pre-tax or exempt) refunds exactly what it did
 *    before and writes no row — the dark-stream guarantee.
 * Expected values come from the rules, computed by hand in the comments.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { computeItemTax } from '@/lib/tax/jurisdictions'

const H = vi.hoisted(() => {
  type Q = { table: string; op: string; values: Record<string, unknown> | null; filters: Array<{ m: string; args: unknown[] }> }
  const state: { resolver: (q: Q) => { data: unknown; error: unknown; count?: number }; calls: Q[]; user: { id: string } | null } = {
    resolver: () => ({ data: null, error: null }), calls: [], user: null,
  }
  return {
    state,
    mockCreateRefund: vi.fn(),
    mockTransferToVendor: vi.fn(),
    mockGetChargeId: vi.fn(),
    mockSendNotification: vi.fn(async () => ({})),
    mockGetVendorProfile: vi.fn(),
  }
})
type QRec = (typeof H.state.calls)[number]

function makeClient() {
  // rpc(): awaitable directly (restoreInventory) AND .single()-able (reject's increment_vendor_cancelled).
  const rpcResult = () => Object.assign(Promise.resolve({ data: null, error: null }), { single: async () => ({ data: null, error: null }) })
  return {
    auth: { getUser: async () => ({ data: { user: H.state.user }, error: null }) },
    rpc: vi.fn(() => rpcResult()),
    from(table: string) {
      const q: QRec = { table, op: 'select', values: null, filters: [] }
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'neq', 'in', 'is', 'not', 'gte', 'lte', 'order', 'limit', 'contains']) {
        chain[m] = (...args: unknown[]) => { q.filters.push({ m, args }); return chain }
      }
      chain.update = (values: Record<string, unknown>) => { q.op = 'update'; q.values = values; return chain }
      chain.insert = (values: Record<string, unknown>) => { q.op = 'insert'; q.values = values; return chain }
      chain.delete = () => { q.op = 'delete'; return chain }
      const resolve = () => { H.state.calls.push(q); return H.state.resolver(q) }
      chain.single = async () => resolve()
      chain.maybeSingle = async () => resolve()
      chain.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => Promise.resolve(resolve()).then(onOk, onErr)
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
  createRefund: H.mockCreateRefund,
  transferToVendor: H.mockTransferToVendor,
  getChargeIdFromPaymentIntent: H.mockGetChargeId,
}))
vi.mock('@/lib/stripe/config', async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  stripe: { checkout: { sessions: { expire: vi.fn() } } },
}))
vi.mock('@/lib/notifications', () => ({
  sendNotification: H.mockSendNotification,
  notifyOrderExpired: vi.fn(async () => ({})),
}))
vi.mock('@/lib/vendor/getVendorProfile', () => ({ getVendorProfileForVertical: H.mockGetVendorProfile }))

import { POST as buyerCancelPOST } from '../buyer/orders/[id]/cancel/route'
import { POST as vendorRejectPOST } from '../vendor/orders/[id]/reject/route'

// ── Fixtures ────────────────────────────────────────────────────────────
// Austin: 6.25 state + 1.00 city + 1.00 transit. Checkout taxed the $10.00
// item on its fee-inclusive base 1065 → 67 + 11 + 11 = 89¢ (checkout-tax spec).
const AUSTIN = [
  { code: '7000000', name: 'TEXAS', level: 'state' as const, rate_pct: 6.25 },
  { code: '2227000', name: 'AUSTIN', level: 'city' as const, rate_pct: 1.0 },
  { code: '3227000', name: 'AUSTIN MTA', level: 'transit' as const, rate_pct: 1.0 },
]
const TAXED = (() => {
  const c = computeItemTax(1065, true, AUSTIN)
  return { taxable_amount_cents: c.taxableAmountCents, tax_amount_cents: c.taxAmountCents, tax_jurisdictions: c.jurisdictions, tax_rate_version: '2026-Q3' }
})()
const UNTAXED = { taxable_amount_cents: null, tax_amount_cents: null, tax_jurisdictions: null, tax_rate_version: null }
// Money the paths already refund on a single $10.00 item: 1000 + 65 (6.5%) + 15 (flat) = 1080 (refund-consistency spec).
const BUYER_PAID = 1080

const BUYER = { id: 'buyer-1' }
function cancelItem(tax: Record<string, unknown>, status = 'pending') {
  return {
    id: 'item-1', order_id: 'order-1', status, quantity: 1, subtotal_cents: 1000,
    platform_fee_cents: 80, vendor_payout_cents: 920, cancelled_at: null, ...tax,
    listing: { id: 'listing-1', vendor_profile_id: 'vp-1', vendor_profiles: { id: 'vp-1', user_id: 'vendor-1', profile_data: {}, stripe_account_id: null, stripe_payouts_enabled: false } },
  }
}
function order(createdAt: string) {
  return { id: 'order-1', buyer_user_id: 'buyer-1', status: 'paid', total_cents: 1169, small_order_fee_cents: 0, tip_amount: 0, stripe_checkout_session_id: null, created_at: createdAt, order_number: 'FM-1', vertical_id: 'farmers_market', payment_method: 'stripe' }
}
const req = (url: string) => new NextRequest(new Request(`http://localhost${url}`, { method: 'POST', body: '{}' }))
const params = (id: string) => ({ params: Promise.resolve({ id }) })

/** Standard resolver: one taxed (or untaxed) item, a paid order, an empty ledger. */
function resolveWith(item: Record<string, unknown>, ord: Record<string, unknown>, ledgerRows: Array<Record<string, unknown>> = []) {
  H.state.resolver = (q) => {
    if (q.table === 'order_items' && q.op === 'select') {
      const isCount = q.filters.some(f => f.m === 'select' && typeof f.args[1] === 'object' && f.args[1] !== null && 'count' in (f.args[1] as object))
      if (isCount) return { data: null, error: null, count: 1 }
      if (q.filters.some(f => f.m === 'is')) return { data: [], error: null } // remaining live items after cancel → none
      return { data: item, error: null }
    }
    if (q.table === 'order_items' && q.op === 'update') return { data: [{ id: 'item-1' }], error: null }
    if (q.table === 'orders' && q.op === 'select') return { data: ord, error: null }
    if (q.table === 'payments') return { data: { stripe_payment_intent_id: 'pi_test', status: 'succeeded' }, error: null }
    if (q.table === 'order_item_tax_reversals' && q.op === 'select') return { data: ledgerRows, error: null }
    if (q.table === 'order_item_tax_reversals' && q.op === 'insert') return { data: null, error: null }
    if (q.table === 'user_profiles') return { data: { display_name: 'Buyer' }, error: null }
    return { data: null, error: null }
  }
}
const ledgerInserts = () => H.state.calls.filter(c => c.table === 'order_item_tax_reversals' && c.op === 'insert').map(c => c.values!)
const cancelWrite = () => H.state.calls.find(c => c.table === 'order_items' && c.op === 'update' && c.values?.status === 'cancelled')!.values!
const sumLines = (lines: Array<{ tax_cents: number }>) => lines.reduce((s, l) => s + l.tax_cents, 0)

beforeEach(() => {
  H.state.calls = []
  H.state.user = BUYER
  H.mockCreateRefund.mockReset().mockResolvedValue({ id: 're_test' })
  H.mockTransferToVendor.mockReset().mockResolvedValue({ id: 'tr_test' })
  H.mockGetChargeId.mockReset().mockResolvedValue('ch_test')
})

describe('buyer cancel × sales tax', () => {
  it('inside the grace window: full refund — money + ALL the tax; one ledger row after Stripe keyed by the refund id', async () => {
    resolveWith(cancelItem(TAXED), order(new Date().toISOString()))
    const res = await buyerCancelPOST(req('/api/buyer/orders/item-1/cancel'), params('item-1'))
    expect(res.status).toBe(200)
    // 1080 money + 89 tax
    expect(H.mockCreateRefund).toHaveBeenCalledWith('pi_test', 'item-1', BUYER_PAID + 89)
    expect(cancelWrite()).toMatchObject({ refund_amount_cents: BUYER_PAID + 89, cancellation_fee_cents: 0 })
    const rows = ledgerInserts()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ order_item_id: 'item-1', order_id: 'order-1', reversal_kind: 'item_refund', refund_ref: 're_test', taxable_amount_cents: 1065, tax_cents: 89, tax_rate_version: '2026-Q3' })
    expect(rows[0].tax_jurisdictions).toEqual(TAXED.tax_jurisdictions) // full = the snapshot, copied
    // Order: ledger read → cancel write → Stripe → ledger insert
    const idx = (pred: (c: QRec) => boolean) => H.state.calls.findIndex(pred)
    expect(idx(c => c.table === 'order_item_tax_reversals' && c.op === 'select')).toBeLessThan(idx(c => c.table === 'order_items' && c.op === 'update'))
    expect(idx(c => c.table === 'order_item_tax_reversals' && c.op === 'insert')).toBeGreaterThan(idx(c => c.table === 'payments'))
    expect((await res.json()).refund_amount_cents).toBe(BUYER_PAID + 89)
  })

  it('after the window with the vendor confirmed (25% fee): 75% of the money AND 75% of the tax come back — Q1', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    resolveWith(cancelItem(TAXED, 'confirmed'), order(twoHoursAgo))
    const res = await buyerCancelPOST(req('/api/buyer/orders/item-1/cancel'), params('item-1'))
    expect(res.status).toBe(200)
    // money: round(1080 × 0.75) = 810 · tax: refunded base round(1065 × 0.75) = 799 → round(89 × 799 / 1065) = 67
    expect(H.mockCreateRefund).toHaveBeenCalledWith('pi_test', 'item-1', 810 + 67)
    expect(cancelWrite()).toMatchObject({ refund_amount_cents: 810 + 67, cancellation_fee_cents: BUYER_PAID - 810 }) // fee stays money-only
    const rows = ledgerInserts()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ taxable_amount_cents: 799, tax_cents: 67, refund_ref: 're_test' })
    expect(sumLines(rows[0].tax_jurisdictions as Array<{ tax_cents: number }>)).toBe(67) // conservation
    const body = await res.json()
    expect(body.cancellation_fee_applied).toBe(true)
    expect(body.message).toMatch(/\$8\.77/)
  })

  it('an item already partly reversed only gets what remains (cap from the ledger)', async () => {
    resolveWith(cancelItem(TAXED), order(new Date().toISOString()), [{ order_item_id: 'item-1', tax_cents: 67 }])
    await buyerCancelPOST(req('/api/buyer/orders/item-1/cancel'), params('item-1'))
    expect(H.mockCreateRefund).toHaveBeenCalledWith('pi_test', 'item-1', BUYER_PAID + (89 - 67))
    expect(ledgerInserts()[0]).toMatchObject({ tax_cents: 22 })
  })

  it('DARK STREAM: an item with no tax refunds exactly what it always did and writes no row', async () => {
    resolveWith(cancelItem(UNTAXED), order(new Date().toISOString()))
    const res = await buyerCancelPOST(req('/api/buyer/orders/item-1/cancel'), params('item-1'))
    expect(res.status).toBe(200)
    expect(H.mockCreateRefund).toHaveBeenCalledWith('pi_test', 'item-1', BUYER_PAID)
    expect(cancelWrite()).toMatchObject({ refund_amount_cents: BUYER_PAID })
    expect(ledgerInserts()).toEqual([])
    // and the ledger was not even consulted (no tax → no round-trip)
    expect(H.state.calls.some(c => c.table === 'order_item_tax_reversals')).toBe(false)
  })

  it('Stripe fails: the item is cancelled with the inclusive figure recorded, NO ledger row (nothing was refunded)', async () => {
    resolveWith(cancelItem(TAXED), order(new Date().toISOString()))
    H.mockCreateRefund.mockRejectedValueOnce(new Error('card_declined'))
    const res = await buyerCancelPOST(req('/api/buyer/orders/item-1/cancel'), params('item-1'))
    expect(res.status).toBe(200)
    expect((await res.json()).refundFailed).toBe(true)
    expect(ledgerInserts()).toEqual([])
  })
})

// ── Vendor reject (protected route; owner file-level approval 2026-09-26) ──
const VENDOR = { id: 'vendor-1' }
function rejectItem(tax: Record<string, unknown>) {
  return {
    id: 'item-1', status: 'confirmed', quantity: 1, subtotal_cents: 1000, cancelled_at: null,
    vendor_profile_id: 'vp-1', order_id: 'order-1', listing_id: 'listing-1', ...tax,
    order: { id: 'order-1', order_number: 'FM-1', buyer_user_id: 'buyer-1', vertical_id: 'farmers_market', status: 'paid', stripe_checkout_session_id: null, payment_method: 'stripe', payment_model: null, tip_amount: 0, subtotal_cents: 1000 },
    listing: { title: 'Salsa', vendor_profiles: { profile_data: { business_name: 'Farm' } } },
  }
}
const rejectReq = (url: string) => new NextRequest(new Request(`http://localhost${url}`, { method: 'POST', body: JSON.stringify({ reason: 'Sold out' }) }))

describe('vendor reject × sales tax', () => {
  beforeEach(() => {
    H.state.user = VENDOR
    H.mockGetVendorProfile.mockReset().mockResolvedValue({ profile: { id: 'vp-1' }, error: null })
  })

  it('a rejection is a full refund: money + ALL the tax, stored tax-inclusive, one ledger row after Stripe', async () => {
    resolveWith(rejectItem(TAXED), {})
    const res = await vendorRejectPOST(rejectReq('/api/vendor/orders/item-1/reject'), params('item-1'))
    expect(res.status).toBe(200)
    expect(H.mockCreateRefund).toHaveBeenCalledWith('pi_test', 'item-1', BUYER_PAID + 89)
    expect(cancelWrite()).toMatchObject({ refund_amount_cents: BUYER_PAID + 89, cancelled_by: 'vendor' })
    const rows = ledgerInserts()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ order_item_id: 'item-1', order_id: 'order-1', reversal_kind: 'item_refund', refund_ref: 're_test', taxable_amount_cents: 1065, tax_cents: 89 })
    expect((await res.json()).refund_amount_cents).toBe(BUYER_PAID + 89)
  })

  it('DARK STREAM: an untaxed item refunds exactly what it always did — no ledger read, no row', async () => {
    resolveWith(rejectItem(UNTAXED), {})
    const res = await vendorRejectPOST(rejectReq('/api/vendor/orders/item-1/reject'), params('item-1'))
    expect(res.status).toBe(200)
    expect(H.mockCreateRefund).toHaveBeenCalledWith('pi_test', 'item-1', BUYER_PAID)
    expect(cancelWrite()).toMatchObject({ refund_amount_cents: BUYER_PAID })
    expect(H.state.calls.some(c => c.table === 'order_item_tax_reversals')).toBe(false)
  })
})
