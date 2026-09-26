/**
 * Refund-tax LEDGER I/O spec — the rules are the spec (refund-ledger.ts header;
 * plan `tax_build_review_research.md` 2026-09-26 items 1–5):
 *  - what an item still owes = the snapshot math capped by what the ledger
 *    already holds for it (original-rate rule + never over-reverse);
 *  - a ledger READ failure before the refund THROWS (nothing has moved yet;
 *    guessing either way would refund tax twice or short the buyer);
 *  - a ledger WRITE failure after the Stripe refund NEVER throws — it is
 *    logged with what to re-enter, and the refund stands;
 *  - a zero reversal writes no row; a retried refund (same item, same Stripe
 *    refund id) is a `duplicate`, never a second row;
 *  - the row is the snapshot's shape, ready for the return's group-by.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const logged: Array<{ code: string; message: string; context: Record<string, unknown> | undefined }> = []
vi.mock('@/lib/errors', () => ({
  logError: vi.fn(async (e: { code: string; message: string; context?: Record<string, unknown> }) => {
    logged.push({ code: e.code, message: e.message, context: e.context })
  }),
  TracedError: class extends Error {
    code: string
    context: Record<string, unknown> | undefined
    constructor(code: string, message: string, context?: Record<string, unknown>) {
      super(message); this.code = code; this.context = context
    }
  },
  observed: <T>(p: T) => p,
}))

import {
  alreadyReversedCents,
  taxReversalForOrderItem,
  recordTaxReversal,
  recordOrderTaxReversals,
  taxReversalRecorded,
  TAX_REVERSAL_LEDGER,
} from '../refund-ledger'
import { computeItemTax } from '../jurisdictions'
import type { ItemTaxSnapshot } from '../refund-tax'
import type { SupabaseClient } from '@supabase/supabase-js'

const AUSTIN = [
  { code: '7000000', name: 'TEXAS', level: 'state' as const, rate_pct: 6.25 },
  { code: '2227000', name: 'AUSTIN', level: 'city' as const, rate_pct: 1.0 },
  { code: '3227000', name: 'AUSTIN MTA', level: 'transit' as const, rate_pct: 1.0 },
]
function snapshotFor(baseCents: number): ItemTaxSnapshot {
  const c = computeItemTax(baseCents, true, AUSTIN)
  return { taxable_amount_cents: c.taxableAmountCents, tax_amount_cents: c.taxAmountCents, tax_jurisdictions: c.jurisdictions, tax_rate_version: '2026-Q3' }
}

type Row = Record<string, unknown>
/** A fake service client: `rows` is the ledger, `orderItems` the order's items; `readError`/`insertError` fault the two sides. */
function fakeService(opts: { rows?: Row[]; orderItems?: Row[]; readError?: { message: string }; insertError?: { code?: string; message: string } } = {}) {
  const rows = [...(opts.rows ?? [])]
  const inserted: Row[] = []
  // Every call to from() gets its own filter set, so one query's .eq never leaks into the next.
  const query = (source: Row[]) => {
    const filters: Row = {}
    let nullFilter: string | null = null
    const result = () => ({
      data: opts.readError ? null : source.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v) && (nullFilter === null || r[nullFilter] == null)),
      error: opts.readError ?? null,
    })
    const chain = {
      select: () => chain,
      eq: (k: string, v: unknown) => { filters[k] = v; return chain },
      is: (k: string) => { nullFilter = k; return chain },
      limit: () => chain,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
    }
    return chain
  }
  const queueResolved: Array<{ patch: Row; refundRef: unknown }> = []
  const client = {
    from: (table: string) => {
      if (table === 'order_items') return query(opts.orderItems ?? [])
      if (table === 'order_tax_reversal_queue') {
        // update(...).eq('stripe_refund_id', ref).is('resolved_at', null) → { error }
        let patch: Row = {}
        let refundRef: unknown
        const chain = {
          update: (p: Row) => { patch = p; return chain },
          eq: (_k: string, v: unknown) => { refundRef = v; return chain },
          is: () => chain,
          then: (resolve: (v: unknown) => unknown) => { queueResolved.push({ patch, refundRef }); return Promise.resolve({ error: null }).then(resolve) },
        }
        return chain
      }
      if (table !== TAX_REVERSAL_LEDGER) throw new Error(`unexpected table ${table}`)
      return { ...query(rows), insert: async (row: Row) => { if (opts.insertError) return { error: opts.insertError }; inserted.push(row); rows.push(row); return { error: null } } }
    },
  }
  return { client: client as unknown as SupabaseClient, inserted, queueResolved }
}

