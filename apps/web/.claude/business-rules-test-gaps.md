# Phase 3: Business Rules Test Gap Analysis

**Generated:** 2026-03-14 (Session 57)
**Method:** Cross-reference of 133 business rules (Phase 2) against existing test audit (Phase 1).

## Legend

| Status | Meaning | Action |
|--------|---------|--------|
| **COVERED** | Functional test exists that calls the function and asserts correct output | None |
| **WEAK** | Static test checks keyword but doesn't verify behavior | New functional test needed |
| **GAP** | No test validates this rule at all | New functional test needed |

---

## A. Pricing & Fees (PF-001 through PF-027)

**Existing coverage:** `pricing.test.ts` (39F), `order-pricing-e2e.test.ts` (30F), `business-rules-coverage.test.ts` (~15F pricing)

| Rule | Status | Existing Test | Notes |
|------|--------|---------------|-------|
| PF-001 | COVERED | pricing.test.ts | `expect(FEES.buyerFeePercent).toBe(6.5)` |
| PF-002 | COVERED | pricing.test.ts | `expect(FEES.vendorFeePercent).toBe(6.5)` |
| PF-003 | COVERED | pricing.test.ts | `expect(FEES.buyerFlatFeeCents).toBe(15)` |
| PF-004 | COVERED | pricing.test.ts | `expect(FEES.vendorFlatFeeCents).toBe(15)` |
| PF-005 | COVERED | pricing.test.ts | `calculateOrderPricing` tests platform fee |
| PF-006 | COVERED | pricing.test.ts | `calculateBuyerPrice` tested |
| PF-007 | COVERED | pricing.test.ts | `calculateItemDisplayPrice` tested |
| PF-008 | COVERED | order-pricing-e2e.test.ts | Per-item vs order-level rounding tested |
| PF-009 | COVERED | pricing.test.ts | `calculateVendorPayout` tested |
| PF-010 | COVERED | pricing.test.ts | Multi-item subtotal tested |
| PF-011 | COVERED | pricing.test.ts | Buyer total tested |
| PF-012 | COVERED | pricing.test.ts | Vendor payout tested |
| PF-013 | COVERED | order-pricing-e2e.test.ts | `proratedFlatFee` zero-sum tested |
| PF-014 | COVERED | order-pricing-e2e.test.ts | Edge cases tested |
| PF-015 | COVERED | business-rules-coverage.test.ts | `proratedFlatFeeSimple` tested |
| PF-016 | COVERED | pricing.test.ts | FM small order config tested |
| PF-017 | COVERED | pricing.test.ts | FT small order config tested |
| PF-018 | COVERED | pricing.test.ts | FW small order config tested |
| PF-019 | COVERED | pricing.test.ts | Default config tested |
| PF-020 | COVERED | pricing.test.ts | Displayed subtotal comparison tested |
| PF-021 | COVERED | pricing.test.ts | Boundary tests present |
| PF-022 | COVERED | pricing.test.ts | `amountToAvoidSmallOrderFee` tested |
| PF-023 | GAP | — | Subscription amounts not tested as individual assertions |
| PF-024 | GAP | — | FT subscription amounts not tested |
| PF-025 | GAP | — | Buyer premium amounts not tested |
| PF-026 | COVERED | pricing.test.ts | `formatPrice` tested |
| PF-027 | COVERED | pricing.test.ts | `formatDisplayPrice` tested |

**Gaps: PF-023, PF-024, PF-025** — Subscription amounts exist as constants but no test asserts their specific values.

---

## B. Cancellation & Refunds (CX-001 through CX-014)

**Existing coverage:** `business-rules-coverage.test.ts` (~15F cancellation tests)

| Rule | Status | Existing Test | Notes |
|------|--------|---------------|-------|
| CX-001 | COVERED | business-rules-coverage.test.ts | `getGracePeriodMs('farmers_market')` → 3600000 |
| CX-002 | COVERED | business-rules-coverage.test.ts | FT grace period tested |
| CX-003 | COVERED | business-rules-coverage.test.ts | FW grace period tested |
| CX-004 | COVERED | business-rules-coverage.test.ts | Default grace period tested |
| CX-005 | COVERED | business-rules-coverage.test.ts | Within-grace full refund tested |
| CX-006 | COVERED | business-rules-coverage.test.ts | Post-grace confirmed → 25% fee |
| CX-007 | COVERED | business-rules-coverage.test.ts | Post-grace unconfirmed → full refund |
| CX-008 | COVERED | business-rules-coverage.test.ts | 25% constant + calculation tested |
| CX-009 | COVERED | business-rules-coverage.test.ts | Buyer-paid calculation tested |
| CX-010 | COVERED | business-rules-coverage.test.ts | Refund = 75% tested |
| CX-011 | COVERED | business-rules-coverage.test.ts | Fee + refund = total tested |
| CX-012 | COVERED | business-rules-coverage.test.ts | Fee split tested |
| CX-013 | COVERED | business-rules-coverage.test.ts | Vendor confirmation statuses tested |
| CX-014 | GAP | — | No test specifically verifies that cancellation uses floor-based proration |

