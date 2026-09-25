/**
 * Rate corrections for the monthly return — PURE (owner 2026-09-25: "yes" to a
 * rate-correction line when a late rate file changes a rate).
 *
 * THE PROBLEM
 *   A new quarter's Comptroller file can land weeks late. Until it does, the
 *   refresh job carries last quarter's rates forward, so sales in that window
 *   are charged — and frozen on the item snapshot — at the OLD rate. Texas is
 *   owed tax at the rate actually in effect on every sale, whatever we
 *   collected, and we file monthly: the first month of a quarter is filed AFTER
 *   the late file has landed. The return must therefore show the correct tax on
 *   those sales. The platform absorbs the difference (buyers are not re-charged).
 *
 * THE RECORD (mig 261, `tax_rate_corrections`)
 *   When the refresh job applies a changed rate at a market, it records
 *   { market, quarter, applied_at, changes: [{code, old_rate_pct, new_rate_pct}] }.
 *   The snapshots themselves are never edited (4-year audit, §151.0242).
 *
 * THE RULE (applied by the report, to sale AND reversal rows alike)
 *   A row is corrected when its item was sold at that market, in that quarter
 *   (the item's frozen tax_rate_version = the correction's quarter), BEFORE the
 *   correction was applied — and only its jurisdiction lines whose code changed
 *   AND whose frozen rate is still the OLD rate. Such a line is re-stated at the
 *   new rate: tax_cents = round(base × new / 100), the same per-line rounding as
 *   computeItemTax. Reversal rows get the same treatment so a refunded
 *   carried-forward sale still nets to exactly zero on the return.
 *   Everything else passes through untouched.
 */
import type { TaxJurisdictionSnapshot } from './jurisdictions'

export interface RateCorrectionChange {
  code: string
  old_rate_pct: number
  new_rate_pct: number
}

export interface RateCorrection {
  market_id: string
  /** "YYYY-Qn" — matches items' frozen tax_rate_version. */
  quarter: string
  /** ISO — sales strictly before this instant are corrected. */
  applied_at: string
  changes: RateCorrectionChange[]
}

export interface CorrectableRow {
  taxable_amount_cents: number | null
  tax_jurisdictions: TaxJurisdictionSnapshot[] | null
  /** Where and when the ITEM was sold (for a reversal: its original item). */
  market_id: string | null
  sold_at: string | null
  tax_rate_version: string | null
}

export interface CorrectionResult<T> {
  rows: T[]
  /** Extra tax owed by code from re-stating lines (positive = more owed). */
  deltaByCode: Map<string, number>
  correctedRowCount: number
}

export function applyRateCorrections<T extends CorrectableRow>(
  rows: T[],
  corrections: RateCorrection[],
  sign: 1 | -1 = 1
): CorrectionResult<T> {
  const deltaByCode = new Map<string, number>()
  let correctedRowCount = 0
  if (corrections.length === 0) return { rows, deltaByCode, correctedRowCount }

  const out = rows.map((row) => {
    const lines = row.tax_jurisdictions
    const base = row.taxable_amount_cents || 0
    if (!lines || lines.length === 0 || base <= 0 || !row.market_id || !row.sold_at || !row.tax_rate_version) return row

    const applicable = corrections.filter(
      (c) => c.market_id === row.market_id && c.quarter === row.tax_rate_version && row.sold_at! < c.applied_at
    )
    if (applicable.length === 0) return row

    let changed = false
    const newLines = lines.map((line) => {
      for (const c of applicable) {
        const ch = c.changes.find((x) => x.code === line.code && x.old_rate_pct === line.rate_pct)
        if (!ch) continue
        const tax_cents = Math.round((base * ch.new_rate_pct) / 100)
        deltaByCode.set(line.code, (deltaByCode.get(line.code) || 0) + sign * (tax_cents - line.tax_cents))
        changed = true
        return { ...line, rate_pct: ch.new_rate_pct, tax_cents }
      }
      return line
    })
    if (!changed) return row
    correctedRowCount++
    return { ...row, tax_jurisdictions: newLines }
  })

  return { rows: out, deltaByCode, correctedRowCount }
}
