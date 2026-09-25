/**
 * Texas Comptroller quarterly sales-tax rate file — parser (PURE).
 *
 * Source (verified live 2026-09-24, research file "Step 12 spike"):
 *   current quarter  https://comptroller.texas.gov/data/edi/sales-tax/taxrates.txt
 *   archives         …/taxrates{YY}{Q}.txt   (e.g. taxrates263.txt = 2026 Q3)
 *
 * Layout, learned from the file itself (there is no published spec):
 *   line 1  header, tab-separated:
 *           "1" ⇥ YYYYQ (the quarter this file DESCRIBES, e.g. 20263) ⇥ YYYYMM ⇥
 *           label ("2026 - 3rd") ⇥ state rate as a decimal (0.0625) ⇥ 0 ⇥ row count ⇥ message
 *   then    ~16 filing-due-date rows ("20261 ⇥ q ⇥ 4/20/2026 …") — ignored
 *   then    one row per AREA, 12 tab-separated fields = four (name, code, rate) triples:
 *           area name ⇥ code ⇥ rate ⇥ county ⇥ code ⇥ rate ⇥ [name ⇥ code ⇥ rate] ⇥ [name ⇥ code ⇥ rate]
 *           "n/a" where a slot is empty; rates are DECIMALS (0.02 = 2 %); CRLF line ends.
 *
 * Facts this parser relies on (checked against the full 3,715-row Q3 file):
 *   - a seven-digit code carries EXACTLY ONE rate across the whole file, so the
 *     safe primitive is a code → rate map built from ALL four triples;
 *   - the triple slots are NOT typed by position (a transit authority appeared
 *     in the fourth slot; 111 area rows carry an SPD code in the second slot),
 *     so the jurisdiction LEVEL is read from the code's first digit:
 *     2 city · 3 transit · 4 county · 5 / 6 special purpose district;
 *   - the state row (7000000) is not among the area rows — it comes from the
 *     header's state rate.
 *
 * Refuses loudly on a malformed header: a file we cannot date must never
 * stamp a market (compute-cart-tax.ts freshness = exact quarter equality).
 */
import type { JurisdictionLevel } from './jurisdictions'
import { TX_STATE_RATE_PCT } from './jurisdictions'

export const TX_RATE_FILE_URL = 'https://comptroller.texas.gov/data/edi/sales-tax/taxrates.txt'

export interface RateFileJurisdiction {
  code: string
  name: string
  level: JurisdictionLevel
  rate_pct: number
}

export interface ParsedRateFile {
  /** "YYYY-Qn" — the quarter the file says it describes (header field 2). */
  quarter: string
  stateRatePct: number
  /** Header's own row count (field 7) — a sanity check against rows parsed. */
  declaredRowCount: number
  parsedRowCount: number
  /** code → jurisdiction (one rate per code). */
  rates: Map<string, RateFileJurisdiction>
  /** Codes seen with more than one distinct rate — expected empty; never silently pick one. */
  conflicts: Array<{ code: string; rates: number[] }>
}

export class RateFileParseError extends Error {}

const CODE_RE = /^\d{7}$/

function levelForCode(code: string): JurisdictionLevel {
  switch (code[0]) {
    case '2': return 'city'
    case '3': return 'transit'
    case '4': return 'county'
    case '7': return 'state'
    default: return 'spd' // 5… and 6… are special purpose / assistance districts
  }
}

/** Decimal → percent with the same 4-dp rounding the admin PUT uses. */
export function decimalToPct(decimal: number): number {
  return Math.round(decimal * 100 * 10000) / 10000
}

/** "20263" → "2026-Q3" (the engine's freshness label shape). */
export function quarterLabelFromHeader(yyyyq: string): string {
  const m = /^(\d{4})([1-4])$/.exec(yyyyq.trim())
  if (!m) throw new RateFileParseError(`Rate file header quarter "${yyyyq}" is not YYYYQ`)
  return `${m[1]}-Q${m[2]}`
}

export function parseRateFile(text: string): ParsedRateFile {
  const lines = text.split(/\r?\n/)
  if (lines.length === 0 || !lines[0]) throw new RateFileParseError('Rate file is empty')

  const header = lines[0].split('\t')
  if (header[0]?.trim() !== '1' || header.length < 7) {
    throw new RateFileParseError(`Rate file header not recognised: "${lines[0].slice(0, 80)}"`)
  }
  const quarter = quarterLabelFromHeader(header[1])
  const stateRateDecimal = Number(header[4])
  if (!Number.isFinite(stateRateDecimal) || stateRateDecimal <= 0) {
    throw new RateFileParseError(`Rate file header state rate "${header[4]}" is not a number`)
  }
  const stateRatePct = decimalToPct(stateRateDecimal)
  const declaredRowCount = Number.parseInt(header[6], 10) || 0

  const rates = new Map<string, RateFileJurisdiction>()
  const seen = new Map<string, Set<number>>()
  rates.set('7000000', { code: '7000000', name: 'TEXAS', level: 'state', rate_pct: stateRatePct })

  let parsedRowCount = 0
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split('\t')
    if (f.length !== 12) continue // blanks / anything not an area row
    // The filing-due-date rows also have 12 fields ("20261 ⇥ q ⇥ 4/20/2026 ⇥ …");
    // an AREA row is one with at least one seven-digit code in a code slot.
    if (![1, 4, 7, 10].some((slot) => CODE_RE.test((f[slot] || '').trim()))) continue
    parsedRowCount++
    for (const slot of [1, 4, 7, 10]) {
      const code = (f[slot] || '').trim()
      if (!CODE_RE.test(code)) continue
      const rateDecimal = Number(f[slot + 1])
      if (!Number.isFinite(rateDecimal)) continue
      const rate_pct = decimalToPct(rateDecimal)
      const name = (f[slot - 1] || '').trim() || code
      const set = seen.get(code) ?? new Set<number>()
      set.add(rate_pct)
      seen.set(code, set)
      if (!rates.has(code)) rates.set(code, { code, name, level: levelForCode(code), rate_pct })
    }
  }

  const conflicts = [...seen.entries()]
    .filter(([, s]) => s.size > 1)
    .map(([code, s]) => ({ code, rates: [...s].sort((a, b) => a - b) }))

  if (stateRatePct !== TX_STATE_RATE_PCT) {
    // Not an error — but the engine validates the state row at exactly 6.25;
    // a statutory change is a strategy conversation, so surface it as a conflict.
    conflicts.push({ code: '7000000', rates: [TX_STATE_RATE_PCT, stateRatePct] })
  }

  return { quarter, stateRatePct, declaredRowCount, parsedRowCount, rates, conflicts }
}