**Gaps: CX-014** — The specific use of `proratedFlatFeeSimple` (floor, not index-based) in cancellation is not independently tested.

---

## B2. External Payment Fees (VF-001 through VF-013)

**Existing coverage:** `business-rules-coverage.test.ts` has some vendor-fee tests

| Rule | Status | Existing Test | Notes |
|------|--------|---------------|-------|
| VF-001 | GAP | — | `SELLER_FEE_PERCENT` not tested |
| VF-002 | GAP | — | `calculateExternalBuyerFee` not tested |
| VF-003 | GAP | — | `calculateBuyerFee` (vendor-fees version) not tested |
| VF-004 | GAP | — | `calculateTotalExternalFee` not tested |
| VF-005 | GAP | — | `calculateExternalPaymentTotal` not tested |
| VF-006 | GAP | — | `AUTO_DEDUCT_MAX_PERCENT` not tested |
| VF-007 | GAP | — | `calculateAutoDeductAmount` not tested |
| VF-008 | GAP | — | Edge case (owed ≤ 0) not tested |
| VF-009 | GAP | — | `BALANCE_INVOICE_THRESHOLD_CENTS` not tested |
| VF-010 | GAP | — | `AGE_INVOICE_THRESHOLD_DAYS` not tested |
| VF-011 | SKIP | — | Integration (needs DB) |
| VF-012 | SKIP | — | Integration (needs DB) |
| VF-013 | SKIP | — | Integration (needs DB) |

**Gaps: VF-001 through VF-010** — The entire `vendor-fees.ts` pure function suite has NO functional tests. This is a major gap — 10 testable business rules about real money calculations.

---

## B3. Tip Calculations (TIP-001 through TIP-007)

**Existing coverage:** `business-rules-coverage.test.ts` has tip tests

| Rule | Status | Existing Test | Notes |
|------|--------|---------------|-------|
| TIP-001 | COVERED | business-rules-coverage.test.ts | `calculateTipShare` tested |
| TIP-002 | COVERED | business-rules-coverage.test.ts | Null tip → 0 tested |
| TIP-003 | COVERED | business-rules-coverage.test.ts | Null items → 0 tested |
| TIP-004 | COVERED | business-rules-coverage.test.ts | `calculateVendorTip` tested |
| TIP-005 | COVERED | business-rules-coverage.test.ts | Null vendor tip → 0 tested |
| TIP-006 | COVERED | business-rules-coverage.test.ts | `calculatePlatformFeeTip` tested |
| TIP-007 | COVERED | business-rules-coverage.test.ts | ≤0 tip → 0 tested |

**Gaps: None** — Tip calculations fully covered.

---

## C. Order Lifecycle (OL-001 through OL-013)

**Existing coverage:** `order-lifecycle.integration.test.ts` (partial), `subscription-lifecycle.integration.test.ts` (partial), `business-rules-coverage.test.ts` (partial)

| Rule | Status | Existing Test | Notes |
|------|--------|---------------|-------|
| OL-001 | GAP | — | `ORDER_STATUSES_ACTIVE` not asserted |
| OL-002 | GAP | — | `ORDER_STATUSES_UNUSED` not asserted |
| OL-003 | GAP | — | `isValidOrderTransition` not tested (transition map not verified) |
| OL-004 | GAP | — | `ORDER_TERMINAL_STATUSES` not asserted |
| OL-005 | GAP | — | `ITEM_STATUSES` not asserted |
| OL-006 | GAP | — | `isValidItemTransition` not tested |
| OL-007 | GAP | — | `ITEM_TERMINAL_STATUSES` not asserted |
| OL-008 | GAP | — | Same-status rejection not tested |
| OL-009 | COVERED | subscription-lifecycle.test.ts | `isExternalPayment` tested (SL-R9) |
| OL-010 | COVERED | vertical-features.test.ts | `isTippingEnabled` tested (3 verticals) |
| OL-011 | COVERED | subscription-lifecycle.test.ts | `isExternalPayment` tested |
| OL-012 | COVERED | subscription-lifecycle.test.ts | `shouldCallStripeRefund` tested |
| OL-013 | COVERED | subscription-lifecycle.test.ts, business-rules-coverage.test.ts | `buildIdempotencyKey` tested |