beforeEach(() => { logged.length = 0 })

describe('alreadyReversedCents — what the ledger already holds for an item', () => {
  it('sums tax_cents over every row for that item, 0 when none', async () => {
    const svc = fakeService({ rows: [
      { order_item_id: 'item-1', tax_cents: 40 },
      { order_item_id: 'item-1', tax_cents: 22 },
      { order_item_id: 'item-2', tax_cents: 99 },
    ] })
    expect(await alreadyReversedCents(svc.client, 'item-1')).toBe(62)
    expect(await alreadyReversedCents(svc.client, 'item-3')).toBe(0)
  })
  it('THROWS on a read failure — never guesses before money moves', async () => {
    const svc = fakeService({ readError: { message: 'connection reset' } })
    await expect(alreadyReversedCents(svc.client, 'item-1')).rejects.toMatchObject({ code: 'ERR_REFUND_001' })
  })
})

describe('taxReversalForOrderItem — snapshot math capped by the ledger', () => {
  it('a first full refund reverses the whole snapshot', async () => {
    const svc = fakeService()
    const r = await taxReversalForOrderItem(svc.client, 'item-1', snapshotFor(1000), { kind: 'full' })
    expect(r.taxCents).toBe(83)
    expect(r.jurisdictions.map((j) => j.tax_cents)).toEqual([63, 10, 10])
  })
  it('after an earlier 75% reversal, a full refund returns only the remaining 25%', async () => {
    const svc = fakeService({ rows: [{ order_item_id: 'item-1', tax_cents: 62 }] })
    const r = await taxReversalForOrderItem(svc.client, 'item-1', snapshotFor(1000), { kind: 'full' })
    expect(r.taxCents).toBe(83 - 62)
  })
  it('an item with no tax needs no ledger round-trip — even a broken ledger reverses zero', async () => {
    const svc = fakeService({ readError: { message: 'down' } })
    const exempt: ItemTaxSnapshot = { taxable_amount_cents: 0, tax_amount_cents: 0, tax_jurisdictions: [], tax_rate_version: '2026-Q3' }
    const pre: ItemTaxSnapshot = { taxable_amount_cents: null, tax_amount_cents: null, tax_jurisdictions: null, tax_rate_version: null }
    expect((await taxReversalForOrderItem(svc.client, 'item-1', exempt, { kind: 'full' })).taxCents).toBe(0)
    expect((await taxReversalForOrderItem(svc.client, 'item-1', pre, { kind: 'full' })).taxCents).toBe(0)
  })
})

describe('recordTaxReversal — one append-only row after Stripe succeeded', () => {
  const reversal = { taxableAmountCents: 1000, taxCents: 83, jurisdictions: snapshotFor(1000).tax_jurisdictions!, rateVersion: '2026-Q3' }
  const input = { orderItemId: 'item-1', orderId: 'order-1', kind: 'item_refund' as const, refundRef: 're_abc', reversal, route: '/api/test' }

  it('writes the row in the snapshot shape and reports recorded', async () => {
    const svc = fakeService()
    expect(await recordTaxReversal(svc.client, input)).toBe('recorded')
    expect(svc.inserted).toEqual([{
      order_item_id: 'item-1', order_id: 'order-1', reversal_kind: 'item_refund', refund_ref: 're_abc',
      taxable_amount_cents: 1000, tax_cents: 83, tax_jurisdictions: reversal.jurisdictions, tax_rate_version: '2026-Q3',
    }])
    expect(logged).toEqual([])
  })
  it('a zero reversal writes nothing', async () => {
    const svc = fakeService()
    expect(await recordTaxReversal(svc.client, { ...input, reversal: { ...reversal, taxCents: 0, jurisdictions: [] } })).toBe('skipped')
    expect(svc.inserted).toEqual([])
    expect(svc.queueResolved).toEqual([])
  })
  it('SELF-HEAL: recording (or re-recording) our refund closes any "owed" queue row the webhook opened for it', async () => {
    // The charge.refunded webhook can arrive before this write; if it queued
    // the refund as a dashboard one, the ledger row is the allocation — close it.
    const svc = fakeService()
    await recordTaxReversal(svc.client, input)
    expect(svc.queueResolved).toHaveLength(1)
    expect(svc.queueResolved[0].refundRef).toBe('re_abc')
    expect(svc.queueResolved[0].patch).toMatchObject({ resolved_at: expect.any(String), note: expect.stringMatching(/made in-app/) })
    const dup = fakeService({ insertError: { code: '23505', message: 'duplicate' } })
    expect(await recordTaxReversal(dup.client, input)).toBe('duplicate')
    expect(dup.queueResolved).toHaveLength(1)
  })
  it('the same item + Stripe refund id twice is a duplicate, not a second row (retry / webhook race)', async () => {
    const svc = fakeService({ insertError: { code: '23505', message: 'duplicate key value violates unique constraint' } })
    expect(await recordTaxReversal(svc.client, input)).toBe('duplicate')
    expect(logged).toEqual([])
  })
  it('any other write failure is logged with what to re-enter and NEVER throws', async () => {
    const svc = fakeService({ insertError: { code: '42P01', message: 'relation does not exist' } })
    expect(await recordTaxReversal(svc.client, input)).toBe('failed')
    expect(logged).toHaveLength(1)
    expect(logged[0].code).toBe('ERR_REFUND_001')
    expect(logged[0].message).toMatch(/item-1.*re_abc.*83¢/)
    expect(logged[0].context).toMatchObject({ route: '/api/test', orderItemId: 'item-1', orderId: 'order-1', amountCents: 83 })
  })
})

