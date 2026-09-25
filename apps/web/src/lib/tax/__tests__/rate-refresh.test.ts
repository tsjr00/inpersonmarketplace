/**
 * Quarterly rate-refresh spec — the owner's Q4 ruling (2026-09-24) and the
 * engine's freshness rule are the spec:
 *  - the engine taxes a market only when its rate stamp is the CURRENT quarter;
 *  - a current-quarter file is authoritative: equal rates → stamp; changed →
 *    apply + tell; a vanished code → market to re-verify + tell;
 *  - new quarter + old file (late publication) → CARRY FORWARD last quarter's
 *    rates, stamp current, remember when, remind daily;
 *  - a market an admin verified THIS quarter is never second-guessed by an
 *    older file (the Rate Locator already showed this quarter's rates);
 *  - never apply next quarter's rates early;
 *  - a condition re-detected on every run notifies ONCE (review finding
 *    2026-09-25: the carry-forward conflict would otherwise repeat daily);
 *  - the admin's own note on the tax card is never overwritten.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sent: Array<{ userId: string; type: string; data: Record<string, unknown> }> = []
vi.mock('@/lib/notifications/service', () => ({
  sendNotification: vi.fn(async (userId: string, type: string, data: Record<string, unknown>) => {
    sent.push({ userId, type, data })
    return { success: true }
  }),
}))
vi.mock('@/lib/notifications/admin-recipients', () => ({
  adminRecipientsForVertical: vi.fn(async () => ['admin-1']),
}))
vi.mock('@/lib/errors', () => ({
  logError: vi.fn(async () => {}),
  TracedError: class extends Error {},
  observed: <T>(p: T) => p,
}))

import { planMarketRefresh, runTaxRateRefresh, type RefreshMarketInput } from '../rate-refresh'
import type { RateFileJurisdiction } from '../rate-file'
import type { SupabaseClient } from '@supabase/supabase-js'

const Q3 = new Date('2026-08-15T12:00:00Z')      // inside 2026-Q3
const Q4_DAY3 = new Date('2026-10-03T09:00:00Z') // Q4 has begun

const AMARILLO_CODES = [
  { code: '7000000', name: 'TEXAS', level: 'state', rate_pct: 6.25 },
  { code: '2188013', name: 'Amarillo', level: 'city', rate_pct: 2 },
]

function fileOf(quarter: string, overrides: Record<string, number> = {}, drop: string[] = []) {
  const rates = new Map<string, RateFileJurisdiction>()
  for (const j of AMARILLO_CODES) {
    if (drop.includes(j.code)) continue
    rates.set(j.code, { ...(j as RateFileJurisdiction), rate_pct: overrides[j.code] ?? j.rate_pct })
  }
  return { quarter, rates }
}

function market(over: Partial<RefreshMarketInput> = {}): RefreshMarketInput {
  return {
    id: 'mkt-ama', name: 'Amarillo Community Market', vertical_id: 'farmers_market',
    tax_jurisdictions: AMARILLO_CODES, tax_rate_version: '2026-Q3',
    tax_jurisdiction_verified_at: '2026-09-01T00:00:00Z', tax_rates_carried_forward_at: null,
    tax_jurisdiction_note: 'Rate Locator by lat/long; verified by owner',
    ...over,
  }
}

describe('planMarketRefresh — who is left alone', () => {
  it('no codes / not admin-verified → skip (the intake gate is the admin\'s)', () => {
    expect(planMarketRefresh(market({ tax_jurisdictions: [] }), fileOf('2026-Q3'), Q3)).toEqual({ action: 'skip', reason: 'no_codes' })
    expect(planMarketRefresh(market({ tax_jurisdiction_verified_at: null }), fileOf('2026-Q3'), Q3)).toEqual({ action: 'skip', reason: 'not_verified' })
  })
  it('a file for a FUTURE quarter is never applied early', () => {
    expect(planMarketRefresh(market(), fileOf('2026-Q4', { '2188013': 1.5 }), Q3)).toEqual({ action: 'noop', reason: 'file_is_future' })
  })
})

describe('planMarketRefresh — current-quarter file (authoritative)', () => {
  it('equal rates, already current → nothing to do', () => {
    expect(planMarketRefresh(market(), fileOf('2026-Q3'), Q3)).toEqual({ action: 'noop', reason: 'already_current' })
  })
  it('equal rates, stale stamp → stamp the quarter', () => {
    expect(planMarketRefresh(market({ tax_rate_version: '2026-Q2' }), fileOf('2026-Q3'), Q3))
      .toEqual({ action: 'stamp', version: '2026-Q3', clearCarryForward: false })
  })
  it('a changed rate → apply the file\'s rate and report old → new', () => {
    const plan = planMarketRefresh(market(), fileOf('2026-Q3', { '2188013': 1.75 }), Q3)
    expect(plan).toMatchObject({ action: 'update', version: '2026-Q3', wasCarriedForward: false })
    if (plan.action !== 'update') throw new Error('unreachable')
    expect(plan.changes).toEqual([{ code: '2188013', name: 'Amarillo', oldRatePct: 2, newRatePct: 1.75 }])
    expect(plan.jurisdictions.find((j) => j.code === '2188013')!.rate_pct).toBe(1.75)
  })
  it('a code missing from the file → flag it (market goes to re-verify)', () => {
    expect(planMarketRefresh(market(), fileOf('2026-Q3', {}, ['2188013']), Q3)).toEqual({ action: 'flag_missing', missing: ['2188013'] })
  })
  it('the late file lands with the SAME rates → stamp and clear the carry-forward', () => {
    const carried = market({ tax_rate_version: '2026-Q4', tax_rates_carried_forward_at: '2026-10-01T09:00:00Z' })
    expect(planMarketRefresh(carried, fileOf('2026-Q4'), Q4_DAY3)).toEqual({ action: 'stamp', version: '2026-Q4', clearCarryForward: true })
  })
  it('the late file lands with a CHANGED rate → update, flagged as carried (in-between orders get counted)', () => {
    const carried = market({ tax_rate_version: '2026-Q4', tax_rates_carried_forward_at: '2026-10-01T09:00:00Z' })
    expect(planMarketRefresh(carried, fileOf('2026-Q4', { '2188013': 2 - 0.25 }), Q4_DAY3)).toMatchObject({ action: 'update', wasCarriedForward: true })
  })
})

describe('planMarketRefresh — new quarter, old file (owner Q4: carry forward)', () => {
  it('rates match last quarter\'s file → carry forward into the new quarter', () => {
    expect(planMarketRefresh(market(), fileOf('2026-Q3'), Q4_DAY3))
      .toEqual({ action: 'carry_forward', version: '2026-Q4', fileQuarter: '2026-Q3', alreadyCarried: false })
  })
  it('already carried this quarter → recognised, not re-written', () => {
    const carried = market({ tax_rate_version: '2026-Q4', tax_rates_carried_forward_at: '2026-10-01T09:00:00Z' })
    expect(planMarketRefresh(carried, fileOf('2026-Q3'), Q4_DAY3)).toMatchObject({ action: 'carry_forward', alreadyCarried: true })
  })
  it('saved rates disagree with the old file (and no admin verified this quarter) → conflict, nothing stamped', () => {
    expect(planMarketRefresh(market({ tax_jurisdictions: [AMARILLO_CODES[0], { ...AMARILLO_CODES[1], rate_pct: 1.5 }] }), fileOf('2026-Q3'), Q4_DAY3))
      .toMatchObject({ action: 'carry_forward_conflict', fileQuarter: '2026-Q3' })
  })
  it('REVIEW FINDING: an admin verified this quarter from the Rate Locator → the older file does not second-guess it', () => {
    // New-quarter rate the old file does not have yet:
    const adminQ4 = market({ tax_rate_version: '2026-Q4', tax_jurisdictions: [AMARILLO_CODES[0], { ...AMARILLO_CODES[1], rate_pct: 1.75 }] })
    expect(planMarketRefresh(adminQ4, fileOf('2026-Q3'), Q4_DAY3)).toEqual({ action: 'noop', reason: 'already_current' })
    // A jurisdiction that only starts this quarter (absent from the old file):
    const newSpd = market({ tax_rate_version: '2026-Q4', tax_jurisdictions: [...AMARILLO_CODES, { code: '6188699', name: 'New SPD', level: 'spd', rate_pct: 0.25 }] })
    expect(planMarketRefresh(newSpd, fileOf('2026-Q3'), Q4_DAY3)).toEqual({ action: 'noop', reason: 'already_current' })
  })
})

// ── The runner, against a fake service client ──────────────────────────────
type Row = Record<string, unknown>
function fakeService(opts: { markets: RefreshMarketInput[]; existingNotifications?: Row[] }) {
  const updates: Array<{ id: string; patch: Row }> = []
  const corrections: Row[] = []
  const notifications = [...(opts.existingNotifications ?? [])]
  const client = {
    from(table: string) {
      if (table === 'markets') {
        return {
          select: () => ({ not: async () => ({ data: opts.markets, error: null }) }),
          update: (patch: Row) => ({ eq: async (_c: string, id: string) => { updates.push({ id, patch }); return { error: null } } }),
        }
      }
      if (table === 'notifications') {
        const filters: Row = {}
        const chain = {
          select: () => chain,
          eq: (c: string, v: unknown) => { filters[c] = v; return chain },
          contains: (_c: string, v: Row) => { filters.dedupRef = v.dedupRef; return chain },
          gte: () => chain,
          limit: async () => ({ data: notifications.filter((n) => n.type === filters.type && (n.data as Row).dedupRef === filters.dedupRef), error: null }),
        }
        return chain
      }
      if (table === 'tax_rate_corrections') {
        return { insert: async (row: Row) => { corrections.push(row); return { error: null } } }
      }
      if (table === 'order_items') {
        const chain = { select: () => chain, eq: () => chain, gte: () => chain, gt: async () => ({ count: 4, error: null }) }
        return chain
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
  return { client: client as unknown as SupabaseClient, updates, notifications, corrections }
}

const Q3_FIXTURE_HEADER = '1\t20263\t202609\t2026 - 3rd\t0.0625\t0\t1\tmsg\r\n'
const AMA_ROW = 'Amarillo \t2188013\t0.02\tPotter \tn/a\t0\tn/a\tn/a\t0\tn/a\tn/a\t0\r\n'

describe('runTaxRateRefresh', () => {
  beforeEach(() => { sent.length = 0 })

  it('a fetch/parse failure touches no market and says so', async () => {
    const svc = fakeService({ markets: [market()] })
    const s = await runTaxRateRefresh(svc.client, { now: Q4_DAY3, fetchText: async () => '<html>503</html>' })
    expect(s.fetchOk).toBe(false)
    expect(svc.updates).toEqual([])
    expect(sent).toEqual([])
  })

  it('carry forward: stamps current, records when, APPENDS to the admin note, reminds once', async () => {
    const svc = fakeService({ markets: [market()] })
    const s = await runTaxRateRefresh(svc.client, { now: Q4_DAY3, fetchText: async () => Q3_FIXTURE_HEADER + AMA_ROW })
    expect(s.carriedForward).toBe(1)
    expect(svc.updates).toHaveLength(1)
    const patch = svc.updates[0].patch
    expect(patch.tax_rate_version).toBe('2026-Q4')
    expect(patch.tax_rates_carried_forward_at).toBe(Q4_DAY3.toISOString())
    expect(String(patch.tax_jurisdiction_note)).toMatch(/^Rate Locator by lat\/long; verified by owner\n2026-10-03 \(auto\): 2026-Q3 rates carried forward/)
    expect(sent.map((n) => n.type)).toEqual(['tax_rate_file_missing_admin'])
  })

  it('REVIEW FINDING: a conflict re-detected on the next run does not notify again', async () => {
    const conflicting = market({ tax_jurisdictions: [AMARILLO_CODES[0], { ...AMARILLO_CODES[1], rate_pct: 1.5 }] })
    const first = fakeService({ markets: [conflicting] })
    await runTaxRateRefresh(first.client, { now: Q4_DAY3, fetchText: async () => Q3_FIXTURE_HEADER + AMA_ROW })
    expect(sent.map((n) => n.type)).toEqual(['tax_rates_changed_admin'])
    const ref = sent[0].data.dedupRef

    sent.length = 0
    const second = fakeService({ markets: [conflicting], existingNotifications: [{ type: 'tax_rates_changed_admin', data: { dedupRef: ref } }] })
    await runTaxRateRefresh(second.client, { now: new Date('2026-10-04T09:00:00Z'), fetchText: async () => Q3_FIXTURE_HEADER + AMA_ROW })
    expect(sent).toEqual([])
    expect(second.updates).toEqual([]) // and nothing was stamped
  })

  it('a late file that changes a rate: applies it, counts the in-between taxed items, tells the admins', async () => {
    const carried = market({ tax_rate_version: '2026-Q4', tax_rates_carried_forward_at: '2026-10-01T09:00:00Z' })
    const svc = fakeService({ markets: [carried] })
    const q4File = '1\t20264\t202612\t2026 - 4th\t0.0625\t0\t1\tmsg\r\n' + AMA_ROW.replace('0.02', '0.0175')
    const s = await runTaxRateRefresh(svc.client, { now: new Date('2026-10-20T09:00:00Z'), fetchText: async () => q4File })
    expect(s.updated).toBe(1)
    expect(svc.updates[0].patch).toMatchObject({ tax_rate_version: '2026-Q4', tax_rates_carried_forward_at: null, tax_rate_total_pct: 8 })
    expect(String(sent[0].data.changeSummary)).toMatch(/Amarillo 2% → 1\.75%.*4 taxed items sold at this market on the carried-forward rates since 2026-10-01/)
    // Owner 2026-09-25: the monthly return re-states the old-rate sales from this record.
    expect(svc.corrections).toEqual([{
      market_id: 'mkt-ama', quarter: '2026-Q4', applied_at: '2026-10-20T09:00:00.000Z',
      changes: [{ code: '2188013', old_rate_pct: 2, new_rate_pct: 1.75 }],
    }])
  })
})
