# Phase 1: Existing Test Audit

Generated: 2026-03-14

## Categories

| Category | Definition | Symbol |
|----------|-----------|--------|
| **Functional** | Calls a real function with inputs, asserts outputs | F |
| **Integration** | Hits a real database or service, asserts results | I |
| **Static (strong)** | Reads source to verify a structural invariant that CAN'T be tested functionally | SS |
| **Static (weak)** | Reads source to check for a keyword that proves nothing about correctness | SW |
| **Meta** | Checks that another test file contains a rule ID string | M |
| **Noop** | `expect(true).toBe(true)` or equivalent — no assertion | N |

---

## File-by-File Audit

### 1. `pricing.test.ts` (39 tests)

| Test Name | Cat | Business Rule | Notes |
|-----------|-----|---------------|-------|
| MP-R1: buyer percentage fee is 6.5% | F | MP-R1 | `expect(FEES.buyerFeePercent).toBe(6.5)` |
| MP-R1: buyer flat fee is $0.15 | F | MP-R1 | Tests exported constant |
| MP-R1: vendor percentage fee is 6.5% | F | MP-R2 | Tests exported constant |
| MP-R1: vendor flat fee is $0.15 | F | MP-R2 | Tests exported constant |
| calculateOrderPricing: single $10 item | F | MP-R1/R2 | Full calculation with assertions |
| calculateOrderPricing: multi-item flat fee once | F | MP-R1/R12 | Verifies flat fee is per-order |
| calculateOrderPricing: fractional-cent rounding | F | MP-R1 | Tests Math.round behavior |
| calculateOrderPricing: zero subtotal | F | MP-R1 | Edge case |
| calculateBuyerPrice: matches order pricing | F | MP-R1 | Cross-validates two functions |
| calculateVendorPayout: $10 subtotal | F | MP-R2 | Direct function test |
| MP-R9: calculateItemDisplayPrice | F | MP-R9 | Per-item rounding |
| MP-R13: amountToAvoidSmallOrderFee (9 tests) | F | MP-R13 | Per-vertical thresholds + boundaries |
| formatPrice (3 tests) | F | — | Formatting utility |
| MP-R5/R13: calculateSmallOrderFee (12 tests) | F | MP-R5/R13 | Per-vertical fee + edge cases |
| MP-R13: getSmallOrderFeeConfig (3 tests) | F | MP-R13 | Config lookup |

**Summary: 39/39 FUNCTIONAL. Gold standard file.**

---

### 2. `errors.test.ts` (8 tests)

| Test Name | Cat | Business Rule | Notes |
|-----------|-----|---------------|-------|
| TracedError: creates error with code and message | F | IR-R6 | Tests class constructor |
| TracedError: generates unique trace IDs | F | IR-R6 | Uniqueness test |
| TracedError: includes context data | F | IR-R6 | Context object |
| TracedError: toResponse includes traceId and code | F | IR-R6 | Response format |
| TracedError: toResponse includes details in dev mode | F | IR-R6 | Dev vs prod mode |
| TracedError: fromUnknown wraps plain errors | F | IR-R6 | Error wrapping |
| TracedError: fromUnknown passes through TracedError | F | IR-R6 | Passthrough behavior |
| getHttpStatus: maps error codes to HTTP status | F | IR-R6 | Error code → status mapping |

**Summary: 8/8 FUNCTIONAL.**

---

### 3. `vendor-limits.test.ts` (21 tests)

| Test Name | Cat | Business Rule | Notes |
|-----------|-----|---------------|-------|
| LOW_STOCK_THRESHOLD is 5 | F | VJ-R6 | Checks constant value |
| getTierLimits — FM free/standard/premium/featured | F | VJ-R3 | 4 tests checking productListings |
| getTierLimits — unknown FM tier → free | F | VJ-R6 | Fallback behavior |
| getTierLimits — FT free/basic/pro/boss | F | VJ-R3 | 4 tests |
| getTierLimits — unknown FT tier → FT free | F | VJ-R6 | Fallback |
| Market/location limits (6 tests) | F | VJ-R8 | Specific limits + monotonic check |
| isFoodTruckTier (4 tests) | F | VI-R12 | Tier identification |
| isPremiumTier (6 tests) | F | — | Tier classification |