**Gaps: OL-001 through OL-008** — The entire status transition state machine (`status-transitions.ts`) has ZERO functional tests. This is critical — if someone adds or removes a valid transition, no test catches it.

---

## D. Availability & Cutoffs (AV-001 through AV-010)

**Existing coverage:** `availability-status.test.ts` (16F), `vertical-features.test.ts` (SW for cutoffs)

| Rule | Status | Existing Test | Notes |
|------|--------|---------------|-------|
| AV-001 | COVERED | availability-status.test.ts | undefined → closed tested |
| AV-002 | COVERED | availability-status.test.ts | is_accepting: false → closed |
| AV-003 | COVERED | availability-status.test.ts | closing-soon logic tested |
| AV-004 | COVERED | availability-status.test.ts | Rounding tested |
| AV-005 | COVERED | availability-status.test.ts | Open status tested |
| AV-006 | COVERED | availability-status.test.ts | Vendor non-published → open |
| AV-007 | WEAK | vertical-features.test.ts | `expect(constants).toContain('traditional: 18')` — keyword only |
| AV-008 | WEAK | vertical-features.test.ts | Keyword check for private_pickup |
| AV-009 | WEAK | vertical-features.test.ts | Keyword check for food_trucks: 0 |
| AV-010 | WEAK | vertical-features.test.ts | Keyword check for event cutoff |

**Gaps: AV-007 through AV-010** — Cutoff hour constants are tested via keyword matching (string check on source file) instead of importing and asserting the actual values.

---

## E. Vendor Tiers & Limits (VT-001 through VT-017)

**Existing coverage:** `vendor-tier-limits.test.ts` (48F), `vendor-limits.test.ts` (21F)

| Rule | Status | Existing Test | Notes |
|------|--------|---------------|-------|
| VT-001 | COVERED | vendor-tier-limits.test.ts | FM free limits tested |
| VT-002 | COVERED | vendor-tier-limits.test.ts | FM standard tested |
| VT-003 | COVERED | vendor-tier-limits.test.ts | FM premium tested |
| VT-004 | COVERED | vendor-tier-limits.test.ts | FM featured tested |
| VT-005 | COVERED | vendor-tier-limits.test.ts | FT free tested |
| VT-006 | COVERED | vendor-tier-limits.test.ts | FT basic tested |
| VT-007 | COVERED | vendor-tier-limits.test.ts | FT pro tested |
| VT-008 | COVERED | vendor-tier-limits.test.ts | FT boss tested |
| VT-009 | COVERED | vendor-limits.test.ts | `isFoodTruckTier` tested |
| VT-010 | COVERED | vendor-limits.test.ts | FM `isPremiumTier` tested |
| VT-011 | COVERED | vendor-limits.test.ts | FT `isPremiumTier` tested |
| VT-012 | GAP | — | `getTierSortPriority` FM values not tested |
| VT-013 | GAP | — | `getTierSortPriority` FT values not tested |
| VT-014 | COVERED | vendor-tier-limits.test.ts | FM notification channels tested |
| VT-015 | COVERED | vendor-tier-limits.test.ts | FT notification channels tested |
| VT-016 | COVERED | vendor-limits.test.ts | FT unknown tier → free fallback |
| VT-017 | COVERED | vendor-limits.test.ts | FM unknown tier → free fallback |

**Gaps: VT-012, VT-013** — Sort priority function not tested.

---

## F. Inventory (INV-001)

| Rule | Status | Existing Test | Notes |
|------|--------|---------------|-------|
| INV-001 | COVERED | db-constraints.integration.test.ts | Tests `atomic_decrement_inventory` RPC (MP-R8). Bug documented: clamps to 0 instead of rejecting. |

**Gaps: None** — Integration test exists.

---

## G. Notifications (NI-001 through NI-014)

**Existing coverage:** `notification-types.test.ts` (52+F)

