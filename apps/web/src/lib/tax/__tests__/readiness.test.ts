/**
 * Market tax readiness helpers. `marketStateIsTexas` is the ONE spelling the
 * engine accepts (compute-cart-tax.ts `!== 'TX'` after trim + upper-case); the
 * admin codes card must agree with it (owner 2026-10-09 — it used to accept
 * "TEXAS" and blank, so an admin could verify codes the engine would refuse).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { marketStateIsTexas, marketTaxReadiness } from '../readiness'

describe('marketStateIsTexas — exactly what the engine accepts', () => {
  it.each([['TX', true], ['tx', true], [' Tx ', true], ['TEXAS', false], ['Texas', false], ['', false], ['  ', false], [null, false], [undefined, false], ['OK', false]])(
    '%s → %s', (state, expected) => { expect(marketStateIsTexas(state)).toBe(expected) }
  )

  it('the engine makes the same comparison (pinned so the two can never drift)', () => {
    const engine = fs.readFileSync(path.resolve(__dirname, '../compute-cart-tax.ts'), 'utf-8')
    expect(engine).toContain("if ((market.state || '').trim().toUpperCase() !== 'TX') {")
  })

  it('the admin codes card uses the helper and refuses blank and spelled-out states with a fix-it message', () => {
    const route = fs.readFileSync(path.resolve(__dirname, '../../../app/api/admin/markets/[id]/tax-jurisdictions/route.ts'), 'utf-8')
    expect(route).toContain("import { marketStateIsTexas } from '@/lib/tax/readiness'")
    expect(route).toContain('if (!marketStateIsTexas(marketState)) {')
    expect(route).toContain('Change State to TX on the market form and save, then enter the codes.')
    expect(route).toContain('This market has no state. Set State to TX on the market form and save, then enter the codes.')
    expect(route).not.toContain("marketState !== 'TEXAS'")
  })
})

describe('marketTaxReadiness (unchanged)', () => {
  it('no codes → no_codes', () => {
    expect(marketTaxReadiness({ tax_jurisdictions: [] })).toBe('no_codes')
  })
})
