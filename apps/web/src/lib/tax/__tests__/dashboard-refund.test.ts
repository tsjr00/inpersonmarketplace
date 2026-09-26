/**
 * charge.refunded × sales tax spec — the rules are the spec (owner Q2
 * 2026-09-24; design 2026-09-26):
 *  - a refund OUR routes made (metadata.source = 'app', or a ledger row under
 *    its id for refunds made before the tag) → the webhook does nothing;
 *  - a FULL dashboard refund → one ledger row per live taxed item;
 *  - a PARTIAL dashboard refund on a taxed order → one "reversal owed" queue
 *    row, never a pro-rata guess; on an untaxed order → nothing;
 *  - the triggering refund is read off the charge when present, else listed;
 *  - it NEVER throws (a throw would make Stripe retry the whole event).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const logged: string[] = []
vi.mock('@/lib/errors', () => ({
  logError: vi.fn(async (e: { message: string }) => { logged.push(e.message) }),
  TracedError: class extends Error { code: string; constructor(code: string, message: string) { super(message); this.code = code } },
  observed: <T>(p: T) => p,
}))

import { reconcileChargeRefundTax, type ChargeLike } from '../dashboard-refund'
import { computeItemTax } from '../jurisdictions'
import type { SupabaseClient } from '@supabase/supabase-js'

const AUSTIN = [
  { code: '7000000', name: 'TEXAS', level: 'state' as const, rate_pct: 6.25 },
  { code: '2227000', name: 'AUSTIN', level: 'city' as const, rate_pct: 1.0 },
]
const snap = computeItemTax(1000, true, AUSTIN) // 63 + 10 = 73
const TAXED_ITEM = { id: 'item-1', order_id: 'order-1', cancelled_at: null, taxable_amount_cents: snap.taxableAmountCents, tax_amount_cents: snap.taxAmountCents, tax_jurisdictions: snap.jurisdictions, tax_rate_version: '2026-Q3' }
const UNTAXED_ITEM = { id: 'item-2', order_id: 'order-1', cancelled_at: null, taxable_amount_cents: null, tax_amount_cents: null, tax_jurisdictions: null, tax_rate_version: null }

type Row = Record<string, unknown>
function fakeService(opts: { items?: Row[]; ledger?: Row[]; queueInsertError?: { code?: string; message: string }; itemsError?: { message: string } } = {}) {
  const ledger = [...(opts.ledger ?? [])]
  const ledgerInserts: Row[] = []
  const queueInserts: Row[] = []
  const query = (source: Row[], error: { message: string } | null = null) => {
    const filters: Row = {}; let nullCol: string | null = null; let gtCol: string | null = null
    const chain = {
      select: () => chain,
      eq: (k: string, v: unknown) => { filters[k] = v; return chain },
      is: (k: string) => { nullCol = k; return chain },
      gt: (k: string) => { gtCol = k; return chain },
      limit: () => chain,
      then: (res: (v: unknown) => unknown) => Promise.resolve({
        data: error ? null : source.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v) && (nullCol === null || r[nullCol] == null) && (gtCol === null || ((r[gtCol] as number) ?? 0) > 0)),
        error,
      }).then(res),
    }
    return chain
  }
  const client = {
    from: (table: string) => {
      if (table === 'order_items') return query(opts.items ?? [], opts.itemsError ?? null)
      if (table === 'order_item_tax_reversals') return { ...query(ledger), insert: async (row: Row) => { ledgerInserts.push(row); ledger.push(row); return { error: null } } }
      if (table === 'order_tax_reversal_queue') return {
        insert: async (row: Row) => { if (opts.queueInsertError) return { error: opts.queueInsertError }; queueInserts.push(row); return { error: null } },
        update: () => ({ eq: () => ({ is: () => Promise.resolve({ error: null }) }) }),
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
  return { client: client as unknown as SupabaseClient, ledgerInserts, queueInserts }
}

const charge = (amountRefunded: number, refunds?: Array<{ id: string; amount: number; created: number; metadata?: Record<string, string> | null }>): ChargeLike =>
  ({ amount: 1180, amount_refunded: amountRefunded, ...(refunds ? { refunds: { data: refunds } } : {}) })
const listNone = async () => []

beforeEach(() => { logged.length = 0 })

describe('ours — the routes already handled the tax', () => {
  it('metadata.source = app → nothing written', async () => {
    const svc = fakeService({ items: [TAXED_ITEM] })
    const r = await reconcileChargeRefundTax(svc.client, listNone, charge(500, [{ id: 're_app', amount: 500, created: 2, metadata: { source: 'app' } }]), 'order-1')
    expect(r).toEqual({ outcome: 'ours', refundId: 're_app' })
    expect(svc.ledgerInserts).toEqual([]); expect(svc.queueInserts).toEqual([])
  })
  it('no tag (pre-deploy refund) but a ledger row under its id → ours, nothing written', async () => {
    const svc = fakeService({ items: [TAXED_ITEM], ledger: [{ id: 'x', refund_ref: 're_old' }] })
    const r = await reconcileChargeRefundTax(svc.client, listNone, charge(500, [{ id: 're_old', amount: 500, created: 2, metadata: null }]), 'order-1')
    expect(r.outcome).toBe('ours')
    expect(svc.queueInserts).toEqual([])
  })
})

describe('dashboard refunds', () => {
  it('FULL → one dashboard_refund ledger row per live taxed item, capped by earlier reversals', async () => {
    const svc = fakeService({ items: [TAXED_ITEM, UNTAXED_ITEM], ledger: [{ order_item_id: 'item-1', tax_cents: 10, refund_ref: 're_earlier' }] })
    const r = await reconcileChargeRefundTax(svc.client, listNone, charge(1180, [{ id: 're_dash', amount: 1180, created: 5, metadata: null }]), 'order-1')
    expect(r).toEqual({ outcome: 'dashboard_full', refundId: 're_dash' })
    expect(svc.ledgerInserts).toEqual([expect.objectContaining({ order_item_id: 'item-1', reversal_kind: 'dashboard_refund', refund_ref: 're_dash', tax_cents: 73 - 10 })])
    expect(svc.queueInserts).toEqual([])
  })
  it('PARTIAL on a taxed order → ONE "reversal owed" queue row (amount known, items unknown), no ledger row', async () => {
    const svc = fakeService({ items: [TAXED_ITEM] })
    const r = await reconcileChargeRefundTax(svc.client, listNone, charge(400, [{ id: 're_part', amount: 400, created: 5, metadata: null }]), 'order-1')
    expect(r).toEqual({ outcome: 'dashboard_partial_queued', refundId: 're_part' })
    expect(svc.queueInserts).toEqual([{ order_id: 'order-1', stripe_refund_id: 're_part', refund_amount_cents: 400 }])
    expect(svc.ledgerInserts).toEqual([])
  })
  it('PARTIAL on an untaxed order → nothing to allocate, no queue row', async () => {
    const svc = fakeService({ items: [UNTAXED_ITEM] })
    const r = await reconcileChargeRefundTax(svc.client, listNone, charge(400, [{ id: 're_part', amount: 400, created: 5, metadata: null }]), 'order-1')
    expect(r.outcome).toBe('dashboard_partial_no_tax')
    expect(svc.queueInserts).toEqual([])
  })
  it('a retried event (queue row already exists, 23505) is treated as queued, not failed', async () => {
    const svc = fakeService({ items: [TAXED_ITEM], queueInsertError: { code: '23505', message: 'duplicate' } })
    const r = await reconcileChargeRefundTax(svc.client, listNone, charge(400, [{ id: 're_part', amount: 400, created: 5, metadata: null }]), 'order-1')
    expect(r.outcome).toBe('dashboard_partial_queued')
    expect(logged).toEqual([])
  })
})

describe('finding the refund', () => {
  it('when the charge carries no refunds list, the newest listed refund is used', async () => {
    const svc = fakeService({ items: [TAXED_ITEM] })
    const list = async () => [
      { id: 're_older', amount: 300, created: 1, metadata: null },
      { id: 're_newest', amount: 400, created: 9, metadata: null },
    ]
    const r = await reconcileChargeRefundTax(svc.client, list, charge(700), 'order-1')
    expect(r.refundId).toBe('re_newest')
    expect(svc.queueInserts[0]).toMatchObject({ stripe_refund_id: 're_newest', refund_amount_cents: 400 })
  })
  it('no refund anywhere → logged, nothing written, never throws', async () => {
    const svc = fakeService({ items: [TAXED_ITEM] })
    const r = await reconcileChargeRefundTax(svc.client, listNone, charge(700), 'order-1')
    expect(r.outcome).toBe('no_refund_found')
    expect(logged.some((m) => /no refund object found/.test(m))).toBe(true)
  })
})

describe('never throws', () => {
  it('a database failure is logged and the event completes', async () => {
    const svc = fakeService({ items: [TAXED_ITEM], itemsError: { message: 'connection reset' } })
    const r = await reconcileChargeRefundTax(svc.client, listNone, charge(400, [{ id: 're_part', amount: 400, created: 5, metadata: null }]), 'order-1')
    expect(r.outcome).toBe('failed')
    expect(logged.some((m) => /tax bookkeeping failed for order order-1/.test(m))).toBe(true)
  })
})
