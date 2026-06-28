/**
 * Phase E — booth-credit ledger balance (Layer 1, pure/deterministic).
 *
 * IMPORTANT: asserts the BUSINESS RULE, not the code. See CLAUDE.md ABSOLUTE
 * RULE 2. Balance = SUM(amount_cents): positive granted, negative redeemed
 * (mig 166). This primitive is the foundation Item 4 (credit redemption) reads.
 */
import { describe, it, expect } from 'vitest'
import { boothCreditBalance } from '@/lib/markets/booth-credit-balance'

describe('boothCreditBalance', () => {
  it('is 0 for a vendor with no credit rows', () => {
    expect(boothCreditBalance([])).toBe(0)
  })

  it('sums granted (positive) rows', () => {
    expect(boothCreditBalance([{ amount_cents: 2337 }, { amount_cents: 4674 }])).toBe(7011)
  })

  it('nets granted against redeemed (negative) rows', () => {
    expect(boothCreditBalance([{ amount_cents: 7011 }, { amount_cents: -3506 }])).toBe(3505)
  })

  it('returns 0 once a grant is fully redeemed', () => {
    expect(boothCreditBalance([{ amount_cents: 2337 }, { amount_cents: -2337 }])).toBe(0)
  })

  it('ignores 0-amount off-platform settlement markers', () => {
    expect(boothCreditBalance([{ amount_cents: 2337 }, { amount_cents: 0 }])).toBe(2337)
  })
})
