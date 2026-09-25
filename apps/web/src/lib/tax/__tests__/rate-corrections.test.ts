/**
 * Rate corrections + Central-time filing periods — the rules are the spec:
 *  - Texas is owed tax at the rate in effect on the sale, whatever we collected;
 *    carried-forward sales are re-stated at the corrected rate on the return
 *    (the platform absorbs the difference; snapshots are never edited);
 *  - only lines at that market, that quarter, sold before the correction, whose
 *    code changed and whose frozen rate is still the old one, are re-stated;
 *  - a refunded carried-forward sale still nets to zero (reversals re-stated too);
 *  - we file monthly in Texas time: a report's month is Central midnight to
 *    Central midnight, DST-aware (owner 2026-09-25).
 */
import { describe, it, expect } from 'vitest'
import { applyRateCorrections, type RateCorrection, type CorrectableRow } from '../rate-corrections'
import { buildNetListSupplement, computeItemTax } from '../jurisdictions'
import { zonedDayStartUtc, taxPeriodBoundsUtc } from '../filing-period'

const OLD = [
  { code: '7000000', name: 'TEXAS', level: 'state' as const, rate_pct: 6.25 },
  { code: '2188013', name: 'Amarillo', level: 'city' as const, rate_pct: 2 },
]
const CORRECTION: RateCorrection = {
  market_id: 'mkt-ama', quarter: '2026-Q4', applied_at: '2026-10-22T09:00:00.000Z',
  changes: [{ code: '2188013', old_rate_pct: 2, new_rate_pct: 1.75 }],
}

function sale(base: number, soldAt: string, over: Partial<CorrectableRow> = {}): CorrectableRow {
  const c = computeItemTax(base, true, OLD)
  return { taxable_amount_cents: c.taxableAmountCents, tax_jurisdictions: c.jurisdictions, market_id: 'mkt-ama', sold_at: soldAt, tax_rate_version: '2026-Q4', ...over }
}

describe('applyRateCorrections — which lines are re-stated', () => {
  it('a carried-forward sale: the changed code is re-stated at the new rate, the state line untouched', () => {
    const r = applyRateCorrections([sale(1000, '2026-10-05T15:00:00Z')], [CORRECTION])
    const lines = r.rows[0].tax_jurisdictions!
    expect(lines.find((l) => l.code === '2188013')).toMatchObject({ rate_pct: 1.75, tax_cents: 18 }) // 17.5 → 18
    expect(lines.find((l) => l.code === '7000000')).toMatchObject({ rate_pct: 6.25, tax_cents: 63 })
    expect(r.deltaByCode.get('2188013')).toBe(18 - 20)
    expect(r.correctedRowCount).toBe(1)
  })
  it('a rate INCREASE owes more (positive delta)', () => {
    const up = { ...CORRECTION, changes: [{ code: '2188013', old_rate_pct: 2, new_rate_pct: 2.25 }] }
    const r = applyRateCorrections([sale(1000, '2026-10-05T15:00:00Z')], [up])
    expect(r.deltaByCode.get('2188013')).toBe(23 - 20) // 22.5 → 23
  })
  it('sold AFTER the correction was applied → already at the new rate, untouched', () => {
    const after = sale(1000, '2026-10-23T15:00:00Z')
    expect(applyRateCorrections([after], [CORRECTION]).rows[0]).toBe(after)
  })
  it('another market, another quarter, or a line already at the new rate → untouched', () => {
    const rows = [
      sale(1000, '2026-10-05T15:00:00Z', { market_id: 'mkt-canyon' }),
      sale(1000, '2026-09-25T15:00:00Z', { tax_rate_version: '2026-Q3' }),
    ]
    const already = sale(1000, '2026-10-05T15:00:00Z')
    already.tax_jurisdictions = already.tax_jurisdictions!.map((l) => l.code === '2188013' ? { ...l, rate_pct: 1.75, tax_cents: 18 } : l)
    const r = applyRateCorrections([...rows, already], [CORRECTION])
    expect(r.correctedRowCount).toBe(0)
    expect(r.deltaByCode.size).toBe(0)
  })
  it('no corrections → the same rows back', () => {
    const rows = [sale(1000, '2026-10-05T15:00:00Z')]
    expect(applyRateCorrections(rows, []).rows).toBe(rows)
  })
})

describe('on the return — sales corrected, refunds still net to zero', () => {
  it('the October return shows the correct city tax for carried-forward sales', () => {
    const sales = [sale(1000, '2026-10-05T15:00:00Z'), sale(2000, '2026-10-25T15:00:00Z')]
    sales[1].tax_jurisdictions = computeItemTax(2000, true, [OLD[0], { ...OLD[1], rate_pct: 1.75 }]).jurisdictions // sold after: new rate
    const corrected = applyRateCorrections(sales, [CORRECTION]).rows
    const city = buildNetListSupplement(corrected, []).find((r) => r.code === '2188013')!
    expect(city.rate_pct).toBe(1.75)
    expect(city.taxDueCents).toBe(18 + 35)
  })
  it('a carried-forward sale refunded in full nets to zero once both sides are re-stated', () => {
    const s = sale(1000, '2026-10-05T15:00:00Z')
    const reversal = { ...s } // the ledger copies the item snapshot on a full refund
    const net = buildNetListSupplement(
      applyRateCorrections([s], [CORRECTION]).rows,
      applyRateCorrections([reversal], [CORRECTION], -1).rows
    )
    net.forEach((r) => expect(r.taxDueCents).toBe(0))
  })
})

describe('filing period in Central time (monthly returns)', () => {
  it('October 1 starts at 05:00 UTC (CDT) and December 1 at 06:00 UTC (CST)', () => {
    expect(zonedDayStartUtc('2026-10-01').toISOString()).toBe('2026-10-01T05:00:00.000Z')
    expect(zonedDayStartUtc('2026-12-01').toISOString()).toBe('2026-12-01T06:00:00.000Z')
  })
  it('the DST switch days resolve correctly (2026-03-08 and 2026-11-01)', () => {
    expect(zonedDayStartUtc('2026-03-08').toISOString()).toBe('2026-03-08T06:00:00.000Z') // still CST at midnight
    expect(zonedDayStartUtc('2026-03-09').toISOString()).toBe('2026-03-09T05:00:00.000Z')
    expect(zonedDayStartUtc('2026-11-01').toISOString()).toBe('2026-11-01T05:00:00.000Z') // still CDT at midnight
    expect(zonedDayStartUtc('2026-11-02').toISOString()).toBe('2026-11-02T06:00:00.000Z')
  })
  it('a whole October return: Oct 1 00:00 CT through Oct 31 23:59:59.999 CT', () => {
    expect(taxPeriodBoundsUtc('2026-10-01', '2026-10-31')).toEqual({
      startIso: '2026-10-01T05:00:00.000Z',
      endIso: '2026-11-01T04:59:59.999Z',
    })
  })
  it('an 8 pm Halloween sale (01:00 UTC Nov 1) is on the OCTOBER return', () => {
    const { startIso, endIso } = taxPeriodBoundsUtc('2026-10-01', '2026-10-31')
    const sale = '2026-11-01T01:00:00.000Z'
    expect(sale >= startIso && sale <= endIso).toBe(true)
  })
  it('rejects a malformed date', () => {
    expect(() => zonedDayStartUtc('10/01/2026')).toThrow()
  })
})