describe('recordOrderTaxReversals — a whole-payment refund writes one row per live taxed item', () => {
  const snap = snapshotFor(1000) // 83¢ of tax
  const exempt = { taxable_amount_cents: 0, tax_amount_cents: 0, tax_jurisdictions: [], tax_rate_version: '2026-Q3' }
  const orderItems = [
    { id: 'item-a', order_id: 'order-1', cancelled_at: null, ...snap },
    { id: 'item-b', order_id: 'order-1', cancelled_at: null, ...exempt },
    { id: 'item-c', order_id: 'order-1', cancelled_at: '2026-09-20T00:00:00Z', ...snap }, // refunded earlier, per item
    { id: 'item-z', order_id: 'order-2', cancelled_at: null, ...snap },                   // another order
  ]
  const input = { orderId: 'order-1', refundRef: 're_whole', kind: 'order_refund' as const, route: '/api/test' }

  it('rows for the live taxed items only, all under the one Stripe refund id; exempt = skipped, cancelled/other orders untouched', async () => {
    const svc = fakeService({ orderItems })
    const s = await recordOrderTaxReversals(svc.client, input)
    expect(s).toEqual({ items: 2, recorded: 1, duplicate: 0, skipped: 1, failed: 0 })
    expect(svc.inserted).toEqual([expect.objectContaining({ order_item_id: 'item-a', order_id: 'order-1', reversal_kind: 'order_refund', refund_ref: 're_whole', tax_cents: 83 })])
  })
  it('an item partly reversed before gets only what remains (cap)', async () => {
    const svc = fakeService({ orderItems, rows: [{ order_item_id: 'item-a', tax_cents: 62, refund_ref: 're_earlier' }] })
    await recordOrderTaxReversals(svc.client, input)
    expect(svc.inserted[0]).toMatchObject({ order_item_id: 'item-a', tax_cents: 83 - 62 })
  })
  it('a retried whole refund is all duplicates, never a second row', async () => {
    const svc = fakeService({ orderItems, insertError: { code: '23505', message: 'duplicate' } })
    const s = await recordOrderTaxReversals(svc.client, input)
    expect(s.duplicate).toBe(1)
    expect(logged).toEqual([])
  })
  it('NEVER throws after Stripe succeeded — a read failure is logged with the refund id', async () => {
    const svc = fakeService({ orderItems, readError: { message: 'timeout' } })
    const s = await recordOrderTaxReversals(svc.client, input)
    expect(s.failed).toBe(1)
    expect(logged.some((l) => l.code === 'ERR_REFUND_001' && /order-1.*re_whole/.test(l.message))).toBe(true)
  })
})

describe('taxReversalRecorded — is this Stripe refund ours?', () => {
  it('true when any ledger row carries the refund id, false otherwise', async () => {
    const svc = fakeService({ rows: [{ id: 'x', refund_ref: 're_ours' }] })
    expect(await taxReversalRecorded(svc.client, 're_ours')).toBe(true)
    expect(await taxReversalRecorded(svc.client, 're_dashboard')).toBe(false)
  })
  it('THROWS on a read failure — the caller must not mistake "unknown" for "dashboard"', async () => {
    const svc = fakeService({ readError: { message: 'timeout' } })
    await expect(taxReversalRecorded(svc.client, 're_ours')).rejects.toMatchObject({ code: 'ERR_REFUND_001' })
  })
})
