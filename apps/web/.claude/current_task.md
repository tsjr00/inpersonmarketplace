# Current Task: Session 55 — Batch 3 Extractions + Test Integrity Fixes

Started: 2026-03-09
Status: **TEST INTEGRITY AUDIT IN PROGRESS. Rewriting status-transitions module is NEXT action.**

## WHAT TO DO NEXT

1. **REWRITE `status-transitions.ts` + tests** — User approved. Use `status_system_audit.md` as the source of truth. Key requirements:
   - Use distinct TypeScript types: `OrderStatus` vs `ItemStatus` (user decision)
   - Orders: `pending → paid → completed` (+ cancelled/refunded as interrupts)
   - Items: `pending → confirmed → ready → fulfilled` (+ cancelled/refunded as interrupts)
   - `confirmed` and `ready` exist in order enum but are UNUSED — document as such
   - Item-level cancellation is intentional (user confirmed: "small order better than no order")
   - `fulfilled → ready` revert is WRONG (on backlog to fix) — do NOT include in transitions
   - `pending → ready` is valid for items (vendor can skip confirmed)
   - `any → refunded` via charge.refunded webhook
   - See `status_system_audit.md` for complete transition maps with file/line references
2. **After status rewrite** — resolve remaining findings (F3-F7)
3. **After all findings resolved** — commit everything
4. **Write remaining integration tests** — order lifecycle, infra DB
5. **Push to staging** when ready

## Completed This Session

### Prior commits (1-6, from earlier context windows)
1. `ef1cf3a` — Vendor event readiness application
2. `752d2fa` — Vendor training workflows
3. `7fd9e56` — Business rules confirmations + 18 stubs + 2 active tests
4. `67bb89e` — POC: event-readiness extraction (30 tests)
5. `b97073b` — Batch 2: 6 extractions, 80 tests
6. `fe36513` — Business rules markers: 9 rules → 🟣V

### 7. Batch 3 Phase A — COMPLETE, NOT YET COMMITTED

**Files were staged with `git add` but commit hasn't happened yet.**

#### Group 1: Cron Phase Timing ✅
- **Created:** `src/lib/cron/order-timing.ts` — 4 constants + 4 functions
  - `STRIPE_CHECKOUT_EXPIRY_MS` (10min), `PAYOUT_RETRY_MAX_DAYS` (7), `STALE_CONFIRMATION_WINDOW_MS` (5min), `CONFIRMATION_WINDOW_SECONDS` (30)
  - `isStripeCheckoutExpired()`, `isPayoutRetryable()`, `isConfirmationWindowStale()`, `calculateWindowExpiry()`
- **Created:** `src/lib/cron/__tests__/order-timing.test.ts` — 19 tests passing
- **Modified:** `expire-orders/route.ts` — import swaps for Phase 2/5/7 constants
- **Modified:** 3 confirm routes — removed local `CONFIRMATION_WINDOW_SECONDS`, import from order-timing, `calculateWindowExpiry()` returns string (not Date)
- **Rules:** MP-R15, MP-R17, OL-R15, OL-R21, OL-R22

#### Group 2: Status Transitions ⚠️ NEEDS REWRITE
- **Created:** `src/lib/orders/status-transitions.ts` — WRONG: confused order and item statuses
- **Created:** `src/lib/orders/__tests__/status-transitions.test.ts` — 29 tests but validate wrong state machine
- **Rules:** OL-R1, OL-R2
- **Problem:** Module uses `confirmed`/`fulfilled` for orders — orders actually use `paid`/`completed`. Missing `paid` entirely. See F2 in audit + `status_system_audit.md`
- **Fix:** Rewrite with distinct `OrderStatus`/`ItemStatus` types. User approved 2026-03-10.

#### Group 3: Checkout Helpers ✅
- **Created:** `src/lib/orders/checkout-helpers.ts` — buildIdempotencyKey (5 formats), isTippingEnabled, isExternalPayment, shouldCallStripeRefund
- **Created:** `src/lib/orders/__tests__/checkout-helpers.test.ts` — 22 tests passing
- **Rules:** MP-R7, MP-R19, OL-R9

#### Group 4: Tests for Existing Exports ✅
- **Created:** `src/lib/__tests__/vendor-limits.test.ts` — 27 tests
- **Created:** `src/lib/__tests__/vertical-config.test.ts` — 18 tests (FM display_name = "Farmers Market" not "Farmers Marketing")

#### Business Rules Markers ✅
- 10 rules 📋T → 🟣V: MP-R7, MP-R15, MP-R17, MP-R19, OL-R1, OL-R2, OL-R9, OL-R15, OL-R21, OL-R22
- Stats: 595 passing, 110 todo, 24 test files, 75 active rules, 72 todo, 40% coverage

### 8. Phase B Integration Harness — PARTIALLY DONE

#### Created:
- `vitest.integration.config.ts` — uses `loadEnv` from vite, includes `*.integration.test.ts`, excluded from regular runs
- `vitest.config.ts` — MODIFIED to add `exclude: ['src/**/*.integration.test.ts', 'node_modules']`
- `src/lib/test-utils/supabase-test-client.ts` — createTestClient(), testId(), cleanupTestData()
- `src/lib/__tests__/db-constraints.integration.test.ts` — 4 tests for MP-R6, MP-R8 (NOT PASSING — schema issues)