| Rule | Status | Existing Test | Notes |
|------|--------|---------------|-------|
| NI-001 | COVERED | notification-types.test.ts | `URGENCY_CHANNELS.immediate` tested |
| NI-002 | COVERED | notification-types.test.ts | urgent channels tested |
| NI-003 | COVERED | notification-types.test.ts | standard channels tested |
| NI-004 | COVERED | notification-types.test.ts | info channels tested |
| NI-005 | COVERED | notification-types.test.ts | order_ready urgency tested |
| NI-006 | COVERED | notification-types.test.ts | order_cancelled_by_vendor tested |
| NI-007 | COVERED | notification-types.test.ts | new_paid_order tested |
| NI-008 | COVERED | notification-types.test.ts | payout_failed tested |
| NI-009 | COVERED | notification-types.test.ts | charge_dispute_created tested |
| NI-010 | COVERED | notification-types.test.ts | FM order_ready override tested |
| NI-011 | COVERED | notification-types.test.ts | FM cancellation override tested |
| NI-012 | COVERED | notification-types.test.ts | FM new_paid_order override tested |
| NI-013 | COVERED | notification-types.test.ts | Default urgency (no vertical) tested |
| NI-014 | GAP | — | Exact type count (37) not asserted |

**Gaps: NI-014** — Total type count assertion exists but checks `>= 28`, not exact count.

---

## H. Vendor Onboarding (OB-001 through OB-007)

**Existing coverage:** `vendor-onboarding.test.ts` (0F, all SW/SS)

| Rule | Status | Existing Test | Notes |
|------|--------|---------------|-------|
| OB-001 | WEAK | vendor-onboarding.test.ts | Keyword checks only — `expect(route).toContain(...)` |
| OB-002 | WEAK | vendor-onboarding.test.ts | Keyword checks |
| OB-003 | WEAK | vendor-onboarding.test.ts | Keyword checks for COI soft gate |
| OB-004 | WEAK | vendor-onboarding.test.ts | Keyword checks for Stripe |
| OB-005 | WEAK | vendor-onboarding.test.ts | Multiple keywords, no logic test |
| OB-006 | WEAK | vendor-onboarding.test.ts | Keyword checks |
| OB-007 | WEAK | vendor-onboarding.test.ts | Keyword check for grandfathered |

**Gaps: ALL (OB-001 through OB-007)** — Every onboarding rule is tested with keyword matching only. These are all integration tests by nature (require DB), so they cannot be converted to unit tests. However, the onboarding logic is in a route handler (not a pure function), making it harder to test without an HTTP request. Flag for future extraction.

---

## I. Payments & Payouts (PP-001 through PP-002)

| Rule | Status | Existing Test | Notes |
|------|--------|---------------|-------|
| PP-001 | GAP | — | `STRIPE_CONFIG.applicationFeePercent` not tested directly |
| PP-002 | GAP | — | Cross-file subscription price consistency not tested |

**Gaps: PP-001, PP-002** — Stripe config values not independently tested.

---

## J. Cron Jobs (CR-001 through CR-028)

**Existing coverage:** `business-rules-coverage.test.ts` (some timing tests), `vertical-features.test.ts` (reminder delay), `order-lifecycle.integration.test.ts` (2 constants)

