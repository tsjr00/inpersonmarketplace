/**
 * Cutoff Hours, Tier Sort Priority & Notification Count — Functional Tests
 *
 * Tests default cutoff hour constants (importing them directly instead of
 * keyword-matching source files), tier browse sort priority, and
 * notification type count (46).
 *
 * Covers gaps: AV-007 through AV-010, VT-012, VT-013, NI-014
 *
 * IMPORTANT: Expected values come from BUSINESS RULES, not from reading code.
 * If a test fails, investigate the code — do NOT change the test.
 * See CLAUDE.md "ABSOLUTE RULE" section.
 *
 * Run: npx vitest run src/lib/__tests__/cutoff-and-sort-functional.test.ts
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_CUTOFF_HOURS } from '@/lib/constants'
import { getTierSortPriority } from '@/lib/vendor-limits'
import { NOTIFICATION_REGISTRY } from '@/lib/notifications/types'

// =============================================================================
// AV-007: Traditional market cutoff = 18 hours
// =============================================================================

describe('AV-007: Traditional market cutoff is 18 hours', () => {
  it('DEFAULT_CUTOFF_HOURS.traditional equals 18', () => {
    expect(DEFAULT_CUTOFF_HOURS.traditional).toBe(18)
  })
})

// =============================================================================
// AV-008: Private pickup cutoff = 10 hours
// =============================================================================

describe('AV-008: Private pickup cutoff is 10 hours', () => {
  it('DEFAULT_CUTOFF_HOURS.private_pickup equals 10', () => {
    expect(DEFAULT_CUTOFF_HOURS.private_pickup).toBe(10)
  })
})

// =============================================================================
// AV-009: Food trucks cutoff = 0 (no advance cutoff)
// =============================================================================

describe('AV-009: Food trucks cutoff is 0', () => {
  it('DEFAULT_CUTOFF_HOURS.food_trucks equals 0', () => {
    expect(DEFAULT_CUTOFF_HOURS.food_trucks).toBe(0)
  })
})

// =============================================================================
// AV-010: Event cutoff = 24 hours
// =============================================================================

describe('AV-010: Event cutoff is 24 hours', () => {
  it('DEFAULT_CUTOFF_HOURS.event equals 24', () => {
    expect(DEFAULT_CUTOFF_HOURS.event).toBe(24)
  })
})

// =============================================================================
// VT-012: FM tier sort priority
// =============================================================================

describe('VT-012: FM tier sort priority (unified: boss first)', () => {
  it('boss = 0 (highest priority)', () => {
    expect(getTierSortPriority('boss', 'farmers_market')).toBe(0)
  })

  it('pro = 1', () => {
    expect(getTierSortPriority('pro', 'farmers_market')).toBe(1)
  })

  it('free = 2', () => {
    expect(getTierSortPriority('free', 'farmers_market')).toBe(2)
  })

  it('undefined tier = 2 (same as free)', () => {
    expect(getTierSortPriority(undefined, 'farmers_market')).toBe(2)
  })

  it('legacy "featured" normalizes to free = 2', () => {
    expect(getTierSortPriority('featured', 'farmers_market')).toBe(2)
  })

  it('legacy "premium" normalizes to free = 2', () => {
    expect(getTierSortPriority('premium', 'farmers_market')).toBe(2)
  })

  it('legacy "standard" normalizes to free = 2', () => {
    expect(getTierSortPriority('standard', 'farmers_market')).toBe(2)
  })

  it('higher tier always has lower number (shown first)', () => {
    const boss = getTierSortPriority('boss', 'farmers_market')
    const pro = getTierSortPriority('pro', 'farmers_market')
    const free = getTierSortPriority('free', 'farmers_market')
    expect(boss).toBeLessThan(pro)
    expect(pro).toBeLessThan(free)
  })
})

// =============================================================================
// VT-013: FT tier sort priority
// =============================================================================

describe('VT-013: FT tier sort priority (unified: boss first)', () => {
  it('boss = 0 (highest priority)', () => {
    expect(getTierSortPriority('boss', 'food_trucks')).toBe(0)
  })

  it('pro = 1', () => {
    expect(getTierSortPriority('pro', 'food_trucks')).toBe(1)
  })

  it('free = 2', () => {
    expect(getTierSortPriority('free', 'food_trucks')).toBe(2)
  })

  it('legacy "basic" normalizes to free = 2', () => {
    expect(getTierSortPriority('basic', 'food_trucks')).toBe(2)
  })

  it('undefined tier = 2 (same as free)', () => {
    expect(getTierSortPriority(undefined, 'food_trucks')).toBe(2)
  })

  it('higher tier always has lower number (shown first)', () => {
    const boss = getTierSortPriority('boss', 'food_trucks')
    const pro = getTierSortPriority('pro', 'food_trucks')
    const free = getTierSortPriority('free', 'food_trucks')
    expect(boss).toBeLessThan(pro)
    expect(pro).toBeLessThan(free)
  })

  it('FM and FT sort priorities are identical', () => {
    expect(getTierSortPriority('boss', 'farmers_market')).toBe(getTierSortPriority('boss', 'food_trucks'))
    expect(getTierSortPriority('pro', 'farmers_market')).toBe(getTierSortPriority('pro', 'food_trucks'))
    expect(getTierSortPriority('free', 'farmers_market')).toBe(getTierSortPriority('free', 'food_trucks'))
  })
})

// =============================================================================
// NI-014: Notification type count = 72
// =============================================================================

describe('NI-014: Total notification types = 72', () => {
  it('NOTIFICATION_REGISTRY has exactly 72 types', () => {
    // Bumped 63 → 64 on 2026-05-16 when vendor_market_approval_granted
    // was added (Phase B B-close-2). Bumped 64 → 67 on 2026-05-19 when
    // booth_rental_paid_vendor + booth_rental_paid_manager +
    // booth_rental_payment_failed_vendor were added (Phase C Stage 3
    // payment lifecycle notifications). Bumped 67 → 68 on 2026-05-19
    // when market_schedule_changed was added (manager-editable schedule).
    // Bumped 68 → 70 on 2026-05-23 when survey_request_vendor +
    // survey_request_buyer were added (Phase E Stage 2 post-market
    // surveys — mig 147 follow-up). Bumped 70 → 71 on 2026-05-25 when
    // market_vendor_invited was added (NEW-8 manager-initiated invitation).
    // Bumped 71 → 72 on 2026-05-27 when manager_vendor_invitation_responded
    // was added (P1-B audit fix — dedicated template for standard market
    // invite responses, replacing the wrong catering_vendor_responded reuse).
    // Bumped 72 → 74 on 2026-06-13 when market_day_today + market_broadcast
    // were added (Session 92 Phase B — market follows + manager broadcast).
    // Bumped 74 → 77 on 2026-06-13 when manager_access_removed/_suspended/
    // _restored were added (Session 92 Phase 1B — manager lockout lifecycle).
    // Bumped 77 → 79 on 2026-06-21 when market_date_cancelled_buyer +
    // market_date_cancelled_vendor were added (Session 92 Phase C — cancel a
    // market day; per-audience because copy + action URL differ).
    // Bumped 79 → 80 on 2026-06-22 when market_date_cancelled_order_vendor was
    // added (Phase C — notify the product-order vendor whose order the closure
    // cancelled, mirroring how buyer-cancel notifies the vendor).
    // Bumped 80 → 82 on 2026-06-25 when booth_season_paid_vendor +
    // booth_season_paid_manager were added (Phase E — season/partial booth
    // prepay; one summary notification per side). User-approved.
    // Inventory tripwire — update when types are intentionally added/removed.
    expect(Object.keys(NOTIFICATION_REGISTRY)).toHaveLength(82)
  })

  it('includes all buyer-facing types', () => {
    const buyerTypes = [
      'order_placed', 'order_confirmed', 'order_ready', 'order_fulfilled',
      'order_cancelled_by_vendor', 'order_refunded', 'order_expired',
      'pickup_missed', 'stale_confirmed_buyer', 'market_box_skip',
      'market_box_pickup_missed', 'issue_resolved',
      'external_payment_not_received', 'order_cancelled_nonpayment',
    ]
    for (const type of buyerTypes) {
      expect(NOTIFICATION_REGISTRY).toHaveProperty(type)
    }
  })

  it('includes all vendor-facing types', () => {
    const vendorTypes = [
      'new_paid_order', 'new_external_order', 'external_payment_reminder',
      'external_payment_auto_confirmed', 'order_cancelled_by_buyer',
      'vendor_approved', 'vendor_rejected', 'market_approved',
      'pickup_confirmation_needed', 'pickup_issue_reported',
      'inventory_low_stock', 'inventory_out_of_stock',
      'payout_processed', 'payout_failed',
      'vendor_cancellation_warning', 'stale_confirmed_vendor',
      'stale_confirmed_vendor_final', 'vendor_quality_alert',
      'order_expired_vendor',
      'event_prep_reminder', 'event_settlement_summary',
      'listing_suspended',
    ]
    for (const type of vendorTypes) {
      expect(NOTIFICATION_REGISTRY).toHaveProperty(type)
    }
  })

  it('includes trial lifecycle types', () => {
    const trialTypes = [
      'vendor_approved_trial', 'trial_reminder_14d', 'trial_reminder_7d',
      'trial_reminder_3d', 'trial_expired', 'trial_grace_expired',
      'subscription_expired',
    ]
    for (const type of trialTypes) {
      expect(NOTIFICATION_REGISTRY).toHaveProperty(type)
    }
  })

  it('includes admin-facing types', () => {
    const adminTypes = [
      'new_vendor_application', 'issue_disputed', 'charge_dispute_created',
    ]
    for (const type of adminTypes) {
      expect(NOTIFICATION_REGISTRY).toHaveProperty(type)
    }
  })

  it('includes catering/event types', () => {
    const eventTypes = [
      'catering_request_received', 'catering_vendor_invited',
      'catering_vendor_responded', 'event_feedback_request',
      'vendor_event_approved', 'vendor_event_application_submitted',
    ]
    for (const type of eventTypes) {
      expect(NOTIFICATION_REGISTRY).toHaveProperty(type)
    }
  })
})