**Summary: 21/21 FUNCTIONAL.**

---

### 4. `vertical-config.test.ts` (12 tests)

| Test Name | Cat | Business Rule | Notes |
|-----------|-----|---------------|-------|
| defaultBranding contains exactly 3 verticals | F | VI-R1 | Checks keys |
| farmers_market/food_trucks/fire_works configured | F | VI-R1 | 3 tests |
| FM domain, FT domain | F | VI-R2 | Domain values |
| Each vertical has brand_name, colors, meta | F | VI-R2 | 3 tests iterating |
| term() FM/FT vendor/listing/display_name | F | VI-R5 | 6 tests |
| term() fallback for unknown vertical | F | VI-R7 | Fallback behavior |
| hasTerminologyConfig | F | VI-R7 | 3 tests |

**Summary: 12/12 FUNCTIONAL.**

---

### 5. `schedule-overlap.test.ts` (24 tests)

| Test Name | Cat | Business Rule | Notes |
|-----------|-----|---------------|-------|
| padTime (3 tests) | F | VJ-R14 | Format normalization |
| timesOverlap (9 tests) | F | VJ-R14 | Overlap detection logic |
| findScheduleConflicts (5 tests) | F | VJ-R14 | Higher-level conflict detection |
| dayOfWeekName (2 tests) | F | — | Formatting helper |
| formatTimeDisplay (5 tests) | F | — | AM/PM formatting |

**Summary: 24/24 FUNCTIONAL.**

---

### 6. `infra-config.test.ts` (23 tests)

| Test Name | Cat | Business Rule | Notes |
|-----------|-----|---------------|-------|
| IR-R12: X-Content-Type-Options nosniff | SS | IR-R12 | Config file must contain exact header |
| IR-R12: X-Frame-Options DENY | SS | IR-R12 | Config must have this header |
| IR-R12: Strict-Transport-Security | SS | IR-R12 | HSTS header |
| IR-R12: Referrer-Policy | SS | IR-R12 | Security header |
| IR-R12: Permissions-Policy | SS | IR-R12 | Camera/mic restrictions |
| IR-R12: CSP present | SS | IR-R12 | Content-Security-Policy |
| IR-R12: CSP allows Stripe/Supabase/Sentry | SS | IR-R12 | Allowlist verification |
| IR-R12: headers on all routes | SS | IR-R12 | Route pattern |
| IR-R13: activity feed uses s-maxage | SW | IR-R13 | Just checks keyword exists |
| IR-R13: listings route uses no-store | SW | IR-R13 | Just checks keyword exists |
| IR-R19: no setInterval | SS | IR-R19 | Absence of polling is structural |
| IR-R19: no recursive setTimeout | SS | IR-R19 | Pattern absence check |
| IR-R19: dependency array stable | SS | IR-R19 | Effect deps check |
| IR-R19: page-load-only comment | SW | IR-R19 | Just checks comment exists |
| IR-R1: multiple try blocks in cron | SW | IR-R1 | Counts try blocks, doesn't test isolation |
| IR-R1: Phase 1/2/3 comments exist | SW | IR-R1 | Comment existence |
| IR-R2: for loops in cron route | SW | IR-R2 | Counts for loops |
| IR-R3: webhook route exists | SS | IR-R3 | File existence |
| IR-R3: webhook validates signature | SS | IR-R3 | constructEvent = Stripe verification |
| IR-R4: CI workflow exists | SS | IR-R4 | File existence |
| IR-R5: instrumentation file exists | SS | IR-R5 | File existence |
| IR-R6: withErrorTracing importable, used in checkout/cron | SS | IR-R6 | Call site verification |
| IR-R14: cron returns JSON + summary | SW | IR-R14 | Just keyword checks |
| IR-R20: cron has .select() | SW | IR-R20 | Could be any select |
| IR-R24: Phase 4.5 + new Set | SW | IR-R24 | Keyword presence |
| IR-R25: Phase 10 exists | SW | IR-R25 | Keyword presence |
| IR-R7: sendAdminAlert exists | SS | IR-R7 | Function existence in logger |