#### Schema Lessons Learned (for integration tests):
- `vendor_profiles` has NO `business_name` column — it's in `profile_data` JSONB
- `listings` uses `quantity` NOT `quantity_available`
- `listings.status` is `listing_status` enum — use `'draft'` not `'published'`
- `orders.buyer_user_id` is NOT NULL with FK → `auth.users(id)` — must use `supabase.auth.admin.createUser()` for test data
- `orders` also requires NOT NULL: `order_number`, `subtotal_cents`, `platform_fee_cents`, `total_cents`
- UUID columns can't use LIKE for cleanup — must track IDs explicitly
- `vendor_profiles.user_id` is nullable (UUID) — can insert without it
- Cleanup: use reverse-order ID deletion (children first)

## Git State
- **Last commit:** `fe36513`
- **Staged files:** ~17 files (Phase A + harness) — `git add` was run, commit NOT done yet
- **Main:** 27 commits ahead of origin/main
- **Staging:** Synced through `fe36513`
- **Test state:** 595 passing, 110 todo, 0 failures, 24 test files (unit only — integration excluded)

## All New/Modified Files (uncommitted)

### New Files (11):
1. `src/lib/cron/order-timing.ts`
2. `src/lib/cron/__tests__/order-timing.test.ts`
3. `src/lib/orders/status-transitions.ts`
4. `src/lib/orders/__tests__/status-transitions.test.ts`
5. `src/lib/orders/checkout-helpers.ts`
6. `src/lib/orders/__tests__/checkout-helpers.test.ts`
7. `src/lib/__tests__/vendor-limits.test.ts`
8. `src/lib/__tests__/vertical-config.test.ts`
9. `vitest.integration.config.ts`
10. `src/lib/test-utils/supabase-test-client.ts`
11. `src/lib/__tests__/db-constraints.integration.test.ts`

### Modified Files (6):
12. `src/app/api/cron/expire-orders/route.ts` — import swaps for order-timing constants
13. `src/app/api/buyer/orders/[id]/confirm/route.ts` — CONFIRMATION_WINDOW_SECONDS + calculateWindowExpiry import
14. `src/app/api/vendor/market-boxes/pickups/[id]/route.ts` — calculateWindowExpiry import
15. `src/app/api/buyer/market-boxes/[id]/confirm-pickup/route.ts` — calculateWindowExpiry import
16. `vitest.config.ts` — added exclude for integration tests
17. `.claude/business_rules_audit_and_testing.md` — 10 rules updated + changelog

## Key Decisions
- `calculateWindowExpiry()` returns ISO string — routes no longer call `.toISOString()` on result
- `PAYOUT_RETRY_MAX_DAYS` replaces `MAX_RETRY_AGE_DAYS` (3 references in expire-orders)
- Integration tests use `loadEnv` from vite (not dotenv package)
- Regular vitest config excludes `*.integration.test.ts` pattern

## Test Integrity Audit Findings (9 total, see business_rules_audit_and_testing.md)

| Finding | Status | Summary |
|---------|--------|---------|
| F1 (CRITICAL) | REVERTED, backlog | MP-R8 overselling test reverted to assert correct rule. DB function fix on backlog. |
| F2 (CRITICAL) | **NEXT: REWRITE** | status-transitions.ts confused order/item statuses. Full audit in `status_system_audit.md`. |
| F3 (MEDIUM) | RESOLVED | Private pickup limits confirmed by user: FT=2,3,5,15 FM=1,2,3,5. Code matches. |
| F4 (MEDIUM) | OPEN | LOW_STOCK_THRESHOLD — user says "it depends, may vary by listing category." Need to investigate. |
| F5 (MEDIUM) | PARTIALLY RESOLVED | User confirmed tier names. isPremiumTier = paid tiers. isFoodTruckTier('free') issue noted. |
| F6 (LOW) | DEFERRED | FM primary color conflict (#8BC34A vs #2d5016). User will advise later. |
| F7 (LOW) | RESOLVED | display_name "Farmers Market" = venue type (correct). "Farmers Marketing" = brand name. Both valid in context. |
| F8 (LOW) | FIXED | Vertical keys now assert exact set per VI-R1, not just count. |
| F9 (LOW) | FIXED | EXTERNAL_PAYMENT_METHODS now asserts exact array per OL-R9, not just count. |

## User Decisions (2026-03-10)
- **Distinct TypeScript types:** Use `OrderStatus` vs `ItemStatus` in status module (not prefixed DB enum names)
- **Order status progression:** `pending → paid → completed` (+ cancelled/refunded interrupts)
- **Item status progression:** `pending → confirmed → ready → fulfilled` (+ cancelled/refunded, pending→ready skip OK)
- **Unused order enum values:** `confirmed` and `ready` exist in DB enum but never used — document as unused
- **Item-level cancellation:** KEEP — buyer can cancel individual items, order stays active with remaining items
- **fulfilled → ready revert:** WRONG — fulfillment is physical, payout is financial. Fix on backlog. Don't include in status module.
- **Refunded vs cancelled:** Distinct concepts. Refunded = Stripe refund processed. Cancelled = order stopped. External payments can be cancelled but never refunded from our system.
- **F3 private pickup limits:** FT=2,3,5,15 FM=1,2,3,5 (confirmed, matches code)
- **F7 display_name:** "Farmers Market" correct for venue type terminology

## Critical Reference Files
- `apps/web/.claude/status_system_audit.md` — Complete status transition maps with file/line refs
- `apps/web/.claude/business_rules_audit_and_testing.md` — "SESSION 55 TEST INTEGRITY AUDIT" section
- `apps/web/.claude/backlog.md` — fulfill revert fix + atomic_decrement fix added

## Plan File
`C:\Users\tracy\.claude\plans\ticklish-jumping-spark.md` — Batch 3 + Integration Harness plan (approved)
