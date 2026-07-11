/**
 * No-Show Payout Tests (Phase 4)
 *
 * Tests pure functions extracted from cron expire-orders Phase 4.
 * Covers: OL-R19 (no-show payout + FT 1-hour rule)
 *
 * Run: npx vitest run src/lib/cron/__tests__/no-show.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  calculateNoShowPayout,
  shouldTriggerNoShow,
} from '../no-show'

describe('calculateNoShowPayout', () => {
  it('basic: vendor_payout_cents + tip share', () => {
    const result = calculateNoShowPayout({
      vendorPayoutCents: 900,
      tipAmount: 200,
      tipOnPlatformFeeCents: 20,
      totalItemsInOrder: 1,
    })
    // vendorTip = 200 - 20 = 180, tipShare = round(180/1) = 180
    expect(result).toBe(900 + 180)
  })

  it('zero tip → payout = vendor_payout_cents only', () => {
    const result = calculateNoShowPayout({
      vendorPayoutCents: 900,
      tipAmount: 0,
      tipOnPlatformFeeCents: 0,
      totalItemsInOrder: 2,
    })
    expect(result).toBe(900)
  })

  it('1 item order → full vendor tip added', () => {
    const result = calculateNoShowPayout({
      vendorPayoutCents: 500,
      tipAmount: 300,
      tipOnPlatformFeeCents: 30,
      totalItemsInOrder: 1,
    })
    // vendorTip = 270, tipShare = 270/1 = 270
    expect(result).toBe(500 + 270)
  })

  it('3 item order → tip evenly split with rounding', () => {
    const result = calculateNoShowPayout({
      vendorPayoutCents: 500,
      tipAmount: 100,
      tipOnPlatformFeeCents: 10,
      totalItemsInOrder: 3,
    })
    // vendorTip = 90, tipShare = round(90/3) = 30
    expect(result).toBe(500 + 30)
  })

  it('rounding: 100 tip across 3 items', () => {
    const result = calculateNoShowPayout({
      vendorPayoutCents: 500,
      tipAmount: 100,
      tipOnPlatformFeeCents: 0,
      totalItemsInOrder: 3,
    })
    // tipShare = round(100/3) = round(33.33) = 33
    expect(result).toBe(500 + 33)
  })

  it('totalItemsInOrder=0 → treated as 1 (prevents division by zero)', () => {
    const result = calculateNoShowPayout({
      vendorPayoutCents: 500,
      tipAmount: 200,
      tipOnPlatformFeeCents: 0,
      totalItemsInOrder: 0,
    })
    expect(result).toBe(500 + 200)
  })
})

describe('shouldTriggerNoShow', () => {
  // Business rule OL-R19: FT no-show fires 1 hour after the MARKET-LOCAL pickup
  // time; FM fires when pickup_date is before market-local today. All cases use
  // America/Chicago (2026-03-09 is CDT, UTC−5) so the local semantics are
  // actually exercised — not the accidental local==UTC of the pre-fix tests.
  const TZ = 'America/Chicago'

  // ── FM: date-based (market-local midnight rollover) ────────────
  it('FM: pickup yesterday → should trigger', () => {
    const now = new Date('2026-03-09T14:00:00Z') // 09:00 CDT on the 9th
    expect(shouldTriggerNoShow('2026-03-08', null, 'farmers_market', TZ, now)).toBe(true)
  })

  it('FM: pickup today → should NOT trigger', () => {
    const now = new Date('2026-03-09T14:00:00Z')
    expect(shouldTriggerNoShow('2026-03-09', null, 'farmers_market', TZ, now)).toBe(false)
  })

  it('FM: pickup tomorrow → should NOT trigger', () => {
    const now = new Date('2026-03-09T14:00:00Z')
    expect(shouldTriggerNoShow('2026-03-10', null, 'farmers_market', TZ, now)).toBe(false)
  })

  // ── FT: 1 hour after the LOCAL preferred_pickup_time ───────────
  // Pickup 5:00 PM CDT → fire at 6:00 PM CDT.
  it('FT: pickup today 5pm local, now 6:01pm local → should trigger (1hr past)', () => {
    const now = new Date('2026-03-09T23:01:00Z') // 6:01 PM CDT
    expect(shouldTriggerNoShow('2026-03-09', '17:00', 'food_trucks', TZ, now)).toBe(true)
  })

  it('FT: pickup today 5pm local, now 5:30pm local → should NOT trigger', () => {
    const now = new Date('2026-03-09T22:30:00Z') // 5:30 PM CDT
    expect(shouldTriggerNoShow('2026-03-09', '17:00', 'food_trucks', TZ, now)).toBe(false)
  })

  it('FT: pickup today 5pm local, now exactly 6pm local → should trigger (boundary)', () => {
    const now = new Date('2026-03-09T23:00:00Z') // 6:00 PM CDT
    expect(shouldTriggerNoShow('2026-03-09', '17:00', 'food_trucks', TZ, now)).toBe(true)
  })

  it('FT: pickup 5pm local, now 1pm local → should NOT trigger (regression: old UTC code fired early)', () => {
    // 1:00 PM CDT = 18:00 UTC. The pre-fix code stamped "17:00" as UTC, computed
    // fire = 18:00 UTC, and `ref(18:00Z) >= 18:00Z` → true (WRONG: buyer's 5pm
    // pickup hasn't happened). Local-correct answer is NOT to trigger.
    const now = new Date('2026-03-09T18:00:00Z')
    expect(shouldTriggerNoShow('2026-03-09', '17:00', 'food_trucks', TZ, now)).toBe(false)
  })

  it('FT: no preferred_pickup_time → falls back to date-based', () => {
    const now = new Date('2026-03-09T14:00:00Z')
    expect(shouldTriggerNoShow('2026-03-08', null, 'food_trucks', TZ, now)).toBe(true)
  })

  it('FT: no preferred_pickup_time, pickup today → should NOT trigger', () => {
    const now = new Date('2026-03-09T14:00:00Z')
    expect(shouldTriggerNoShow('2026-03-09', null, 'food_trucks', TZ, now)).toBe(false)
  })
})
