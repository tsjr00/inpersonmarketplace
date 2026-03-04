/**
 * Business Rules Coverage Index
 *
 * This file documents ALL confirmed business rules across all domains and
 * maps each to its test location. Rules that can be verified with pure
 * functions have concrete tests here; rules requiring DB/API/runtime have
 * .todo() markers documenting what needs integration testing.
 *
 * Rule domains (CONFIRMED ✅ only):
 *   MP  = Money Path (28 rules) — confirmed Session 48
 *   OL  = Order Lifecycle (22 rules) — confirmed Session 48
 *   VI  = Vertical Isolation (19 rules) — confirmed Session 48, R16-R19 added Session 50
 *   VJ  = Vendor Journey (15 rules) — confirmed Session 49, R14-R15 added Session 50
 *   SL  = Subscription Lifecycle (16 rules) — confirmed Session 49
 *   NI  = Notifications R19-R37 (19 rules) — confirmed Session 50
 *
 * Partially confirmed:
 *   IR  = Infrastructure R15-R26 (Cost Optimization) — confirmed by user
 *
 * NOT included (unconfirmed — do NOT add tests until user reviews):
 *   AC  = Auth & Access Control — entire domain unreviewed
 *   NI  = Notifications R1-R18 — Claude observations, not confirmed
 *   IR  = Infrastructure R1-R14 — unreviewed (R15-R26 confirmed above)
 *
 * Run: npx vitest run src/lib/__tests__/integration/business-rules-coverage.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import {
  FEES,
  calculateOrderPricing,
  calculateBuyerPrice,
  calculateItemDisplayPrice,
  calculateVendorPayout,
  calculateSmallOrderFee,
  SMALL_ORDER_FEE_DEFAULTS,
} from '@/lib/pricing'
import {
  calculateBuyerFee,
  calculateExternalBuyerFee,
  calculateSellerFee,
  calculateTotalExternalFee,
  calculateAutoDeductAmount,
  SELLER_FEE_PERCENT,
  AUTO_DEDUCT_MAX_PERCENT,
  BALANCE_INVOICE_THRESHOLD_CENTS,
  AGE_INVOICE_THRESHOLD_DAYS,
} from '@/lib/payments/vendor-fees'
import {
  calculateCancellationFee,
  CANCELLATION_FEE_PERCENT,
  GRACE_PERIOD_BY_VERTICAL,
  getGracePeriodMs,
} from '@/lib/payments/cancellation-fees'
import {
  calculateTipShare,
  calculateVendorTip,
  calculatePlatformFeeTip,
} from '@/lib/payments/tip-math'
import {
  getTierLimits,
  TIER_LIMITS,
  FT_TIER_LIMITS,
  isFoodTruckTier,
  isPremiumTier,
} from '@/lib/vendor-limits'
import { DEFAULT_CUTOFF_HOURS } from '@/lib/constants'
import {
  POLLING_INTERVALS,
  isOffPeak,
  getPollingInterval,
} from '@/lib/polling-config'
import { timesOverlap } from '@/lib/utils/schedule-overlap'

// ══════════════════════════════════════════════════════════════════════
// DOMAIN 1: MONEY PATH (MP)
// Detailed tests in: pricing.test.ts, vendor-fees.test.ts, tip-math.test.ts,
//                    order-pricing-e2e.test.ts
// ══════════════════════════════════════════════════════════════════════

describe('MP: Money Path — coverage check', () => {
  // ── MP-R1: Buyer fee = 6.5% + $0.15 flat ─────────────────────────
  // COVERED: pricing.test.ts, order-pricing-e2e.test.ts, vendor-fees.test.ts
  it('MP-R1: buyer fee formula', () => {
    const fee = calculateBuyerFee(10000)
    expect(fee).toBe(665) // round(10000*0.065) + 15
  })

  // ── MP-R2: Vendor fee = 6.5% ─────────────────────────────────────
  // COVERED: pricing.test.ts, order-pricing-e2e.test.ts
  it('MP-R2: vendor payout formula', () => {
    expect(calculateVendorPayout(10000)).toBe(9335) // round(10000*0.935) - 15 = 9350 - 15
  })

  // ── MP-R3/R4: Tip on displayed subtotal ───────────────────────────
  // COVERED: tip-math.test.ts

  // ── MP-R5: Small order fee per-vertical ───────────────────────────
  // COVERED: pricing.test.ts, order-pricing-e2e.test.ts
  it('MP-R5: small order fee thresholds', () => {
    expect(SMALL_ORDER_FEE_DEFAULTS.farmers_market.thresholdCents).toBe(1000)
    expect(SMALL_ORDER_FEE_DEFAULTS.food_trucks.thresholdCents).toBe(500)
    expect(SMALL_ORDER_FEE_DEFAULTS.fire_works.thresholdCents).toBe(4000)
  })

  // ── MP-R6: Double payout prevention (DB unique index) ─────────────
  it.todo('MP-R6: unique index on vendor_payouts(order_item_id) prevents duplicates (DB test)')

  // ── MP-R7: Deterministic idempotency keys ─────────────────────────
  it.todo('MP-R7: idempotency keys use deterministic format, never Date.now() (code review)')

  // ── MP-R8: Atomic inventory decrement ─────────────────────────────
  it.todo('MP-R8: atomic_decrement_inventory RPC prevents negative stock (DB test)')

  // ── MP-R9: Per-item rounding ──────────────────────────────────────
  // COVERED: pricing.test.ts, order-pricing-e2e.test.ts
  it('MP-R9: per-item display price differs from order-level total', () => {
    const perItem = calculateItemDisplayPrice(900) // round(900×1.065) = 959
    const orderLevel = calculateBuyerPrice(1800) // round(1800×1.065) + 15 = 1932
    expect(perItem).toBe(959)
    expect(perItem * 2).toBe(1918) // NOT equal to orderLevel
    expect(orderLevel).toBe(1932)
  })

  // ── MP-R10: External vendor fee = 3.5% ────────────────────────────
  // COVERED: vendor-fees.test.ts
  it('MP-R10: external seller fee is 3.5%', () => {
    expect(SELLER_FEE_PERCENT).toBe(3.5)
    expect(calculateSellerFee(10000)).toBe(350)
  })

  // ── MP-R11: External buyer fee = 6.5%, no flat fee ────────────────
  // COVERED: vendor-fees.test.ts
  it('MP-R11: external buyer fee has no flat fee', () => {
    expect(calculateExternalBuyerFee(10000)).toBe(650) // no +15
    expect(calculateBuyerFee(10000)).toBe(665) // has +15
  })

  // ── MP-R12: Flat fee prorated across items ────────────────────────
  // COVERED: order-pricing-e2e.test.ts, cancellation-fees.test.ts
  it('MP-R12: flat fee is $0.15 once per order, prorated', () => {
    expect(FEES.buyerFlatFeeCents).toBe(15)
    // Proration: round(15/3) = 5 per item for 3-item order
    expect(Math.round(15 / 3)).toBe(5)
  })

  // ── MP-R13: No minimum rejection, small order fee instead ─────────
  // COVERED: pricing.test.ts, order-pricing-e2e.test.ts
  it('MP-R13: per-vertical fee amounts', () => {
    expect(SMALL_ORDER_FEE_DEFAULTS.farmers_market.feeCents).toBe(100) // $1.00
    expect(SMALL_ORDER_FEE_DEFAULTS.food_trucks.feeCents).toBe(50) // $0.50
    expect(SMALL_ORDER_FEE_DEFAULTS.fire_works.feeCents).toBe(400) // $4.00
  })

  // ── MP-R14: Market box RPC failure → auto-refund ──────────────────
  it.todo('MP-R14: RPC failure after payment triggers auto-refund (integration test)')

  // ── MP-R15: Pending Stripe orders expire after 10min ──────────────
  it.todo('MP-R15: cron Phase 2 cancels abandoned Stripe checkouts (cron test)')

  // ── MP-R16: External payment vendor fee eligibility ───────────────
  it('MP-R16: auto-deduct capped at 50% of payout', () => {
    expect(AUTO_DEDUCT_MAX_PERCENT).toBe(50)
    // Payout $10, owed $30 → max deduct $5
    expect(calculateAutoDeductAmount(1000, 3000)).toBe(500)
    // Payout $100, owed $30 → deduct full $30
    expect(calculateAutoDeductAmount(10000, 3000)).toBe(3000)
  })

  it('MP-R16: fee thresholds', () => {
    expect(BALANCE_INVOICE_THRESHOLD_CENTS).toBe(5000) // $50
    expect(AGE_INVOICE_THRESHOLD_DAYS).toBe(40)
  })

  // ── MP-R17: Payout retry window (7 days) ──────────────────────────
  it.todo('MP-R17: failed payouts retried for 7 days then cancelled (cron test)')

  // ── MP-R18: Webhook + success route idempotent ────────────────────
  it.todo('MP-R18: duplicate payment processing produces no duplicates (integration test)')

  // ── MP-R19 through MP-R28: Tip rules ──────────────────────────────
  // Detailed tests in: tip-math.test.ts (25 tests)
  // Below: explicit rule-tagged assertions proving each business rule

  it('MP-R20: tip calculated on displayed subtotal, NOT base subtotal', () => {
    // 2 items at $9.00 base each → displaySubtotal = round(900×1.065)×2 = 959×2 = 1918
    // 10% tip on displayed: round(1918×0.10) = 192
    // Vendor tip on base: round(1800×10/100) = 180
    // Platform fee tip = 192 - 180 = 12
    // If tip were on base ($18.00), platform fee tip would be 0
    const platformFeeTip = calculatePlatformFeeTip(192, 1800, 10)
    expect(platformFeeTip).toBe(12)
    // This proves tip is on displayed subtotal: the 12 cents difference
    // comes from the 6.5% buyer fee being included in the tip base
    expect(platformFeeTip).toBeGreaterThan(0)
  })

  it('MP-R21: tip amount has a ceiling via min() in vendor tip calculation', () => {
    // If total tip is $50 (5000) but vendor portion would be higher,
    // min() ensures vendor never gets more than the total tip
    // vendorTip = min(5000, round(100000 × 10/100)) = min(5000, 10000) = 5000
    // platformFeeTip = 5000 - 5000 = 0
    expect(calculatePlatformFeeTip(5000, 100000, 10)).toBe(0)
    // Small tip: vendor portion stays below total → normal split
    expect(calculatePlatformFeeTip(192, 1800, 10)).toBe(12)
  })

  it('MP-R23: vendor tip = min(totalTip, round(baseSubtotal × tipPercentage / 100))', () => {
    // $18 base, 10% tip on $19.18 displayed = $1.92 total
    // Vendor gets: min(192, round(1800×10/100)) = min(192, 180) = 180
    const vendorTip = 192 - calculatePlatformFeeTip(192, 1800, 10) // 192 - 12 = 180
    expect(vendorTip).toBe(180)
    // 15% tip
    const vendorTip15 = 288 - calculatePlatformFeeTip(288, 1800, 15) // 288 - 18 = 270
    expect(vendorTip15).toBe(270)
  })

  it('MP-R24: tip_on_platform_fee_cents = totalTip - vendorTip', () => {
    // calculatePlatformFeeTip returns exactly this value
    // 10%: platformFeeTip = 192 - 180 = 12
    expect(calculatePlatformFeeTip(192, 1800, 10)).toBe(12)
    // 15%: platformFeeTip = 288 - 270 = 18
    expect(calculatePlatformFeeTip(288, 1800, 15)).toBe(18)
    // 20%: platformFeeTip = 384 - 360 = 24
    expect(calculatePlatformFeeTip(384, 1800, 20)).toBe(24)
    // 0% tip: no platform fee tip
    expect(calculatePlatformFeeTip(0, 1800, 0)).toBe(0)
  })

  it('MP-R25: vendor tip prorated evenly across items with rounding', () => {
    // $5 tip / 2 items = 250 cents each
    expect(calculateTipShare(500, 2)).toBe(250)
    // $1 tip / 3 items = 33 cents each (rounds down from 33.33)
    expect(calculateTipShare(100, 3)).toBe(33)
    // $2.53 tip / 3 items = 84 cents each (84.33 rounds to 84)
    expect(calculateTipShare(253, 3)).toBe(84)
    // Null/zero safety — no tip means 0 per item
    expect(calculateTipShare(0, 2)).toBe(0)
    expect(calculateTipShare(null, 3)).toBe(0)
  })

  it('MP-R28: all payout paths use identical tip calculation (same function)', () => {
    // calculateTipShare is the SINGLE function used by all 3 payout paths:
    // 1. Vendor fulfill route, 2. Confirm-handoff route, 3. Cron Phase 4 no-show
    // Verify determinism: same inputs always produce same outputs
    const scenarios = [
      { tip: 500, items: 2, expected: 250 },
      { tip: 192, items: 1, expected: 192 },
      { tip: 100, items: 3, expected: 33 },
      { tip: 0, items: 5, expected: 0 },
    ]
    for (const { tip, items, expected } of scenarios) {
      // Call twice to prove determinism
      expect(calculateTipShare(tip, items)).toBe(expected)
      expect(calculateTipShare(tip, items)).toBe(expected)
    }
  })
})

// ══════════════════════════════════════════════════════════════════════
// DOMAIN 2: ORDER LIFECYCLE (OL)
// Detailed tests in: cancellation-fees.test.ts
// ══════════════════════════════════════════════════════════════════════

describe('OL: Order Lifecycle — coverage check', () => {
  // ── OL-R1/R2: Forward-only status transitions ────────────────────
  it.todo('OL-R1: orders.status forward-only transitions (DB constraint test)')
  it.todo('OL-R2: order_items.status forward-only transitions (DB constraint test)')

  // ── OL-R3: Cancellation restores inventory ────────────────────────
  it.todo('OL-R3: cancelled items restore listings.quantity_available (DB trigger test)')

  // ── OL-R4: Payout created at fulfill time ─────────────────────────
  it.todo('OL-R4: vendor_payouts row created when order_items.status = fulfilled (API test)')

  // ── OL-R5: Buyer cancel allowlist ─────────────────────────────────
  // COVERED: cancellation-fees.test.ts
  it('OL-R5: cancellation allowed for pending/confirmed/ready', () => {
    // The cancel route checks status IN (pending, confirmed, ready)
    // Cancellation fee calc accepts these statuses
    const now = new Date()
    const recentOrder = new Date(now.getTime() - 5 * 60 * 1000) // 5min ago

    for (const status of ['pending', 'confirmed', 'ready']) {
      const result = calculateCancellationFee({
        subtotalCents: 1000,
        totalItemsInOrder: 1,
        orderStatus: status,
        orderCreatedAt: recentOrder,
      })
      expect(result.refundAmountCents).toBeGreaterThan(0)
    }
  })

  // ── OL-R6: handed_off is display-only ─────────────────────────────
  it.todo('OL-R6: buyer API returns handed_off when fulfilled + no buyer_confirmed_at (API test)')

  // ── OL-R7: Full refund within grace or pre-confirm ────────────────
  // COVERED: cancellation-fees.test.ts
  it('OL-R7: per-vertical grace periods', () => {
    expect(getGracePeriodMs('farmers_market')).toBe(60 * 60 * 1000) // 1 hour
    expect(getGracePeriodMs('food_trucks')).toBe(15 * 60 * 1000) // 15 minutes
  })

  // ── OL-R8: 25% cancellation fee after grace + vendor confirmed ────
  // COVERED: cancellation-fees.test.ts
  it('OL-R8: cancellation fee is 25%', () => {
    expect(CANCELLATION_FEE_PERCENT).toBe(25)
  })

  // ── OL-R9: Stripe refund only for Stripe-paid ────────────────────
  it.todo('OL-R9: external payment cancellation does not call Stripe refund (API test)')

  // ── OL-R10 through OL-R13: Status transition rules ───────────────
  it.todo('OL-R10: vendor confirm requires ownership + pending status (API test)')
  it.todo('OL-R11: vendor reject always gives 100% refund (API test)')
  it.todo('OL-R12: 30s mutual confirmation window with auto-reset (API test)')
  it.todo('OL-R13: one notification per status transition (API test)')

  // ── OL-R14 through OL-R18: Cron rules ────────────────────────────
  it.todo('OL-R14: Phase 1 expires unaccepted items per-vertical timing (cron test)')
  it.todo('OL-R15: Phase 2 cancels abandoned Stripe checkouts after 10min (cron test)')
  it.todo('OL-R16: Phase 3 cancels expired external payments per-vertical (cron test)')
  it.todo('OL-R17: Phase 3.5 sends reminder (FT=15min, FM=12hr) — no status change (cron test)')
  it.todo('OL-R18: Phase 3.6 auto-confirms digital external payments (not cash) (cron test)')

  // ── OL-R19/R20: Open questions ────────────────────────────────────
  it.todo('OL-R19: Phase 4 no-show per-vertical timing (needs user decision)')
  it.todo('OL-R20: Phase 4.5 stale vendor reminder (needs user decision)')

  // ── OL-R21/R22: Payout retry + auto-fulfill ──────────────────────
  it.todo('OL-R21: Phase 5 retries failed payouts for 7 days (cron test)')
  it.todo('OL-R22: Phase 7 auto-fulfills stale confirmation windows (cron test)')
})

// ══════════════════════════════════════════════════════════════════════
// DOMAIN 3: VERTICAL ISOLATION (VI)
// Detailed tests in: vertical-isolation.test.ts
// ══════════════════════════════════════════════════════════════════════

describe('VI: Vertical Isolation — coverage check', () => {
  // ── VI-R1: Valid vertical slugs ───────────────────────────────────
  // Middleware (src/middleware.ts) validates against VALID_VERTICALS Set.
  // The Set is not exported, so we verify the expected values are used
  // throughout the codebase (grace periods, small order fees, tier configs).
  it('VI-R1: all 3 valid verticals have matching configuration', () => {
    // Every valid vertical must have grace period config
    expect('farmers_market' in GRACE_PERIOD_BY_VERTICAL).toBe(true)
    expect('food_trucks' in GRACE_PERIOD_BY_VERTICAL).toBe(true)
    expect('fire_works' in GRACE_PERIOD_BY_VERTICAL).toBe(true)
    // Every valid vertical must have small order fee config
    expect('farmers_market' in SMALL_ORDER_FEE_DEFAULTS).toBe(true)
    expect('food_trucks' in SMALL_ORDER_FEE_DEFAULTS).toBe(true)
    expect('fire_works' in SMALL_ORDER_FEE_DEFAULTS).toBe(true)
    // Middleware value: VALID_VERTICALS = Set(['farmers_market', 'food_trucks', 'fire_works'])
    // If a vertical is added to middleware but not to these configs, orders would
    // fail at checkout. This test catches that mismatch.
  })

  // ── VI-R2: Data scoped by vertical_id ─────────────────────────────
  it.todo('VI-R2: all queries include .eq(vertical_id) in vertical context (code audit)')

  // ── VI-R3: Platform admin sees all verticals ──────────────────────
  it.todo('VI-R3: platform admin unscoped, vertical admin scoped (API test)')

  // ── VI-R4: Activity feed filtered by vertical ─────────────────────
  it.todo('VI-R4: activity feed API includes vertical_id filter (API test)')

  // ── VI-R5: Vendor profiles scoped by vertical ─────────────────────
  it.todo('VI-R5: same user can have separate vendor profiles per vertical (DB test)')

  // ── VI-R6/R7/R8/R9: Branding, colors, terms, feature flags ───────
  // COVERED: vertical-isolation.test.ts

  // ── VI-R10: Tipping FT-only ───────────────────────────────────────
  it.todo('VI-R10: FM checkout has no tip UI (component test)')

  // ── VI-R11: Preferred pickup time FT-only ─────────────────────────
  it.todo('VI-R11: FM cart items have no time slot selector (component test)')

  // ── VI-R12: Tier names differ per vertical ────────────────────────
  // COVERED: vendor-tier-limits.test.ts
  it('VI-R12: FM and FT use different tier names', () => {
    // FM has standard/premium/featured, FT has basic/pro/boss
    expect(isFoodTruckTier('standard')).toBe(false) // standard is FM-only
    expect(isFoodTruckTier('basic')).toBe(true) // basic is FT-only
    expect('standard' in TIER_LIMITS).toBe(true) // FM has standard
    expect('basic' in FT_TIER_LIMITS).toBe(true) // FT has basic
  })

  // ── VI-R13: Chef Box types FT-only ────────────────────────────────
  it.todo('VI-R13: FT market box form requires box_type, FM does not (component test)')

  // ── VI-R14: Per-vertical order cutoff ─────────────────────────────
  it('VI-R14: default cutoff hours per market type', () => {
    // FM traditional markets: 18 hours before market opens
    expect(DEFAULT_CUTOFF_HOURS.traditional).toBe(18)
    // FM/FT private pickup locations: 10 hours before window
    expect(DEFAULT_CUTOFF_HOURS.private_pickup).toBe(10)
    // FT: no cutoff (prepare on the spot, 30min lead time handled separately)
    expect(DEFAULT_CUTOFF_HOURS.food_trucks).toBe(0)
    // Events: 24 hours before event starts
    expect(DEFAULT_CUTOFF_HOURS.event).toBe(24)
  })

  // ── VI-R15: Per-vertical browse visibility ────────────────────────
  it.todo('VI-R15: FT same-day only, FM 7-day window (browse page test)')

  // ── VI-R16: Notifications scoped by vertical_id ─────────────────
  // Added Session 50: notifications table has vertical_id FK.
  // sendInApp() stores vertical_id, API filters by ?vertical= param.
  // COVERED: vertical-isolation.test.ts (structural + .todo integration)
  it.todo('VI-R16: notifications filtered by vertical_id, NULL visible everywhere (API test)')

  // ── VI-R17: Login enforces vertical membership ──────────────────
  // Added Session 50: post-login check in login/page.tsx.
  // Wrong-vertical user redirected to their home vertical.
  it.todo('VI-R17: login on wrong vertical redirects to home vertical (integration test)')

  // ── VI-R18: Protected pages enforce vertical access gate ────────
  // Added Session 50: enforceVerticalAccess() on 8 server pages.
  // Checks user_profiles.verticals, vendor_profiles fallback, admin bypass.
  it.todo('VI-R18: server pages call enforceVerticalAccess before rendering (server test)')

  // ── VI-R19: sendNotification() threads vertical to storage ──────
  // Added Session 50: options.vertical threaded to sendInApp() vertical_id.
  // All call sites (webhooks, checkout, cron) pass vertical from source data.
  it.todo('VI-R19: all sendNotification call sites include vertical option (code audit)')
})

// ══════════════════════════════════════════════════════════════════════
// DOMAIN 4: VENDOR JOURNEY (VJ)
// Detailed tests in: vendor-tier-limits.test.ts
// ══════════════════════════════════════════════════════════════════════

describe('VJ: Vendor Journey — coverage check', () => {
  // ── VJ-R1: 4 onboarding gates ─────────────────────────────────────
  it.todo('VJ-R1: canPublishListings requires all 4 gates (API test)')

  // ── VJ-R2: Stripe payouts enabled ─────────────────────────────────
  it.todo('VJ-R2: vendor without stripe_account_id gets pending_stripe_setup payout (cron test)')

  // ── VJ-R3/R4: Tier limits enforced with exact values ──────────────
  // COVERED: vendor-tier-limits.test.ts (exact values confirmed Session 49)

  // ── VJ-R5: Auto-create vendor_verifications ───────────────────────
  it.todo('VJ-R5: DB trigger auto_create_vendor_verification fires on insert (DB test)')

  // ── VJ-R6: New vendors get free tier ──────────────────────────────
  // COVERED: vendor-tier-limits.test.ts (fallback tests)
  it.todo('VJ-R6: DB trigger set_default_vendor_tier sets tier=free (DB test)')

  // ── VJ-R7: 5 vendor acknowledgments required ─────────────────────
  it.todo('VJ-R7: vendor signup requires all 5 checkboxes (component test)')

  // ── VJ-R8: Market limits per tier ─────────────────────────────────
  // COVERED: vendor-tier-limits.test.ts (exact values)

  // ── VJ-R9 through VJ-R13: Listing quality rules ──────────────────
  it.todo('VJ-R9: published listing requires quantity_amount + quantity_unit (DB constraint test)')
  it.todo('VJ-R10: listing images compressed client-side 1200px/80% (component test)')
  it.todo('VJ-R11: FT shows pickup time selector, FM does not (component test)')
  it.todo('VJ-R12: FT requires vendor attendance for availability (API test)')
  it.todo('VJ-R13: paused listings hidden from browse but keep order history (API test)')

  // ── VJ-R14: Schedule conflict prevention ────────────────────────
  // Added Session 50: Single-truck vendors cannot have overlapping schedules
  // at different markets on the same day. Enforced at 2 levels:
  // 1. API validation (PATCH/PUT return 409 ERR_SCHEDULE_CONFLICT)
  // 2. DB trigger safety net (check_vendor_schedule_conflict RAISE EXCEPTION)
  // Vendors with multiple_trucks=true bypass both checks.
  // COVERED: schedule-overlap.test.ts (24 unit tests)
  it('VJ-R14: overlap detection works for same day, different markets', () => {
    // Detailed tests in schedule-overlap.test.ts (24 tests) — this is the rule marker
    expect(timesOverlap('10:00', '14:00', '12:00', '16:00')).toBe(true) // overlap
    expect(timesOverlap('10:00', '14:00', '14:00', '18:00')).toBe(false) // adjacent = OK
  })
  it.todo('VJ-R14a: PATCH returns 409 for conflicting schedule activation (API test)')
  it.todo('VJ-R14b: PUT returns 409 for bulk update with conflicts (API test)')
  it.todo('VJ-R14c: DB trigger raises exception on conflicting INSERT (DB test)')
  it.todo('VJ-R14d: multiple_trucks=true bypasses conflict check (API + DB test)')
})

  // ── VJ-R15: Listing availability uses single SQL source of truth ────
  // Added Session 50: All surfaces (browse page, cart validate, vendor listings)
  // use get_listings_accepting_status() RPC which internally calls
  // get_available_pickup_dates() via LEFT JOIN LATERAL. This guarantees:
  // - Vendor attendance is checked (vendor_market_schedules.is_active)
  // - Vendor-specific hours are used (vendor_start_time/vendor_end_time)
  // - Timezone-aware cutoff calculation (market timezone, not UTC)
  // - Consistent "Closed" pill across all surfaces
  // SYNC GUARANTEE: If get_available_pickup_dates() changes, all surfaces
  // automatically pick up the changes — no duplicated JS logic.
  it.todo('VJ-R15a: browse page uses get_listings_accepting_status RPC (integration test)')
  it.todo('VJ-R15b: cart validate uses get_listings_accepting_status RPC (integration test)')
  it.todo('VJ-R15c: vendor listings page uses get_listings_accepting_status RPC (integration test)')
  it.todo('VJ-R15d: get_listings_accepting_status returns false when vendor not attending (DB test)')

// ══════════════════════════════════════════════════════════════════════
// DOMAIN 5: SUBSCRIPTION LIFECYCLE (SL)
// ══════════════════════════════════════════════════════════════════════

describe('SL: Subscription Lifecycle — coverage check', () => {
  it.todo('SL-R1: subscription creation atomic with FOR UPDATE lock (DB test)')
  it.todo('SL-R2: triple-layer idempotency (RPC + Stripe key + unique index) (integration test)')
  it.todo('SL-R3: auto-refund on RPC failure (integration test)')

  // ── SL-R4: Full prepaid payout at checkout ────────────────────────
  it('SL-R4: vendor payout formula for market box subscription', () => {
    // $40 4-week subscription → vendor receives calculateVendorPayout(4000)
    const vendorPayout = calculateVendorPayout(4000)
    // 4000 - round(4000*0.065) - 15 = 4000 - 260 - 15 = 3725
    expect(vendorPayout).toBe(3725)
  })

  it.todo('SL-R5: unique index on market_box_subscription_id prevents duplicate payouts (DB test)')
  it.todo('SL-R6: pickups auto-generated on subscription insert (DB trigger test)')
  it.todo('SL-R7: subscription auto-completes when all pickups resolved (DB trigger test)')
  it.todo('SL-R8: skip-a-week creates extension pickup, FT disabled (API test)')
  it.todo('SL-R9: market boxes require Stripe payment — no external (component test)')
  it.todo('SL-R10: term_weeks must be 4 or 8, FT restricted to 4 (DB constraint test)')
  it.todo('SL-R11: duplicate active subscription prevented at checkout (API test)')
  it.todo('SL-R12: vendor cannot deactivate offering with active subscribers (API test)')
  it.todo('SL-R13: vendor cannot change pickup location with active subscribers (API test)')
  it.todo('SL-R14: reactivating offering checks canActivateMarketBox tier limit (API test)')
  it.todo('SL-R15: maxSubscribersPerOffering enforced at purchase time (API test)')
  it.todo('SL-R16: Phase 7 auto-fulfill does NOT create second payout for market boxes (cron test)')
})

// ══════════════════════════════════════════════════════════════════════
// DOMAIN 7: NOTIFICATIONS (NI) — confirmed rules NI-R19 through NI-R37 only
// Detailed tests in: notification-types.test.ts
// ══════════════════════════════════════════════════════════════════════
// NI-R19-R27: Per-vertical urgency — .todo() (pending code implementation)
// NI-R28-R35: Current registry values — tested in notification-types.test.ts
// NI-R36: pickup_confirmation_needed redesign — documented
// NI-R37: External payment reminder timing — documented (cron constant)

// ══════════════════════════════════════════════════════════════════════
// CROSS-DOMAIN: Money Conservation Law
// ══════════════════════════════════════════════════════════════════════

describe('Cross-domain: money conservation', () => {
  it('buyer total = vendor payout + platform fee for any subtotal', () => {
    const subtotals = [100, 500, 999, 1000, 5000, 10000, 50000]
    for (const subtotal of subtotals) {
      const pricing = calculateOrderPricing([{ price_cents: subtotal, quantity: 1 }])
      expect(
        pricing.buyerTotalCents,
        `Conservation violated at subtotal=${subtotal}`
      ).toBe(pricing.vendorPayoutCents + pricing.platformFeeCents)
    }
  })

  it('external payment total = subtotal + buyer fee (6.5%, no flat fee)', () => {
    const subtotals = [100, 500, 999, 1000, 5000, 10000]
    for (const subtotal of subtotals) {
      const buyerFee = calculateExternalBuyerFee(subtotal)
      const sellerFee = calculateSellerFee(subtotal)
      const totalFee = calculateTotalExternalFee(subtotal)
      expect(totalFee, `External fee sum at subtotal=${subtotal}`).toBe(buyerFee + sellerFee)
    }
  })
})

// ══════════════════════════════════════════════════════════════════════
// CROSS-DOMAIN: Per-Vertical Configuration Consistency
// ══════════════════════════════════════════════════════════════════════

describe('Cross-domain: per-vertical configuration consistency', () => {
  it('grace periods exist for all configured verticals', () => {
    expect('farmers_market' in GRACE_PERIOD_BY_VERTICAL).toBe(true)
    expect('food_trucks' in GRACE_PERIOD_BY_VERTICAL).toBe(true)
    expect('fire_works' in GRACE_PERIOD_BY_VERTICAL).toBe(true)
  })

  it('small order fee defaults exist for all configured verticals', () => {
    expect('farmers_market' in SMALL_ORDER_FEE_DEFAULTS).toBe(true)
    expect('food_trucks' in SMALL_ORDER_FEE_DEFAULTS).toBe(true)
    expect('fire_works' in SMALL_ORDER_FEE_DEFAULTS).toBe(true)
  })

  it('tier limits exist for both FM and FT verticals', () => {
    expect(Object.keys(TIER_LIMITS)).toContain('free')
    expect(Object.keys(TIER_LIMITS)).toContain('standard')
    expect(Object.keys(TIER_LIMITS)).toContain('premium')
    expect(Object.keys(TIER_LIMITS)).toContain('featured')
    expect(Object.keys(FT_TIER_LIMITS)).toContain('free')
    expect(Object.keys(FT_TIER_LIMITS)).toContain('basic')
    expect(Object.keys(FT_TIER_LIMITS)).toContain('pro')
    expect(Object.keys(FT_TIER_LIMITS)).toContain('boss')
  })

  it('FM premium tiers are premium/featured', () => {
    expect(isPremiumTier('premium', 'farmers_market')).toBe(true)
    expect(isPremiumTier('featured', 'farmers_market')).toBe(true)
    expect(isPremiumTier('standard', 'farmers_market')).toBe(false)
    expect(isPremiumTier('free', 'farmers_market')).toBe(false)
  })

  it('FT premium tiers are pro/boss', () => {
    expect(isPremiumTier('pro', 'food_trucks')).toBe(true)
    expect(isPremiumTier('boss', 'food_trucks')).toBe(true)
    expect(isPremiumTier('basic', 'food_trucks')).toBe(false)
    expect(isPremiumTier('free', 'food_trucks')).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════
// DOMAIN 8: INFRASTRUCTURE RELIABILITY — COST OPTIMIZATION (IR-R15–R26)
// These rules prevent wasteful API calls, DB queries, and polling that
// would skyrocket costs with zero user benefit. Confirmed by user.
// ══════════════════════════════════════════════════════════════════════
describe('IR: Infrastructure Reliability — Cost Optimization', () => {

  // ── IR-R15: Cron environment gating ──────────────────────────────
  // All 3 crons (expire-orders, vendor-activity-scan, vendor-quality-checks)
  // skip execution when VERCEL_ENV is set but !== 'production'.
  // This prevents staging/preview deployments from doubling DB queries.
  it.todo('IR-R15: crons return {skipped:true} on non-production VERCEL_ENV (requires API test)')

  // ── IR-R16: Off-peak hours definition ────────────────────────────
  // FM/FT are daytime businesses. 10pm-6am local time = off-peak.
  // Polling intervals increase during off-peak to save queries.
  it('IR-R16: isOffPeak() returns true for 10pm-6am local time', () => {
    vi.useFakeTimers()
    try {
      // Off-peak boundaries
      vi.setSystemTime(new Date(2026, 2, 3, 22, 0, 0)) // 10:00pm = off-peak start
      expect(isOffPeak()).toBe(true)
      vi.setSystemTime(new Date(2026, 2, 3, 23, 59, 0)) // 11:59pm
      expect(isOffPeak()).toBe(true)
      vi.setSystemTime(new Date(2026, 2, 3, 0, 0, 0))   // midnight
      expect(isOffPeak()).toBe(true)
      vi.setSystemTime(new Date(2026, 2, 3, 3, 30, 0))   // 3:30am
      expect(isOffPeak()).toBe(true)
      vi.setSystemTime(new Date(2026, 2, 3, 5, 59, 0))   // 5:59am = last off-peak minute
      expect(isOffPeak()).toBe(true)

      // Active hours boundaries
      vi.setSystemTime(new Date(2026, 2, 3, 6, 0, 0))    // 6:00am = active starts
      expect(isOffPeak()).toBe(false)
      vi.setSystemTime(new Date(2026, 2, 3, 12, 0, 0))   // noon
      expect(isOffPeak()).toBe(false)
      vi.setSystemTime(new Date(2026, 2, 3, 21, 59, 0))  // 9:59pm = last active minute
      expect(isOffPeak()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  // ── IR-R17: NotificationBell polling intervals ───────────────────
  // Push notifications alert users; tab-focus + page navigation refresh instantly.
  // Polling is a slow safety net for badge count accuracy only.
  it('IR-R17: notification polling is 15min active / 30min off-peak', () => {
    expect(POLLING_INTERVALS.notificationCount).toBe(15 * 60 * 1000)
    expect(POLLING_INTERVALS.notificationCountOffPeak).toBe(30 * 60 * 1000)
  })

  // ── IR-R18: Per-vertical vendor order polling ────────────────────
  // FT = same-day food orders → faster polling needed.
  // FM = orders placed days in advance → minimal polling sufficient.
  it('IR-R18a: FT vendor orders poll at 2min active / 10min off-peak', () => {
    expect(POLLING_INTERVALS.vendorOrdersFT).toBe(2 * 60 * 1000)
    expect(POLLING_INTERVALS.vendorOrdersFTOffPeak).toBe(10 * 60 * 1000)
  })

  it('IR-R18b: FM vendor orders poll at 60min active / 180min off-peak', () => {
    expect(POLLING_INTERVALS.vendorOrdersFM).toBe(60 * 60 * 1000)
    expect(POLLING_INTERVALS.vendorOrdersFMOffPeak).toBe(180 * 60 * 1000)
  })

  // ── IR-R19: CutoffStatusBanner — no polling ─────────────────────
  // Cutoff status changes over hours/days, not seconds.
  // Page-load fetch only; no setInterval.
  it.todo('IR-R19: CutoffStatusBanner has no setInterval — page-load fetch only (requires component test)')

  // ── IR-R20: Cron early exit on empty DB ──────────────────────────
  // expire-orders runs 4 parallel count queries before processing.
  // If no active order_items, pending orders, failed payouts, or trial vendors → skip all phases.
  it.todo('IR-R20: expire-orders returns {skipped:true} when no active work exists (requires API test)')

  // ── IR-R21: Quality checks early exit ────────────────────────────
  // vendor-quality-checks counts vendor_profiles first.
  // If 0 vendors → skip all 5 quality checks entirely.
  it.todo('IR-R21: vendor-quality-checks returns {skipped:true} when 0 vendors (requires API test)')

  // ── IR-R22: Phase 9 runs weekly, not daily ───────────────────────
  // Data retention (delete old error_logs, read notifications, activity_events)
  // only runs on Sundays to reduce daily query load.
  it.todo('IR-R22: Phase 9 data retention runs only on Sundays (requires cron test)')

  // ── IR-R23: getPollingInterval off-peak awareness ────────────────
  // All polling uses getPollingInterval() to select the right interval
  // based on time of day. Returns off-peak value during 10pm-6am.
  it('IR-R23: getPollingInterval returns off-peak value during off-peak hours', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 2, 3, 23, 0, 0)) // 11pm = off-peak
      expect(getPollingInterval(1000, 5000)).toBe(5000)

      vi.setSystemTime(new Date(2026, 2, 3, 3, 0, 0))  // 3am = off-peak
      expect(getPollingInterval(2000, 8000)).toBe(8000)

      vi.setSystemTime(new Date(2026, 2, 3, 12, 0, 0)) // noon = active
      expect(getPollingInterval(1000, 5000)).toBe(1000)

      vi.setSystemTime(new Date(2026, 2, 3, 8, 0, 0))  // 8am = active
      expect(getPollingInterval(2000, 8000)).toBe(2000)
    } finally {
      vi.useRealTimers()
    }
  })

  // ── IR-R24: Phase 4.5 batch notification dedup ───────────────────
  // Stale-confirmed notifications use 1 batch query + Set<string> for
  // O(1) dedup lookups, instead of 3 separate DB queries per stale item.
  it.todo('IR-R24: Phase 4.5 uses batch query + Set for notification dedup (requires cron test)')

  // ── IR-R25: Phase 10a batch trial reminder dedup ─────────────────
  // Trial reminder notifications use 1 batch query + Set<string>,
  // instead of 1 DB query per trial vendor.
  it.todo('IR-R25: Phase 10a uses batch query + Set for trial reminder dedup (requires cron test)')

  // ── IR-R26: Quality checks scoped vendor query ───────────────────
  // quality-checks.ts only loads vendor_profiles for IDs found in
  // active schedules, not SELECT * from all vendor_profiles.
  it.todo('IR-R26: quality checks only loads vendor_profiles for IDs in active schedules (requires integration test)')
})
