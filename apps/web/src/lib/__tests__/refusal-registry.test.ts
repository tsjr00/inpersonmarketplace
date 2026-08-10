/**
 * REFUSAL REGISTRY INTEGRITY
 *
 * The registry only works if it tells the truth. Its whole purpose is to let us
 * ask "which rules have NEVER fired" — and every failure mode below turns that
 * answer into a lie:
 *
 *   · a typo'd key at a call site        -> the real rule reads "never fired"
 *   · a renamed key                       -> history silently resets to zero
 *   · a generic error code registered     -> a dozen rules collapse into one
 *   · a registered code that no longer
 *     exists in the codebase              -> reads "never fired" forever
 *
 * These are cheap to check mechanically and impossible to notice by eye.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import {
  REFUSAL_RULES,
  RETIRED_RULES,
  REFUSAL_KEYS,
  REFUSAL_BY_ERROR_CODE,
} from '../telemetry/refusal-registry'

const SRC_DIR = path.resolve(__dirname, '../..')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue
      walk(full, out)
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

const sourceFiles = walk(SRC_DIR)
const allSource = sourceFiles.map((f) => fs.readFileSync(f, 'utf-8')).join('\n')

describe('Refusal registry integrity', () => {
  it('every rule has a key, a description and a location', () => {
    for (const rule of REFUSAL_RULES) {
      expect(rule.key, 'a rule needs a key').toBeTruthy()
      expect(rule.description.length, `${rule.key} needs a real description`).toBeGreaterThan(20)
      expect(rule.where, `${rule.key} must say where it is enforced`).toBeTruthy()
    }
  })

  it('keys are unique', () => {
    const keys = REFUSAL_RULES.map((r) => r.key)
    expect(new Set(keys).size, 'duplicate rule key').toBe(keys.length)
  })

  it('a retired key is never reused by an active rule', () => {
    // Reuse would graft a dead rule's history onto a live one.
    for (const retired of RETIRED_RULES) {
      expect(
        REFUSAL_KEYS.has(retired.key),
        `${retired.key} is retired but also active — pick a new key`
      ).toBe(false)
      expect(retired.why.length, `${retired.key} must say WHY it was retired`).toBeGreaterThan(40)
    }
  })

  it('no two rules claim the same error code', () => {
    const codes = REFUSAL_RULES.filter((r) => r.errorCode).map((r) => r.errorCode)
    expect(new Set(codes).size, 'two rules mapped to one code').toBe(codes.length)
  })

  it('generic error codes are NOT registered', () => {
    // ERR_CHECKOUT_001 appears at a dozen sites and means only "some validation
    // failed". Mapping it would attribute unrelated refusals to one rule and
    // make its count meaningless.
    for (const generic of ['ERR_CHECKOUT_001', 'ERR_CART_001', 'ERR_AUTH_001', 'ERR_AUTH_002']) {
      expect(
        REFUSAL_BY_ERROR_CODE.has(generic),
        `${generic} is a generic code and must not identify a rule`
      ).toBe(false)
    }
  })

  it('rate-limit refusals are not registered', () => {
    // A bot hammering an endpoint would write unbounded rows, and the limiter
    // already counts them. See mig 222.
    for (const rule of REFUSAL_RULES) {
      expect(rule.key, 'rate limiting must not be tracked here').not.toMatch(/rate.?limit/i)
    }
  })

  it('every registered error code still exists in the codebase', () => {
    // A code that was renamed or deleted would read "never fired" forever.
    for (const [code, key] of REFUSAL_BY_ERROR_CODE) {
      expect(
        allSource.includes(`'${code}'`),
        `${key} maps to ${code}, which no longer appears in src/`
      ).toBe(true)
    }
  })

  it('every recordRefusal() call site uses a registered key', () => {
    // The failure this prevents is silent: a typo'd key is dropped at runtime
    // with only a console warning, and the real rule reads "never fired".
    const calls = [...allSource.matchAll(/recordRefusal\(\s*'([^']+)'/g)].map((m) => m[1])
    for (const key of calls) {
      expect(REFUSAL_KEYS.has(key), `recordRefusal('${key}') is not in REFUSAL_RULES`).toBe(true)
    }
  })

  it('the retired multi-market rules stay retired', () => {
    // The specific regression this system was built after. Both of these were
    // removed on 2026-08-09; re-adding either would kill multi-market checkout
    // again. flow-integrity's "Multi-location cart rule" guards the code side —
    // this guards the record of WHY, which is what the last session lacked.
    const retiredKeys = RETIRED_RULES.map((r) => r.key)
    expect(retiredKeys).toContain('cart.same_market_traditional')
    expect(retiredKeys).toContain('cart.mixed_pickup_types')
  })
})
