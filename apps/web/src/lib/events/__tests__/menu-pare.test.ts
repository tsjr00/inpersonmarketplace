/**
 * Host menu pare-down rules (P1). Spec source: owner decisions 2026-09-03
 * (decisions.md "Host menu pare-down"), NOT the implementation:
 *   #4 minimum kept items = 2; a truck that proposed ≤2 items cannot be pared.
 *   Pared ids must belong to the truck's own proposal.
 */

import { describe, it, expect } from 'vitest'
import { validatePare, MIN_KEPT_ITEMS } from '../menu-pare'

describe('validatePare', () => {
  it('the floor is 2 kept items (owner decision #4)', () => {
    expect(MIN_KEPT_ITEMS).toBe(2)
  })

  it('no paring is always valid', () => {
    expect(validatePare(['a'], []).ok).toBe(true)
    expect(validatePare([], []).ok).toBe(true)
  })

  it('paring down to exactly 2 kept items is allowed', () => {
    expect(validatePare(['a', 'b', 'c', 'd', 'e'], ['c', 'd', 'e']).ok).toBe(true)
  })

  it('paring below 2 kept items is refused', () => {
    const r = validatePare(['a', 'b', 'c'], ['b', 'c'])
    expect(r.ok).toBe(false)
  })

  it('a menu of 2 or fewer proposed items cannot be pared at all', () => {
    expect(validatePare(['a', 'b'], ['a']).ok).toBe(false)
    expect(validatePare(['a'], ['a']).ok).toBe(false)
  })

  it('pared ids must be a subset of the proposal', () => {
    const r = validatePare(['a', 'b', 'c', 'd'], ['zzz'])
    expect(r.ok).toBe(false)
  })

  it('duplicate pared ids do not sneak past the floor', () => {
    // 4 proposed, pared list ['c','c','d'] = 2 distinct → 2 kept → allowed;
    // ['b','c','c','d'] = 3 distinct → 1 kept → refused.
    expect(validatePare(['a', 'b', 'c', 'd'], ['c', 'c', 'd']).ok).toBe(true)
    expect(validatePare(['a', 'b', 'c', 'd'], ['b', 'c', 'c', 'd']).ok).toBe(false)
  })
})
