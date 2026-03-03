# Current Task: Convert Category 1+2 .todo() Tests to Active Tests

Started: 2026-03-03 (Session 51)

## Goal
Convert .todo() placeholder tests to real 🟣V active tests where pure logic functions are already available. User emphasized accuracy — these protect real vendors' livelihoods and buyers' trust.

## What's Been Completed This Session
1. ✅ Cleaned test suite (removed unconfirmed rule IDs) — commit `6d915c8`
2. ✅ Added vitest to pre-commit hook — commit `6fe13c2`
3. ✅ Built per-vertical notification urgency (9 FT/FM overrides) — commit `c5615ec`
4. ✅ Cross-referenced all 159 rules with vitest indicators — commit `f889a23`
5. ✅ All 4 commits pushed to staging

## What's In Progress NOW
Converting .todo() tests to active assertions in `business-rules-coverage.test.ts`.

### Category 1: Tip rules (MP-R19-R28) — add explicit assertions
tip-math.test.ts has 25 tests covering R3/R4/R20/R21/R23/R24/R25/R28.
Currently lines 165-167 in business-rules-coverage.test.ts just say "// COVERED: tip-math.test.ts" with NO actual assertions or .todo() entries.
**Action**: Add explicit test assertions for each rule using the imported functions.
**Key**: MP-R19-R28 are COMMENTS not .todo(), so won't reduce the 61 todo count, but adds 🟣V coverage.

### Category 2: Pure logic convertible .todo() items
These ARE .todo() entries that can become real tests:

| Rule | What to test | How |
|------|-------------|-----|
| VI-R14 | Cutoff hours per vertical | `DEFAULT_CUTOFF_HOURS` from `@/lib/constants` — exported! Values: traditional=18, private_pickup=10, food_trucks=0, event=24 |
| VI-R1 | Valid vertical slugs | VALID_VERTICALS in middleware.ts is NOT exported. Can hardcode expected values and test conceptually |

### Source files already read (DO NOT re-read):
- `tip-math.ts` — 3 pure functions: calculateTipShare, calculateVendorTip, calculatePlatformFeeTip
- `cancellation-fees.ts` — exports CANCELLATION_FEE_PERCENT=25, GRACE_PERIOD_BY_VERTICAL, getGracePeriodMs
- `constants.ts` — exports DEFAULT_CUTOFF_HOURS
- `middleware.ts` — VALID_VERTICALS = Set(['farmers_market','food_trucks','fire_works']) — NOT exported
- `pricing.ts`, `vendor-fees.ts`, `vendor-limits.ts` — already imported in test file
- `business-rules-coverage.test.ts` — full file read, 440 lines

### Idempotency key patterns verified by grep (MP-R7):
- Checkout: `checkout-${orderId}`
- Transfer: `transfer-${orderId}-${orderItemId}`
- Market box: `market-box-${offeringId}-${userId}-${startDate}`
- MB transfer: `transfer-mb-sub-${subscriptionId}`
- Refund: `refund-${paymentIntentId}-${amount ?? 'full'}`
- All deterministic (no Date.now(), no random values)

### Tip cap (MP-R21):
- MAX_TIP_CENTS = 5000 — inline in checkout/session/route.ts line 71, NOT exported
- Can test min() behavior in calculatePlatformFeeTip but not the cap constant itself

## Exact Edits to Make in business-rules-coverage.test.ts

### 1. Add imports (after existing imports ~line 57):
```typescript
import { calculateTipShare, calculateVendorTip, calculatePlatformFeeTip } from '@/lib/payments/tip-math'
import { DEFAULT_CUTOFF_HOURS } from '@/lib/constants'
```

### 2. Replace MP-R19-R28 comment block (lines 165-167) with real assertions:
- MP-R20: calculatePlatformFeeTip(192, 1800, 10) = 12 (proves tip on displayed, not base)
- MP-R21: Tip cap — calculatePlatformFeeTip(5000, 100000, 10) = 0 (min() caps vendor portion)
- MP-R22: Math.round behavior — can't test directly (inline in route), document as code-verified
- MP-R23: vendorTip = min(totalTip, round(base×%/100)) — tested via calculatePlatformFeeTip
- MP-R24: platformFeeTip = totalTip - vendorTip — calculatePlatformFeeTip returns this
- MP-R25: calculateTipShare(500, 2) = 250 (even split), calculateTipShare(100, 3) = 33 (rounds)
- MP-R28: All payout paths use same calculateTipShare function — deterministic

### 3. Convert VI-R14 .todo() to real test:
Import DEFAULT_CUTOFF_HOURS, assert: traditional=18, private_pickup=10, food_trucks=0, event=24

### 4. Convert VI-R1 conceptually:
Can't import VALID_VERTICALS but can document the expected values match middleware

## What's Remaining After Code Changes
1. Run vitest to confirm all pass
2. Update business_rules_audit_and_testing.md — change indicators from 📋T to 🟣V for converted rules
3. Commit + push to staging

## Git State
- Branch: main, 5 commits ahead of origin/main
- Staging: synced through f889a23
- Latest commit: f889a23 (business rules vitest cross-reference)
- Vitest: 329 passing, 61 todo, 0 failures
