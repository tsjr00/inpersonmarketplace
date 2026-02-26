# Current Task: Session 46/47/48 — Business Rules Audit & Testing Protocol
Started: 2026-02-25 | Updated: 2026-02-26

## Goal
Build a business rules test suite to replace recurring broad audits. Create named workflows + testable rules for 8 domains, then map their interactions.

## Status: ALL 8 DOMAINS MAPPED ✅ — Domain 1 (Money Path) Fully Validated ✅

## Key Context
- **Reference file**: `apps/web/.claude/business_rules_audit_and_testing.md` — THE persistent document
- **Totals**: 62 named workflows, ~107 business rules (97 original + 10 tip rules), 34 gaps, 17 open questions
- **RULE**: Ask user before making any code changes (user reminded us of this rule during this session)

## Code Changes Made (All Sessions)
1. **Cron Phase 4 tip fix** (`src/app/api/cron/expire-orders/route.ts`):
   - Added `tip_on_platform_fee_cents` to Phase 4 query select
   - Changed tip calculation from `tipAmount / totalItems` to `(tipAmount - tipOnPlatformFee) / totalItems`
   - Type-check: ✅ pass | Tip tests: ✅ 25/25 pass

2. **MP-R5 fix** (`src/lib/pricing.ts`):
   - `calculateSmallOrderFee` now compares displayed subtotal (base×1.065) against threshold, not base subtotal
   - Tests updated with edge cases for threshold boundary

3. **MP-R13 fix** (`src/lib/pricing.ts` + `src/lib/__tests__/pricing.test.ts`):
   - Updated `SMALL_ORDER_FEE_DEFAULTS` with per-vertical values:
     - FT: threshold $5.00 (500), fee $0.50 (50) — unchanged
     - FM: threshold $10.00 (1000), fee $1.00 (100) — was 500/50
     - FW: threshold $40.00 (4000), fee $4.00 (400) — was 500/50
   - Updated `DEFAULT_SMALL_ORDER_FEE` to { thresholdCents: 1000, feeCents: 100 }
   - Type-check: ✅ pass | Pricing tests: ✅ 37/37 pass

4. **Minimum order → small order fee refactor** (pricing.ts, constants.ts, stripe/config.ts, tests):
   - **Removed**: `FEES.minimumOrderCents`, `VERTICAL_MINIMUM_DEFAULTS`, `getMinimumOrderCents()`, `meetsMinimumOrder()`, `amountToMinimum()`
   - **Removed**: `MINIMUM_ORDER_CENTS` re-export from constants.ts, `minimumOrderCents` from `STRIPE_CONFIG`
   - **Added**: `amountToAvoidSmallOrderFee(subtotalCents, vertical?)` — returns displayed cents needed to avoid fee
   - **Updated**: Both test files (pricing.test.ts + order-pricing-e2e.test.ts) — removed old tests, added new
   - **Updated**: checkout page comment (minor)
   - All symbols were dead code in production (only used in tests) — checkout already used small order fee system
   - Type-check: ✅ pass | All pricing tests: ✅ 74/74 pass (33 unit + 41 integration)

## Domain 1 Money Path — All Rules Validated ✅
- MP-R1 through MP-R28: ALL confirmed by user
- MP-R5: Corrected + code fixed (displayed subtotal threshold)
- MP-R8: Rule text updated (per-item specificity)
- MP-R13: Corrected + code fixed (per-vertical thresholds and fees, minimum order rejection removed)
- MP-R14: Expanded (Stripe idempotency + session timeout)
- MP-R17: Updated (admin notification as urgent)
- MP-R18: Expanded (per-item restore + listing-level isolation)

## What's Remaining
1. **Continue user validation** of Domains 2-8 rules
2. **Document workflow interactions** across all 8 domains (user's stated next goal)
3. User answers remaining open questions (17 total across all domains)
4. Write Vitest test files implementing validated business rules

## Key Files
- `apps/web/.claude/business_rules_audit_and_testing.md` — PRIMARY reference (read FIRST)
- `apps/web/.claude/current_task.md` — THIS FILE (session state)
- `src/app/api/cron/expire-orders/route.ts` — Modified (Phase 4 tip fix)
- `src/lib/pricing.ts` — Modified (MP-R5/R13 + minimum order removal + amountToAvoidSmallOrderFee)
- `src/lib/__tests__/pricing.test.ts` — Modified (new test coverage)
- `src/lib/__tests__/integration/order-pricing-e2e.test.ts` — Modified (updated for new API)
- `src/lib/constants.ts` — Modified (removed MINIMUM_ORDER_CENTS)
- `src/lib/stripe/config.ts` — Modified (removed minimumOrderCents from STRIPE_CONFIG)
- `src/lib/payments/tip-math.ts` — Tip calculation functions (verified, no changes needed)
