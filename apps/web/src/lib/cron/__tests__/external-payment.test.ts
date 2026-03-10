/**
 * External Payment Timing Tests (Phases 3.5 + 3.6)
 *
 * Tests pure functions extracted from cron expire-orders Phases 3.5 and 3.6.
 * Covers: OL-R17 (vendor reminder timing), OL-R18 (auto-confirm digital payments)
 *
 * Run: npx vitest run src/lib/cron/__tests__/external-payment.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  REMINDER_DELAY_MS,
  DEFAULT_REMINDER_DELAY_MS,
  AUTO_CONFIRM_PAYMENT_METHODS,
  isOrderOldEnoughForReminder,
  getAutoConfirmCutoffDate,
  areAllItemsPastPickupWindow,
  formatPaymentMethodLabel,
} from '../external-payment'

describe('External Payment — Phase 3.5 Reminders', () => {
  // ── Constants ──────────────────────────────────────────────────
  it('FT reminder delay is 15 minutes', () => {
    expect(REMINDER_DELAY_MS.food_trucks).toBe(15 * 60 * 1000)
  })

  it('FM reminder delay is 12 hours', () => {
    expect(REMINDER_DELAY_MS.farmers_market).toBe(12 * 60 * 60 * 1000)
  })

  it('default delay is 12 hours', () => {
    expect(DEFAULT_REMINDER_DELAY_MS).toBe(12 * 60 * 60 * 1000)
  })

  // ── isOrderOldEnoughForReminder ────────────────────────────────
  it('FT order 20min old → old enough for reminder', () => {
    const now = Date.now()
    const created = new Date(now - 20 * 60 * 1000).toISOString()
    expect(isOrderOldEnoughForReminder(created, 'food_trucks', now)).toBe(true)
  })

  it('FT order 10min old → NOT old enough', () => {
    const now = Date.now()
    const created = new Date(now - 10 * 60 * 1000).toISOString()
    expect(isOrderOldEnoughForReminder(created, 'food_trucks', now)).toBe(false)
  })

  it('FM order 13hr old → old enough for reminder', () => {
    const now = Date.now()
    const created = new Date(now - 13 * 60 * 60 * 1000).toISOString()
    expect(isOrderOldEnoughForReminder(created, 'farmers_market', now)).toBe(true)
  })

  it('FM order 6hr old → NOT old enough', () => {
    const now = Date.now()
    const created = new Date(now - 6 * 60 * 60 * 1000).toISOString()
    expect(isOrderOldEnoughForReminder(created, 'farmers_market', now)).toBe(false)
  })

  it('FT order exactly 15min old → old enough (boundary)', () => {
    const now = Date.now()
    const created = new Date(now - 15 * 60 * 1000).toISOString()
    expect(isOrderOldEnoughForReminder(created, 'food_trucks', now)).toBe(true)
  })

  it('unknown vertical → falls back to 12hr delay', () => {
    const now = Date.now()
    const created = new Date(now - 13 * 60 * 60 * 1000).toISOString()
    expect(isOrderOldEnoughForReminder(created, 'unknown_vertical', now)).toBe(true)
  })
})

describe('External Payment — Phase 3.6 Auto-Confirm', () => {
  // ── Constants ──────────────────────────────────────────────────
  it('auto-confirm methods are venmo, cashapp, paypal', () => {
    expect(AUTO_CONFIRM_PAYMENT_METHODS).toEqual(['venmo', 'cashapp', 'paypal'])
  })

  it('cash is NOT in auto-confirm list', () => {
    expect((AUTO_CONFIRM_PAYMENT_METHODS as readonly string[]).includes('cash')).toBe(false)
  })

  // ── getAutoConfirmCutoffDate ───────────────────────────────────
  it('cutoff is yesterday in YYYY-MM-DD format', () => {
    const ref = new Date('2026-03-09T15:00:00Z')
    expect(getAutoConfirmCutoffDate(ref)).toBe('2026-03-08')
  })

  it('cutoff handles month boundary', () => {
    const ref = new Date('2026-03-01T12:00:00Z')
    expect(getAutoConfirmCutoffDate(ref)).toBe('2026-02-28')
  })

  // ── areAllItemsPastPickupWindow ────────────────────────────────
  it('all items past window → true', () => {
    const items = [
      { cancelled_at: null, pickup_date: '2026-03-07' },
      { cancelled_at: null, pickup_date: '2026-03-06' },
    ]
    expect(areAllItemsPastPickupWindow(items, '2026-03-08')).toBe(true)
  })

  it('one item not past → false', () => {
    const items = [
      { cancelled_at: null, pickup_date: '2026-03-07' },
      { cancelled_at: null, pickup_date: '2026-03-09' },
    ]
    expect(areAllItemsPastPickupWindow(items, '2026-03-08')).toBe(false)
  })

  it('all cancelled (no active items) → false', () => {
    const items = [
      { cancelled_at: '2026-03-07T00:00:00Z', pickup_date: '2026-03-06' },
    ]
    expect(areAllItemsPastPickupWindow(items, '2026-03-08')).toBe(false)
  })

  it('item with null pickup_date → false', () => {
    const items = [
      { cancelled_at: null, pickup_date: null },
    ]
    expect(areAllItemsPastPickupWindow(items, '2026-03-08')).toBe(false)
  })

  it('cancelled items excluded from check — remaining active item past window', () => {
    const items = [
      { cancelled_at: '2026-03-07T00:00:00Z', pickup_date: '2026-03-10' }, // cancelled, ignored
      { cancelled_at: null, pickup_date: '2026-03-06' },                    // active, past
    ]
    expect(areAllItemsPastPickupWindow(items, '2026-03-08')).toBe(true)
  })
})

describe('formatPaymentMethodLabel', () => {
  it('cashapp → Cash App', () => {
    expect(formatPaymentMethodLabel('cashapp')).toBe('Cash App')
  })

  it('paypal → PayPal', () => {
    expect(formatPaymentMethodLabel('paypal')).toBe('PayPal')
  })

  it('venmo → Venmo', () => {
    expect(formatPaymentMethodLabel('venmo')).toBe('Venmo')
  })

  it('cash → Cash', () => {
    expect(formatPaymentMethodLabel('cash')).toBe('Cash')
  })
})
