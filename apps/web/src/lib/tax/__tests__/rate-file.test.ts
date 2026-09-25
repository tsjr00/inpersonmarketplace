/**
 * Comptroller rate-file parser spec. The fixture is an excerpt of the REAL
 * 2026 Q3 file (taxrates.txt fetched 2026-09-24): the header line, the 16
 * filing-due-date rows, and 15 area rows — kept byte-for-byte (tabs, CRLF,
 * the trailing spaces in names). The rules:
 *  - the file dates ITSELF: header field 2 (YYYYQ) → "YYYY-Qn", the exact
 *    shape the checkout engine's freshness check compares;
 *  - a code has one rate, collected from all four (name, code, rate) slots;
 *  - level comes from the code's first digit, not the slot position;
 *  - rates arrive as decimals and are stored as percent (0.02 → 2);
 *  - due-date rows and "n/a" slots never become jurisdictions;
 *  - a file we cannot date refuses loudly.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { parseRateFile, quarterLabelFromHeader, decimalToPct, RateFileParseError } from '../rate-file'

const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'taxrates-2026Q3-excerpt.txt'), 'utf-8')

describe('header — the file names the quarter it describes', () => {
  it('reads 20263 as 2026-Q3 and the 6.25 % state rate', () => {
    const f = parseRateFile(FIXTURE)
    expect(f.quarter).toBe('2026-Q3')
    expect(f.stateRatePct).toBe(6.25)
    expect(f.declaredRowCount).toBe(3715) // the full file's count; the excerpt is smaller
  })
  it('quarter labels only accept YYYYQ with Q in 1–4', () => {
    expect(quarterLabelFromHeader('20264')).toBe('2026-Q4')
    expect(() => quarterLabelFromHeader('20265')).toThrow(RateFileParseError)
    expect(() => quarterLabelFromHeader('2026-3')).toThrow(RateFileParseError)
  })
  it('refuses an undatable or empty file', () => {
    expect(() => parseRateFile('')).toThrow(RateFileParseError)
    expect(() => parseRateFile('<html>Not Found</html>')).toThrow(RateFileParseError)
    expect(() => parseRateFile('1\tabc\t202609\tx\t0.0625\t0\t10\tmsg')).toThrow(RateFileParseError)
  })
})

describe('area rows → one rate per code, level from the code', () => {
  const f = parseRateFile(FIXTURE)

  it('counts the 15 area rows and skips the 16 due-date rows', () => {
    expect(f.parsedRowCount).toBe(15)
    expect([...f.rates.keys()].some((c) => !/^\d{7}$/.test(c))).toBe(false)
  })
  it('real Panhandle rates: Amarillo 2 %, Canyon 2 %', () => {
    expect(f.rates.get('2188013')).toMatchObject({ level: 'city', rate_pct: 2 })
    expect(f.rates.get('2191018')).toMatchObject({ level: 'city', rate_pct: 2 })
  })
  it('county, transit and special-district codes are typed by first digit, whatever the slot', () => {
    expect(f.rates.get('4109000')).toMatchObject({ level: 'county', rate_pct: 0.5 })   // Hill, slot 2
    expect(f.rates.get('3227999')).toMatchObject({ level: 'transit', rate_pct: 1 })     // Austin MTA, slot 4
    expect(f.rates.get('5046523')).toMatchObject({ level: 'spd', rate_pct: 1 })         // Comal ESD 3, slot 3
  })
  it('an "n/a" city slot (Canyon City) adds nothing for that slot', () => {
    expect([...f.rates.values()].some((j) => j.name.startsWith('Canyon City'))).toBe(false)
  })
  it('the state row comes from the header', () => {
    expect(f.rates.get('7000000')).toEqual({ code: '7000000', name: 'TEXAS', level: 'state', rate_pct: 6.25 })
  })
  it('the real excerpt has no code with two rates', () => {
    expect(f.conflicts).toEqual([])
  })
})

describe('conflicts are surfaced, never silently resolved', () => {
  it('a code listed at two rates is reported with both', () => {
    const bad = FIXTURE.replace('Abilene \t2221012\t0.02\tTaylor', 'Abilene \t2221012\t0.0175\tTaylor')
    const f = parseRateFile(bad)
    expect(f.conflicts).toEqual([{ code: '2221012', rates: [1.75, 2] }])
  })
  it('a state rate other than 6.25 is reported (statutory change = a human decision)', () => {
    const f = parseRateFile(FIXTURE.replace('\t0.0625\t', '\t0.065\t'))
    expect(f.conflicts).toContainEqual({ code: '7000000', rates: [6.25, 6.5] })
  })
})

describe('decimal → percent', () => {
  it('matches the admin card normalisation (no float drift)', () => {
    expect(decimalToPct(0.015)).toBe(1.5)
    expect(decimalToPct(0.0625)).toBe(6.25)
    expect(decimalToPct(0.00125)).toBe(0.125)
  })
})
