# Current Task: Tip Rounding Fix + Platform Fee Tip Tracking (Session 40)
Started: 2026-02-20

## Goal
Fix two checkout issues reported during staging testing:
1. **$0.01 rounding discrepancy** between item prices and subtotal (per-item vs order-level rounding)
2. **Tip math doesn't match displayed subtotal** (tip was on base food price, but customer sees subtotal with buyer fee baked in)

Plus: Track the portion of tip attributable to the platform fee in a separate DB column for accounting.

## Key Decisions Made
- **Option A chosen**: Tip calculated on displayed subtotal (what customer sees), matching DoorDash/Uber Eats pattern
- **Vendor still gets tip on food cost only**: `vendorTip = tip_amount - tip_on_platform_fee_cents`
- **Platform fee tip tracked separately**: New `tip_on_platform_fee_cents` column on orders table
- **Rounding fix**: Display subtotal now uses per-item rounding (sum of `calculateItemDisplayPrice` per item × qty), matching Stripe line items
- **Tip label updated**: "100% of your tip goes directly to the vendor" → "Your tip goes directly to the vendor"

## What's Been Completed — ALL CODE CHANGES DONE
- [x] **Checkout page** (`src/app/[vertical]/checkout/page.tsx`):
  - Added `displaySubtotal` computed from per-item display prices (lines ~512-520)
  - Changed tip base from `baseSubtotal` to `displaySubtotal` (line ~522)
  - Changed total from `calculateBuyerPrice(baseSubtotal)` to `displaySubtotal + FEES.buyerFlatFeeCents + tipAmountCents`
  - Changed subtotal display from `formatPrice(total - FEES.buyerFlatFeeCents)` to `formatPrice(displaySubtotal)`
  - Updated tip label text
- [x] **Checkout session API** (`src/app/api/checkout/session/route.ts`):
  - Added `vendorTipCents` and `tipOnPlatformFeeCents` calculation after line 521
  - Added `tip_on_platform_fee_cents` to order insert
- [x] **DB migration** (`supabase/migrations/20260220_041_add_tip_on_platform_fee.sql`):
  - Adds `tip_on_platform_fee_cents INTEGER NOT NULL DEFAULT 0` to orders
  - Includes NOTIFY pgrst for schema cache reload
- [x] **Fulfill route** (`src/app/api/vendor/orders/[id]/fulfill/route.ts`):
  - Added `tip_on_platform_fee_cents` to order select
  - Changed tip distribution: `vendorTipCents = tip_amount - (tip_on_platform_fee_cents || 0)`
  - Then splits vendorTipCents across items (not full tip_amount)
- [x] **Confirm-handoff route** (`src/app/api/vendor/orders/[id]/confirm-handoff/route.ts`):
  - Same changes as fulfill route
- [x] **Tip-math module** (`src/lib/payments/tip-math.ts`):
  - Added `calculateVendorTip(tipAmount, tipOnPlatformFee)` helper
  - Added `calculatePlatformFeeTip(totalTip, baseSubtotal, tipPercentage)` helper
- [x] **Tests** (`src/lib/payments/__tests__/tip-math.test.ts`):
  - Added 11 new tests for `calculateVendorTip` and `calculatePlatformFeeTip`
  - All 45 tests pass (was 34)
- [x] **TSC passes clean**

## What's Remaining
- [ ] Commit these changes
- [ ] Push to staging for testing
- [ ] Migration 041 needs to be applied to Staging (and eventually Dev/Prod)
- [ ] Update SCHEMA_SNAPSHOT.md after migration confirmed applied

## Earlier in This Session (Already Committed)
Commit `48d913f` — "Post-demo bug fixes & UX improvements (8 items)" — pushed to staging.
- B1: ConfirmDialog replacing browser popups (5 dialogs across 3 files)
- U1: Buyer order status banners + FT expectation language
- U2: Vendor profile full address links + events in availability
- B2: Seed data Stripe gate fix
- U3: Markets page events below filters + location type dropdown
- D1: Lat/lng in vendor market suggestions
- D2: Input validation utilities
- P1: PickupScheduleGrid design token branding

## Files Modified (Uncommitted — Tip Fix)
- `src/app/[vertical]/checkout/page.tsx` — tip base + rounding + label
- `src/app/api/checkout/session/route.ts` — platform fee tip calculation + storage
- `src/app/api/vendor/orders/[id]/fulfill/route.ts` — vendor tip distribution
- `src/app/api/vendor/orders/[id]/confirm-handoff/route.ts` — vendor tip distribution
- `src/lib/payments/tip-math.ts` — new helper functions
- `src/lib/payments/__tests__/tip-math.test.ts` — 11 new tests
- `supabase/migrations/20260220_041_add_tip_on_platform_fee.sql` — new column

## Math Example (2 × $9 Dumpling Basket)
- Base food: $18.00 (1800 cents)
- Per-item display: round(900 × 1.065) = 959 cents ($9.59 each)
- Display subtotal: 959 × 2 = 1918 cents ($19.18) — matches item lines
- Service fee: $0.15
- Tip (10%): round(1918 × 10/100) = 192 cents ($1.92) — 10% of $19.18 ✓
- Total: 1918 + 15 + 192 = $21.25
- Vendor tip: round(1800 × 10/100) = 180 cents ($1.80)
- Platform fee tip: 192 - 180 = 12 cents ($0.12) → tracked in tip_on_platform_fee_cents

## Gotchas
- `calculateDisplayPrice` in constants.ts is aliased from `calculateItemDisplayPrice` in pricing.ts
- Stripe line items already use per-item rounding (line 581 of checkout/session/route.ts)
- DB `total_cents` still uses order-level rounding — may differ by $0.01 from display. Pre-existing issue, not introduced by this change.
- Tip cap ($50) handled correctly: `vendorTipCents = Math.min(validTipAmount, round(baseSubtotal * %/100))`