**Summary: 14 SS, 9 SW. No functional tests in this file. The SS tests are legitimately structural (can't test config presence functionally). The SW tests are weak — they check keywords but don't verify behavior.**

---

### 7. `order-cron-rules.test.ts` (14 tests)

| Test Name | Cat | Business Rule | Notes |
|-----------|-----|---------------|-------|
| OL-R11: reject sets item to cancelled | SW | OL-R11 | Checks route contains `'cancelled'` |
| OL-R11: reject calls createRefund | SW | OL-R11 | Keyword check |
| OL-R11: reject imports from stripe/payments | SW | OL-R11 | Import path check |
| OL-R11: reject sends notification | SW | OL-R11 | Keyword check |
| OL-R13: reject sends exactly one buyer type | SW | OL-R13 | Counts sendNotification calls |
| OL-R13: confirm route sends notification | SW | OL-R13 | File exists + keyword |
| OL-R14: Phase 1 exists and handles unaccepted | SW | OL-R14 | Keyword pattern match |
| OL-R14: Phase 1 has own try/catch | SW | OL-R14 | Keyword check |
| OL-R16: Phase 3 handles external | SW | OL-R16 | Keyword pattern |
| OL-R16: Phase 3 has own try/catch | SW | OL-R16 | Keyword check |
| OL-R20: Phase 4.5 exists | SW | OL-R20 | Keyword check |
| OL-R20: Phase 4.5 sends notifications | SW | OL-R20 | Keyword check |
| OL-R20: Phase 4.5 has error handling | SW | OL-R20 | Keyword check |
| MP-R14: success route calls RPC | SS | MP-R14 | RPC name is a legitimate structural check |
| MP-R14: success route calls createRefund | SW | MP-R14 | Keyword check |
| MP-R18: success route idempotent keyword | SW | MP-R18 | Just checks 'idempotent' word |
| MP-R18: webhook idempotent + already exists | SW | MP-R18 | Keyword checks |
| MP-R18: webhook Payment record already exists | SW | MP-R18 | Exact string check |
| MP-R18: Market box subscription already exists | SW | MP-R18 | Exact string check |

**Summary: 1 SS, 18 SW. Almost entirely weak static. These tests prove keywords exist in source files — they would pass even if the reject route refunded 0% or the wrong person.**

---

### 8. `notification-types.test.ts` (52+ tests)

| Test Name | Cat | Business Rule | Notes |
|-----------|-----|---------------|-------|
| NOTIFICATION_REGISTRY has all required types | F | NI | Checks actual registry keys |
| Every type has title/message/actionUrl functions | F | NI | Tests function existence + type |
| Every type produces non-empty title/message | F | NI | Calls functions with test data |
| order_refunded includes refund amount | F | NI | Tests message formatting |
| URGENCY_CHANNELS mapping (4 urgency levels) | F | NI | Checks actual channel arrays |
| getNotificationConfig for known/unknown types | F | NI | Tests function behavior |
| In-app always included per urgency | F | NI | Checks channel arrays |
| Each type has buyer/vendor/admin audience | F | NI | Validates audience field |
| Type count >= 28 | F | NI | Count check |
| actionUrl uses vertical parameter | F | NI | Tests function with FT/FM data |
| NI-R28-R36: Registry urgency values (9 rules) | F | NI-R28-R36 | Tests registry + getNotificationUrgency |
| NI-R19-R27: Per-vertical urgency (11 tests) | F | NI-R19-R27 | Tests getNotificationUrgency per vertical |
| NI-Q5: Tier-based channel gating (14 tests) | F | NI-Q5 | Tests getTierNotificationChannels |
| Urgency→channel mapping integrity (4 tests) | F | NI | Tests exact channel arrays |
| Audience correctness (~39 types) | F | NI | Validates audience per type |

**Summary: 52+/52+ FUNCTIONAL. Excellent file — tests actual functions, registry values, and behavior.**

---

### 9. `rate-limit.test.ts` (6 tests)

| Test Name | Cat | Business Rule | Notes |
|-----------|-----|---------------|-------|
| checkRateLimit allows under limit | F | IR | Tests real rate limiter |
| checkRateLimit tracks remaining | F | IR | Sequential calls |
| checkRateLimit blocks at limit | F | IR | Tests blocking behavior |
| Different identifiers tracked independently | F | IR | Isolation test |
| rateLimits presets values | F | IR | Checks preset configurations |
| rateLimitResponse returns 429 with headers | F | IR | Tests response object |

**Summary: 6/6 FUNCTIONAL.**

---

### 10. `availability-status.test.ts` (16 tests)

| Test Name | Cat | Business Rule | Notes |
|-----------|-----|---------------|-------|
| deriveAvailabilityStatus: all cases | F | VJ-R12 | 11 tests with various inputs |
| deriveVendorAvailabilityStatus: all cases | F | VJ-R12 | 5 tests with listing status combos |

**Summary: 16/16 FUNCTIONAL. Created in Session 56 (M4 consolidation).**

---

### 11. `pickup-formatters.test.ts` (31 tests)

| Test Name | Cat | Business Rule | Notes |
|-----------|-----|---------------|-------|
| formatPickupTime (7 tests) | F | VJ-R12 | AM/PM formatting |
| formatCutoffRemaining (9 tests) | F | VJ-R12 | Hours → human-readable |
| formatPickupDate (4 tests) | F | VJ-R12 | Today/Tomorrow/formatted |
| groupPickupDatesByMarket (8 tests) | F | VJ-R12 | Grouping/sorting logic |
| getPickupDateColor (2 tests) | F | — | Color palette cycling |

**Summary: 31/31 FUNCTIONAL. Created in Session 56.**

---

### 12. `db-constraints.integration.test.ts` (3 tests)

| Test Name | Cat | Business Rule | Notes |
|-----------|-----|---------------|-------|
| MP-R6: allows first payout | I | MP-R6 | Inserts real payout record |
| MP-R6: rejects duplicate payout | I | MP-R6 | Tests unique constraint |
| MP-R8: decrements inventory | I | MP-R8 | Tests atomic_decrement_inventory RPC |
| MP-R8: rejects negative inventory | I | MP-R8 | BUG documented — code uses GREATEST(0) instead of rejecting |

**Summary: 4/4 INTEGRATION. MP-R8 last test documents a known bug — test asserts correct business rule, code has bug.**

---

### 13. `order-lifecycle.integration.test.ts` (8 tests)

| Test Name | Cat | Business Rule | Notes |
|-----------|-----|---------------|-------|
| OL-R3: inventory decremented + restored | I | OL-R3 | Full cycle test |
| OL-R4: fulfilled item has payout record | I | OL-R4 | Soft assertion (if payout exists) |
| OL-R6: handed_off not in enum | I | OL-R6 | Queries DB enum, fallback to schema |
| OL-R10: only pending can be confirmed | I | OL-R10 | Tests status guard |
| OL-R12: CONFIRMATION_WINDOW_SECONDS = 30 | F | OL-R12 | Tests constant |
| IR-R10: PAYOUT_RETRY_MAX_DAYS = 7 | F | IR-R10 | Tests constant |
| IR-R27: Sentry files exist | SS | IR-R27 | File existence |
| IR-R28: Support files exist | SS | IR-R28 | File existence |

**Summary: 4 I, 2 F, 2 SS. Integration tests are solid. OL-R4 has soft assertion (if/else).**

---

### 14. `subscription-lifecycle.integration.test.ts` (16 tests)

| Test Name | Cat | Business Rule | Notes |
|-----------|-----|---------------|-------|
| SL-R1: RPC exists in database | I/SS | SL-R1 | Queries pg_catalog, falls back to schema read |
| SL-R5: unique index exists | I/N | SL-R5 | Falls back to `expect(true).toBe(true)` |
| SL-R6: market_box_pickups table exists | I | SL-R6 | Queries table |
| SL-R9: isExternalPayment/shouldCallStripeRefund | F | SL-R9 | Real function calls |
| SL-R10: schema has term_weeks | SW | SL-R10 | Reads schema file for keyword |
| SL-R12: offering route exists | SS | SL-R12 | File existence |
| SL-R16: STALE_CONFIRMATION_WINDOW_MS = 5min | F | SL-R16 | Tests constant |
| SL-R2: buildIdempotencyKey market-box | F | SL-R2 | Function call |
| SL-R3: buildIdempotencyKey refund | F | SL-R3 | Function call |
| SL-R7: subscriptions table has columns | I | SL-R7 | Queries table structure |
| SL-R8: pickups/subscriptions extension columns | I | SL-R8 | Queries table structure |
| SL-R11: duplicate sub prevented | N | SL-R11 | `expect(true).toBe(true)` — NOOP |
| SL-R13: market_box_offerings route exists | SS | SL-R13 | Directory existence |
| SL-R14: tier limits have activeMarketBoxes | F | SL-R14 | Tests property existence |
| SL-R15: tier limits have maxSubscribersPerOffering | F | SL-R15 | Tests property existence |

**Summary: 5 F, 4 I, 3 SS, 1 SW, 1 N. SL-R11 is a noop. SL-R5 falls back to noop.**

---

### 15. `business-rules-coverage.test.ts` (~130+ tests)

This is the master coverage index. Mix of:
- **~60 FUNCTIONAL** — calls real functions (pricing, timing, cancellation, tips, idempotency, polling, retention, quality checks, breadcrumbs, env validation)
- **~30 STATIC (weak)** — reads source files for keywords (cron phases, route content, notification keywords)
- **~15 STATIC (strong)** — verifies structural invariants (file existence, RPC call sites, function exports)
- **~25 META** — checks that other test files contain rule ID strings (e.g., `expect(content).toContain('SL-R1')`)

The meta-tests (checking another file contains a rule ID) are a coverage index pattern — they verify the RULE IS MENTIONED in a test file, but not that the rule is actually tested correctly.

---

### 16. `vendor-onboarding.test.ts` (14 tests)

| Test Name | Cat | Business Rule | Notes |
|-----------|-----|---------------|-------|
| VJ-R1: canPublishListings requires verification.status | SW | VJ-R1 | Keyword in route source |
| VJ-R1: requires allAuthorized | SW | VJ-R1 | Keyword check |
| VJ-R1: requires COI approved | SW | VJ-R1 | Keyword check |
| VJ-R1: requires Stripe payouts | SW | VJ-R1 | Keyword check |
| VJ-R1: publishing = approval + auth + Stripe, COI soft gate | SW | VJ-R1 | Multiple keyword checks |
| VJ-R1: grandfathered bypass | SW | VJ-R1 | Keyword check |
| VJ-R2: stripe_account_id/payouts checked | SW | VJ-R2 | Keyword check |
| VJ-R2: gate4 tracks stripe fields | SW | VJ-R2 | Keyword check |
| VJ-R5: trigger function in migration | SS | VJ-R5 | Migration content check |
| VJ-R7: signup validation schema exists | SS | VJ-R7 | File existence |
| VJ-R7: form enforces acknowledgments | SW | VJ-R7 | Searches for keywords in 3 files |
| VJ-R9: DB CHECK constraint in schema | SS | VJ-R9 | Schema keyword (constraint name) |
| VJ-R10: image-resize utility exists | SS | VJ-R10 | File existence |
| VJ-R12: listing detail uses RPC | SS | VJ-R12 | RPC name in source |
| VJ-R12: availability-status utility exists | SS | VJ-R12 | File existence |
| VJ-R12: browse imports availability-status | SS | VJ-R12 | Import verification |
| VJ-R13: paused in schema | SW | VJ-R13 | Keyword in schema file |

**Summary: 7 SS, 8 SW, 0 F. No functional tests. All onboarding gate checks are string-matching — would pass even if gates were inverted, removed, or reordered.**

---

### 17. `vertical-features.test.ts` (17 tests)

| Test Name | Cat | Business Rule | Notes |
|-----------|-----|---------------|-------|
| VI-R4: requires vertical parameter | SW | VI-R4 | Keyword in route |
| VI-R4: queries with .eq('vertical_id') | SW | VI-R4 | Keyword in route |
| VI-R4: filters expired events | SW | VI-R4 | Keyword in route |
| VI-R4: returns empty array on error | SW | VI-R4 | Keyword in route |
| VI-R10: food_trucks tipping enabled | F | VI-R10 | `isTippingEnabled('food_trucks')` |
| VI-R10: farmers_market tipping disabled | F | VI-R10 | `isTippingEnabled('farmers_market')` |
| VI-R10: fire_works tipping disabled | F | VI-R10 | `isTippingEnabled('fire_works')` |
| VI-R10: checkout only shows tip for FT | SW | VI-R10 | Keyword in checkout source |
| VI-R10: TipSelector presets | SW | VI-R10 | Keywords in component source |
| VI-R10: custom tip integer-only | SW | VI-R10 | Keywords in component source |
| VI-R11: preferred_pickup_time in schema | SW | VI-R11 | Schema keyword |
| VI-R11: time-slots utility exists | SS | VI-R11 | File existence |
| VI-R13: box_type in schema | SW | VI-R13 | Schema keyword |
| VI-R15: browse page queries vertical_id | SW | VI-R15 | Keyword in source |
| VI-R15: FT has FOOD_TRUCK_CATEGORIES | SW | VI-R15 | Keyword in source |
| VI-R14: DEFAULT_CUTOFF_HOURS defined + values | SW | VI-R14 | Keyword in constants file (could import constant directly) |
| NI-R37: REMINDER_DELAY_MS values | F | NI-R37 | Tests actual constants |
| NI-R37: isOrderOldEnoughForReminder | F | NI-R37 | Tests function behavior |

**Summary: 6 F, 1 SS, 10 SW.**

---

### 18. `integration/order-pricing-e2e.test.ts` (30 tests)

All FUNCTIONAL. Tests complete pricing scenarios, money conservation across multiple item combos, per-item vs order-level rounding, small order fees. Gold standard.

---

### 19. `integration/vendor-tier-limits.test.ts` (48 tests)

All FUNCTIONAL. Tests exact tier limit values, cross-vertical isolation, monotonic progression, tier extras, subscriber defaults. Gold standard.

---

### 20. `integration/vertical-isolation.test.ts` (25 tests)

| Test Name | Cat | Notes |
|-----------|-----|-------|
| VI-R8: term/hasTerminologyConfig (5 tests) | F | Real function calls |
| VI-R7: colors/CSS vars/shadows (9 tests) | F | Real function calls |
| VI-R6: branding isolation (5 tests) | F | Real lookups |
| VI-R9: buyer premium gating (2 tests) | F | `isBuyerPremiumEnabled()` |
| VI-R16: notification vertical scoping (5 tests) | F+SW | 1 functional (import test), 4 keyword checks |
| VI-R17: login vertical (3 tests) | SS+SW | File existence + keywords |
| VI-R18: vertical gate (5 tests) | F+SS | 1 functional, 4 structural |
| VI-R19: notification vertical storage (4 tests) | SW | All keyword checks |

**Summary: ~16 F, ~5 SS, ~8 SW.**

---

## Summary by File

| Test File | Total | F | I | SS | SW | M | N |
|-----------|-------|---|---|----|----|---|---|
| pricing.test.ts | 39 | 39 | — | — | — | — | — |
| errors.test.ts | 8 | 8 | — | — | — | — | — |
| vendor-limits.test.ts | 21 | 21 | — | — | — | — | — |
| vertical-config.test.ts | 12 | 12 | — | — | — | — | — |
| schedule-overlap.test.ts | 24 | 24 | — | — | — | — | — |
| infra-config.test.ts | 27 | — | — | 14 | 9 | — | — |
| order-cron-rules.test.ts | 19 | — | — | 1 | 18 | — | — |
| notification-types.test.ts | 52+ | 52+ | — | — | — | — | — |
| rate-limit.test.ts | 6 | 6 | — | — | — | — | — |
| availability-status.test.ts | 16 | 16 | — | — | — | — | — |
| pickup-formatters.test.ts | 31 | 31 | — | — | — | — | — |
| db-constraints.integration.test.ts | 4 | — | 4 | — | — | — | — |
| order-lifecycle.integration.test.ts | 8 | 2 | 4 | 2 | — | — | — |
| subscription-lifecycle.integration.test.ts | 16 | 5 | 4 | 3 | 1 | — | 2 |
| business-rules-coverage.test.ts | ~130 | ~60 | — | ~15 | ~30 | ~25 | — |
| vendor-onboarding.test.ts | 17 | — | — | 7 | 8 | — | — |
| vertical-features.test.ts | 17 | 6 | — | 1 | 10 | — | — |
| order-pricing-e2e.test.ts | 30 | 30 | — | — | — | — | — |
| vendor-tier-limits.test.ts | 48 | 48 | — | — | — | — | — |
| vertical-isolation.test.ts | 25 | ~16 | — | ~5 | ~8 | — | — |

## Overall Stats (approximate)

| Category | Count | % |
|----------|-------|---|
| Functional (F) | ~376 | ~70% |
| Integration (I) | ~12 | ~2% |
| Static Strong (SS) | ~48 | ~9% |
| Static Weak (SW) | ~84 | ~16% |
| Meta (M) | ~25 | ~3% |
| Noop (N) | ~2 | <1% |

## Key Findings

### Files that need functional test replacements (highest priority)
1. **`order-cron-rules.test.ts`** — 18/19 tests are static weak. Tests verify keywords exist in cron/reject routes but don't test if the logic works correctly.
2. **`vendor-onboarding.test.ts`** — 0/17 functional. All string-matching against onboarding route source. Would pass even if gates were inverted.
3. **`infra-config.test.ts`** — 0 functional, but ~14 strong static tests are legitimately structural (config presence). The ~9 weak static tests could be improved.
4. **`vertical-features.test.ts`** — 10/17 tests are weak static. The 6 functional tests (tipping, reminder timing) are good; the rest are keyword checks.

### Files that are already excellent
1. **`pricing.test.ts`** — 39/39 functional
2. **`notification-types.test.ts`** — 52+/52+ functional
3. **`order-pricing-e2e.test.ts`** — 30/30 functional
4. **`vendor-tier-limits.test.ts`** — 48/48 functional
5. **`schedule-overlap.test.ts`** — 24/24 functional
6. **`availability-status.test.ts`** — 16/16 functional (Session 56)
7. **`pickup-formatters.test.ts`** — 31/31 functional (Session 56)

### The meta-test pattern in business-rules-coverage.test.ts
~25 tests check that OTHER test files contain rule ID strings (e.g., `expect(content).toContain('SL-R1')`). This is a coverage index, not a correctness test. These are useful for tracking which rules have tests, but they don't validate behavior.