| Rule | Status | Existing Test | Notes |
|------|--------|---------------|-------|
| CR-001 | COVERED | order-lifecycle.integration.test.ts | Redundant name but tests STRIPE_CHECKOUT_EXPIRY_MS |
| CR-002 | COVERED | order-lifecycle.integration.test.ts | PAYOUT_RETRY_MAX_DAYS = 7 |
| CR-003 | COVERED | subscription-lifecycle.test.ts | STALE_CONFIRMATION_WINDOW_MS = 300000 |
| CR-004 | COVERED | order-lifecycle.integration.test.ts | CONFIRMATION_WINDOW_SECONDS = 30 |
| CR-005 | GAP | — | `isStripeCheckoutExpired` function not tested |
| CR-006 | GAP | — | `isPayoutRetryable` function not tested |
| CR-007 | GAP | — | `isConfirmationWindowStale` function not tested |
| CR-008 | GAP | — | `calculateWindowExpiry` function not tested |
| CR-009 | COVERED | vertical-features.test.ts | FT reminder delay 900000 ms tested |
| CR-010 | COVERED | vertical-features.test.ts | FM reminder delay tested |
| CR-011 | COVERED | vertical-features.test.ts | FW reminder delay tested |
| CR-012 | COVERED | vertical-features.test.ts | Default delay tested |
| CR-013 | COVERED | vertical-features.test.ts | `isOrderOldEnoughForReminder` tested |
| CR-014 | GAP | — | `AUTO_CONFIRM_PAYMENT_METHODS` contents not tested |
| CR-015 | GAP | — | `getAutoConfirmCutoffDate` not tested |
| CR-016 | GAP | — | `areAllItemsPastPickupWindow` not tested |
| CR-017 | GAP | — | `formatPaymentMethodLabel` not tested |
| CR-018 | GAP | — | `calculateNoShowPayout` not tested |
| CR-019 | GAP | — | `shouldTriggerNoShow` FT with time not tested |
| CR-020 | GAP | — | `shouldTriggerNoShow` FM date-based not tested |
| CR-021 | COVERED | business-rules-coverage.test.ts | DATA_RETENTION_DAYS.error_logs = 90 |
| CR-022 | COVERED | business-rules-coverage.test.ts | notifications = 60 |
| CR-023 | COVERED | business-rules-coverage.test.ts | activity_events = 30 |
| CR-024 | COVERED | business-rules-coverage.test.ts | `isCleanupDay` tested |
| CR-025 | COVERED | business-rules-coverage.test.ts | `calculateRetentionCutoffs` tested |
| CR-026 | COVERED | vendor-limits.test.ts | LOW_STOCK_THRESHOLD = 5 |
| CR-027 | GAP | — | Category count (11 each) not tested |
| CR-028 | GAP | — | `formatQuantityDisplay` not tested |

**Gaps: CR-005 through CR-008, CR-014 through CR-020, CR-027, CR-028** — 14 cron-related rules have no functional tests. The order timing functions, no-show logic, external payment auto-confirm functions, and misc constants/formatters are all untested.

---

## Gap Summary

### By Priority

**CRITICAL — Financial/safety rules with no functional tests:**
1. **VF-001 through VF-010** (vendor fees) — 10 rules about real money calculations for external payments: seller fee rates, buyer fee rates, auto-deduction caps, invoice thresholds. Zero tests.
2. **OL-001 through OL-008** (status transitions) — 8 rules defining the order/item state machines. If a transition is added/removed, nothing catches it.
3. **CR-018 through CR-020** (no-show payout) — Vendor payout for buyer no-shows. Untested.

**HIGH — Logic with no tests:**
4. **CR-005 through CR-008** (order timing) — Stripe checkout expiry, payout retry window, stale confirmation. Pure functions, easy to test.
5. **CR-014 through CR-017** (external payment auto-confirm) — Auto-confirm eligible methods, cutoff date, items past pickup. Pure functions.
6. **PP-001, PP-002** (Stripe config) — Application fee percent, subscription price consistency.
7. **PF-023 through PF-025** (subscription amounts) — Exact dollar values for all tier prices.
8. **VT-012, VT-013** (sort priority) — Browse page ordering by tier.

**MEDIUM — Weak static tests that should be functional:**
9. **AV-007 through AV-010** (cutoff hours) — Currently keyword checks; should import and assert constants.
10. **NI-014** (notification type count) — Asserts ≥28 but should assert exact count (37).
11. **CX-014** (cancellation proration) — Floor-based vs index-based distinction not tested.
12. **CR-027, CR-028** (categories, formatQuantityDisplay) — Count and formatting.

**LOW — Integration-only (cannot be unit tested):**
13. **OB-001 through OB-007** (onboarding gates) — Route handler logic, needs DB. Flag for future extraction.

### New Test Files Needed

| File | Rules Covered | Est. Tests |
|------|---------------|------------|
| `vendor-fees-functional.test.ts` | VF-001 through VF-010 | ~20 |
| `status-transitions-functional.test.ts` | OL-001 through OL-008 | ~30 |
| `cron-timing-functional.test.ts` | CR-005 through CR-008, CR-014 through CR-020, CR-027, CR-028 | ~35 |
| `subscription-amounts-functional.test.ts` | PF-023 through PF-025, PP-001, PP-002, CX-014 | ~15 |
| `cutoff-and-sort-functional.test.ts` | AV-007 through AV-010, VT-012, VT-013, NI-014 | ~15 |

**Total new functional tests needed: ~115**
**Total gaps identified: 48 rules without functional coverage**
