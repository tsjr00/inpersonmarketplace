# Business Rules Document

**Generated:** 2026-03-14 (Session 57, Phase 2)
**Source:** Extracted from production code — NOT from tests or documentation.
**Purpose:** Authoritative reference for writing functional tests. Each rule is a testable assertion with source location.

---

## A. Pricing & Fees

### Core Fee Structure

**PF-001:** Buyer fee percentage is 6.5% of food subtotal.
  Source: `src/lib/pricing.ts:15` (`FEES.buyerFeePercent: 6.5`)
  Test type: Unit — assert `FEES.buyerFeePercent === 6.5`

**PF-002:** Vendor fee percentage is 6.5% of food subtotal.
  Source: `src/lib/pricing.ts:16` (`FEES.vendorFeePercent: 6.5`)
  Test type: Unit — assert `FEES.vendorFeePercent === 6.5`

**PF-003:** Buyer flat fee is $0.15 per ORDER (not per item).
  Source: `src/lib/pricing.ts:17` (`FEES.buyerFlatFeeCents: 15`)
  Test type: Unit — assert `FEES.buyerFlatFeeCents === 15`

**PF-004:** Vendor flat fee deduction is $0.15 per ORDER.
  Source: `src/lib/pricing.ts:18` (`FEES.vendorFlatFeeCents: 15`)
  Test type: Unit — assert `FEES.vendorFlatFeeCents === 15`

**PF-005:** Platform keeps 13% + $0.30 per order (buyer 6.5%+$0.15 + vendor 6.5%+$0.15).
  Source: `src/lib/pricing.ts:10`, `:132`
  Test type: Unit — `calculateOrderPricing()` → assert `platformFeeCents === buyerPercentFee + buyerFlat + vendorPercentFee + vendorFlat`

### Buyer Price Calculations

**PF-006:** `calculateBuyerPrice(subtotalCents)` = `Math.round(subtotal × 1.065) + 15`.
  Source: `src/lib/pricing.ts:155`
  Test type: Unit — e.g., `calculateBuyerPrice(1000)` → `Math.round(1065) + 15 = 1080`

**PF-007:** `calculateItemDisplayPrice(baseCents)` = `Math.round(base × 1.065)` — NO flat fee.
  Source: `src/lib/pricing.ts:167`
  Test type: Unit — e.g., `calculateItemDisplayPrice(1000)` → `1065`, `calculateItemDisplayPrice(900)` → `959`

**PF-008:** Per-item display price uses individual rounding, NOT order-level. Two items at $9.00 base: per-item = 959 each = 1918, vs order-level = round(1800×1.065) = 1917.
  Source: `src/lib/pricing.ts:167` (per-item) vs `:155` (order-level)
  Test type: Unit — verify divergence between `calculateItemDisplayPrice(900)*2` vs `calculateBuyerPrice(1800) - 15`

### Vendor Payout Calculations

**PF-009:** `calculateVendorPayout(baseCents)` = `Math.round(base × 0.935) - 15`.
  Source: `src/lib/pricing.ts:177`
  Test type: Unit — e.g., `calculateVendorPayout(1000)` → `Math.round(935) - 15 = 920`

### Order Pricing (Multi-Item)

**PF-010:** `calculateOrderPricing(items)` subtotal = sum of (price_cents × quantity) for all items.
  Source: `src/lib/pricing.ts:116-119`
  Test type: Unit

**PF-011:** Order buyer total = subtotal + round(subtotal × 0.065) + 15.
  Source: `src/lib/pricing.ts:124`
  Test type: Unit

**PF-012:** Order vendor payout = subtotal - round(subtotal × 0.065) - 15.
  Source: `src/lib/pricing.ts:129`
  Test type: Unit

### Flat Fee Proration

**PF-013:** `proratedFlatFee(fee, N, index)` — items 0..N-2 get `floor(fee/N)`, last item gets remainder. Sum always equals `fee` exactly.
  Source: `src/lib/pricing.ts:192-201`
  Test type: Unit — e.g., `proratedFlatFee(15, 2, 0)` → 7, `proratedFlatFee(15, 2, 1)` → 8 (7+8=15 ✓)

**PF-014:** `proratedFlatFee` with totalItems ≤ 0 returns 0. With totalItems = 1 returns full fee.
  Source: `src/lib/pricing.ts:193-194`
  Test type: Unit

**PF-015:** `proratedFlatFeeSimple(fee, N)` returns `floor(fee/N)`. Deprecated — caller handles remainder.
  Source: `src/lib/pricing.ts:210-213`
  Test type: Unit

### Small Order Fees

**PF-016:** FM small order threshold = $10.00, fee = $1.00.
  Source: `src/lib/pricing.ts:43` (`farmers_market: { thresholdCents: 1000, feeCents: 100 }`)
  Test type: Unit — `getSmallOrderFeeConfig('farmers_market')` → `{ thresholdCents: 1000, feeCents: 100 }`

**PF-017:** FT small order threshold = $5.00, fee = $0.50.
  Source: `src/lib/pricing.ts:44` (`food_trucks: { thresholdCents: 500, feeCents: 50 }`)
  Test type: Unit

**PF-018:** FW small order threshold = $40.00, fee = $4.00.
  Source: `src/lib/pricing.ts:45` (`fire_works: { thresholdCents: 4000, feeCents: 400 }`)
  Test type: Unit

**PF-019:** Default small order config (unknown vertical) = $10.00 threshold, $1.00 fee.
  Source: `src/lib/pricing.ts:48`
  Test type: Unit — `getSmallOrderFeeConfig('unknown')` → `{ thresholdCents: 1000, feeCents: 100 }`

**PF-020:** Small order fee comparison uses DISPLAYED subtotal (base + 6.5%), not base subtotal.
  Source: `src/lib/pricing.ts:74` (`displaySubtotalCents = Math.round(subtotalCents * 1.065)`)
  Test type: Unit — e.g., base $4.69 (469¢) → displayed = round(469 × 1.065) = 499¢ < 500¢ threshold → fee applies for FT

**PF-021:** `calculateSmallOrderFee` returns feeCents when below threshold, 0 when at or above.
  Source: `src/lib/pricing.ts:75`
  Test type: Unit — boundary test at exact threshold

**PF-022:** `amountToAvoidSmallOrderFee` returns displayed gap to reach threshold, or 0 if already above.
  Source: `src/lib/pricing.ts:244-248`
  Test type: Unit

### Subscription Pricing

**PF-023:** FM Standard = $10/month ($81.50/year). FM Premium = $25/month ($208.15/year). FM Featured = $50/month ($481.50/year).
  Source: `src/lib/pricing.ts:24-29`
  Test type: Unit — assert `SUBSCRIPTION_AMOUNTS` values

**PF-024:** FT Basic = $10/month ($81.50/year). FT Pro = $25/month ($208.15/year). FT Boss = $50/month ($481.50/year).
  Source: `src/lib/pricing.ts:30-35`
  Test type: Unit — assert `SUBSCRIPTION_AMOUNTS` values

**PF-025:** Buyer Premium = $9.99/month ($81.50/year).
  Source: `src/lib/pricing.ts:36-37`
  Test type: Unit

### Formatting

**PF-026:** `formatPrice(cents)` returns `"$X.XX"` with two decimal places.
  Source: `src/lib/pricing.ts:222`
  Test type: Unit — `formatPrice(1234)` → `"$12.34"`, `formatPrice(0)` → `"$0.00"`

**PF-027:** `formatDisplayPrice(baseCents)` = `formatPrice(calculateItemDisplayPrice(baseCents))`.
  Source: `src/lib/pricing.ts:233`
  Test type: Unit

---

## B. Cancellation & Refunds

### Grace Periods

**CX-001:** FM cancellation grace period = 1 hour (3,600,000 ms).
  Source: `src/lib/payments/cancellation-fees.ts:17`
  Test type: Unit — `getGracePeriodMs('farmers_market')` → `3600000`

**CX-002:** FT cancellation grace period = 15 minutes (900,000 ms).
  Source: `src/lib/payments/cancellation-fees.ts:18`
  Test type: Unit — `getGracePeriodMs('food_trucks')` → `900000`

**CX-003:** FW cancellation grace period = 1 hour (same as FM).
  Source: `src/lib/payments/cancellation-fees.ts:19`
  Test type: Unit — `getGracePeriodMs('fire_works')` → `3600000`

**CX-004:** Default grace period (unknown vertical) = 1 hour.
  Source: `src/lib/payments/cancellation-fees.ts:23`
  Test type: Unit — `getGracePeriodMs('unknown')` → `3600000`

### Cancellation Fee Calculation (3-Layer Logic)

**CX-005:** Layer 1 — Within grace period → full refund, $0 fee, regardless of order status.
  Source: `src/lib/payments/cancellation-fees.ts:78-88`
  Test type: Unit — call `calculateCancellationFee()` with `now` < `orderCreatedAt + gracePeriod`

**CX-006:** Layer 2 — After grace period AND vendor has confirmed (status in `confirmed`, `ready`, `fulfilled`) → 25% cancellation fee.
  Source: `src/lib/payments/cancellation-fees.ts:76, :92`
  Test type: Unit — verify `cancellationFeeCents > 0` and `feeApplied === true`

**CX-007:** Layer 3 — After grace period but vendor has NOT confirmed → full refund, $0 fee.
  Source: `src/lib/payments/cancellation-fees.ts:78` (the `!vendorHadConfirmed` branch)
  Test type: Unit — status = 'pending', past grace → full refund

**CX-008:** Cancellation fee = 25% of what buyer paid for the item.
  Source: `src/lib/payments/cancellation-fees.ts:12` (`CANCELLATION_FEE_PERCENT = 25`)
  Test type: Unit — assert constant AND verify in calculation output

**CX-009:** "What buyer paid" = subtotal + round(subtotal × buyerFeePercent/100) + proratedFlatFee.
  Source: `src/lib/payments/cancellation-fees.ts:68-70`
  Test type: Unit — verify `buyerPaidForItem` calculation

**CX-010:** Refund amount = `round(buyerPaid × 0.75)` (i.e., 75% of buyer paid).
  Source: `src/lib/payments/cancellation-fees.ts:92`
  Test type: Unit

**CX-011:** Cancellation fee = `buyerPaid - refundAmount` (NOT `round(buyerPaid × 0.25)`).
  Source: `src/lib/payments/cancellation-fees.ts:93`
  Test type: Unit — ensures rounding is consistent (fee + refund = buyerPaid exactly)

**CX-012:** Fee split — platform gets `round(fee × applicationFeePercent/100)`, vendor gets `fee - platformShare`.
  Source: `src/lib/payments/cancellation-fees.ts:94-95`
  Test type: Unit — verify vendor + platform shares sum to total fee

**CX-013:** Vendor confirmation statuses = `['confirmed', 'ready', 'fulfilled']`.
  Source: `src/lib/payments/cancellation-fees.ts:76`
  Test type: Unit — test with each status

### Cancellation uses proration

**CX-014:** Cancellation flat fee proration uses `proratedFlatFeeSimple` (floor-based), not `proratedFlatFee` (index-based).
  Source: `src/lib/payments/cancellation-fees.ts:68`
  Test type: Unit — for 2-item order, flat fee per item = floor(15/2) = 7 (not 8)

---

## B2. External Payment Fees (Vendor Fees)

### Fee Rates

**VF-001:** External payment seller fee = 3.5%.
  Source: `src/lib/payments/vendor-fees.ts:15` (`SELLER_FEE_PERCENT = 3.5`)
  Test type: Unit

**VF-002:** External payment buyer fee = 6.5% only (NO flat fee — `EXTERNAL_BUYER_FEE_FIXED_CENTS = 0`).
  Source: `src/lib/payments/vendor-fees.ts:14`
  Test type: Unit — `calculateExternalBuyerFee(1000)` → `65` (no +15)

**VF-003:** Stripe buyer fee = 6.5% + $0.15.
  Source: `src/lib/payments/vendor-fees.ts:29-31`
  Test type: Unit — `calculateBuyerFee(1000)` → `65 + 15 = 80`

**VF-004:** Total external fee = external buyer fee + seller fee = 6.5% + 3.5% = 10%.
  Source: `src/lib/payments/vendor-fees.ts:57-59`
  Test type: Unit — `calculateTotalExternalFee(1000)` → `65 + 35 = 100`

**VF-005:** External payment total (buyer pays) = subtotal + external buyer fee (6.5%).
  Source: `src/lib/payments/vendor-fees.ts:66-68`
  Test type: Unit — `calculateExternalPaymentTotal(1000)` → `1065`

### Auto-Deduction

**VF-006:** Auto-deduction cap = 50% of vendor payout.
  Source: `src/lib/payments/vendor-fees.ts:22` (`AUTO_DEDUCT_MAX_PERCENT = 50`)
  Test type: Unit

**VF-007:** `calculateAutoDeductAmount(payout, owed)` = `min(owed, floor(payout × 0.50))`.
  Source: `src/lib/payments/vendor-fees.ts:186-196`
  Test type: Unit — if payout=1000, owed=600 → min(600, 500) = 500

**VF-008:** If owed ≤ 0, auto-deduct = 0.
  Source: `src/lib/payments/vendor-fees.ts:190-192`
  Test type: Unit

### Invoice Thresholds

**VF-009:** Balance invoice threshold = $50.00 (5000 cents).
  Source: `src/lib/payments/vendor-fees.ts:18`
  Test type: Unit

**VF-010:** Age invoice threshold = 40 days.
  Source: `src/lib/payments/vendor-fees.ts:19`
  Test type: Unit

**VF-011:** Vendor requires payment when balance ≥ $50 OR oldest unpaid ≥ 40 days.
  Source: `src/lib/payments/vendor-fees.ts:103-105` (in `getVendorFeeBalance`)
  Test type: Integration (needs DB)

**VF-012:** External payments blocked when balance ≥ $50 OR oldest unpaid ≥ 40 days.
  Source: `src/lib/payments/vendor-fees.ts:266-280` (in `canUseExternalPayments`)
  Test type: Integration (needs DB)

**VF-013:** External payments require Stripe account connected.
  Source: `src/lib/payments/vendor-fees.ts:259`
  Test type: Integration (needs DB)

---

## B3. Tip Calculations

**TIP-001:** `calculateTipShare(tipAmount, totalItems)` = `Math.round(tip / items)`.
  Source: `src/lib/payments/tip-math.ts:22`
  Test type: Unit — `calculateTipShare(100, 3)` → `33` (round(33.33))

**TIP-002:** Tip share with null/0/negative tip → 0.
  Source: `src/lib/payments/tip-math.ts:20`
  Test type: Unit

**TIP-003:** Tip share with null/0/negative items → 0.
  Source: `src/lib/payments/tip-math.ts:21`
  Test type: Unit

**TIP-004:** `calculateVendorTip(tip, platformFeeTip)` = `tip - platformFeeTip`.
  Source: `src/lib/payments/tip-math.ts:37`
  Test type: Unit

**TIP-005:** Vendor tip with null/0 tip → 0.
  Source: `src/lib/payments/tip-math.ts:36`
  Test type: Unit

**TIP-006:** `calculatePlatformFeeTip(totalTip, baseSubtotal, tipPercent)` = `totalTip - min(totalTip, round(base × pct/100))`.
  Source: `src/lib/payments/tip-math.ts:57-58`
  Test type: Unit — e.g., displaySubtotal=1065, base=1000, 10% tip: totalTip=107 (round(1065×0.10)), vendorTip=min(107, round(1000×0.10))=100, platformFeeTip=107-100=7

**TIP-007:** Platform fee tip with ≤0 tip or ≤0 percentage → 0.
  Source: `src/lib/payments/tip-math.ts:56`
  Test type: Unit

---

## C. Order Lifecycle

### Order Status Machine

**OL-001:** Active order statuses = `['pending', 'paid', 'completed', 'cancelled', 'refunded']`.
  Source: `src/lib/orders/status-transitions.ts:20`
  Test type: Unit — assert `ORDER_STATUSES_ACTIVE` contents

**OL-002:** Unused order statuses (in DB enum but never set by code) = `['confirmed', 'ready']`.
  Source: `src/lib/orders/status-transitions.ts:28`
  Test type: Unit — assert `ORDER_STATUSES_UNUSED` contents

**OL-003:** Valid order transitions:
  - `pending` → `paid`, `cancelled`, `refunded`
  - `paid` → `completed`, `cancelled`, `refunded`
  - `completed` → `refunded` (only via charge.refunded webhook)
  - `cancelled` → `refunded` (after Stripe refund processes)
  - `refunded` → (terminal, no transitions)
  Source: `src/lib/orders/status-transitions.ts:53-59`
  Test type: Unit — `isValidOrderTransition(from, to)` for each valid/invalid pair

**OL-004:** `refunded` is the only terminal order status.
  Source: `src/lib/orders/status-transitions.ts:98`
  Test type: Unit — assert `ORDER_TERMINAL_STATUSES` = `['refunded']`

### Item Status Machine

**OL-005:** Item statuses = `['pending', 'confirmed', 'ready', 'fulfilled', 'cancelled', 'refunded']`.
  Source: `src/lib/orders/status-transitions.ts:32`
  Test type: Unit — assert `ITEM_STATUSES` contents

**OL-006:** Valid item transitions:
  - `pending` → `confirmed`, `ready`, `cancelled`, `refunded`
  - `confirmed` → `ready`, `fulfilled`, `cancelled`, `refunded`
  - `ready` → `fulfilled`, `cancelled`, `refunded`
  - `fulfilled` → (terminal)
  - `cancelled` → `refunded`
  - `refunded` → (terminal)
  Source: `src/lib/orders/status-transitions.ts:88-95`
  Test type: Unit — `isValidItemTransition(from, to)` for each valid/invalid pair

**OL-007:** `fulfilled` and `refunded` are terminal item statuses.
  Source: `src/lib/orders/status-transitions.ts:101`
  Test type: Unit — assert `ITEM_TERMINAL_STATUSES` = `['fulfilled', 'refunded']`

**OL-008:** Same-status transition (e.g., `pending` → `pending`) is always invalid.
  Source: `src/lib/orders/status-transitions.ts:108, :117`
  Test type: Unit — `isValidOrderTransition('pending', 'pending')` → `false`

### Checkout Helpers

**OL-009:** External payment methods = `['venmo', 'cashapp', 'paypal', 'cash']`.
  Source: `src/lib/orders/checkout-helpers.ts:15`
  Test type: Unit — assert `EXTERNAL_PAYMENT_METHODS` contents

**OL-010:** Tipping is enabled ONLY for `food_trucks` vertical.
  Source: `src/lib/orders/checkout-helpers.ts:53`
  Test type: Unit — `isTippingEnabled('food_trucks')` → `true`, all others → `false`

**OL-011:** `isExternalPayment(method)` returns true for venmo/cashapp/paypal/cash.
  Source: `src/lib/orders/checkout-helpers.ts:61`
  Test type: Unit

**OL-012:** `shouldCallStripeRefund(method)` returns false for external payment methods.
  Source: `src/lib/orders/checkout-helpers.ts:68-70`
  Test type: Unit — Stripe refund NOT called for external payments

**OL-013:** Idempotency key formats are deterministic (no random/timestamp components):
  - checkout: `checkout-{orderId}`
  - transfer: `transfer-{orderId}-{orderItemId}`
  - market-box: `market-box-{offeringId}-{userId}-{startDate}`
  - transfer-mb-sub: `transfer-mb-sub-{subscriptionId}`
  - refund: `refund-{paymentIntentId}-{amount|full}`
  Source: `src/lib/orders/checkout-helpers.ts:28-46`
  Test type: Unit — call `buildIdempotencyKey` with params, assert format

---

## D. Availability & Cutoffs

### Availability Badge Derivation

**AV-001:** `deriveAvailabilityStatus(undefined)` → `{ status: 'closed', hoursUntilCutoff: null }`.
  Source: `src/lib/utils/availability-status.ts:26-27`
  Test type: Unit

**AV-002:** `deriveAvailabilityStatus({ is_accepting: false, ... })` → `closed`.
  Source: `src/lib/utils/availability-status.ts:26`
  Test type: Unit

**AV-003:** `is_accepting: true` AND `hours_until_cutoff ≤ cutoff_hours` AND `hours_until_cutoff > 0` → `closing-soon`.
  Source: `src/lib/utils/availability-status.ts:29-31`
  Test type: Unit

**AV-004:** `closing-soon` status rounds `hoursUntilCutoff` to 1 decimal place.
  Source: `src/lib/utils/availability-status.ts:31` (`Math.round(hours * 10) / 10`)
  Test type: Unit — e.g., 2.345 → 2.3

**AV-005:** `is_accepting: true` but NOT in cutoff window → `open`.
  Source: `src/lib/utils/availability-status.ts:33`
  Test type: Unit

**AV-006:** Vendor listing page: non-published listings always return `open` (no badge).
  Source: `src/lib/utils/availability-status.ts:42-44`
  Test type: Unit — `deriveVendorAvailabilityStatus(avail, 'draft')` → `{ status: 'open' }`

### Default Cutoff Hours

**AV-007:** Traditional market cutoff = 18 hours before market opens.
  Source: `src/lib/constants.ts:30`
  Test type: Unit — assert `DEFAULT_CUTOFF_HOURS.traditional === 18`

**AV-008:** Private pickup cutoff = 10 hours before window.
  Source: `src/lib/constants.ts:31`
  Test type: Unit — assert `DEFAULT_CUTOFF_HOURS.private_pickup === 10`

**AV-009:** Food trucks cutoff = 0 (no advance cutoff — order any time).
  Source: `src/lib/constants.ts:32`
  Test type: Unit — assert `DEFAULT_CUTOFF_HOURS.food_trucks === 0`

**AV-010:** Event cutoff = 24 hours before event starts.
  Source: `src/lib/constants.ts:33`
  Test type: Unit — assert `DEFAULT_CUTOFF_HOURS.event === 24`

---

## E. Vendor Tiers & Limits

### FM Tier Limits

**VT-001:** FM free tier: 5 listings, 1 traditional market, 1 private pickup, 2 total market boxes, 1 active box, 5 max subscribers, 0 analytics days.
  Source: `src/lib/vendor-limits.ts:18-30`
  Test type: Unit — `getTierLimits('free')` → assert each field

**VT-002:** FM standard tier: 10 listings, 2 traditional markets, 2 private pickups, 3 total boxes, 2 active boxes, 10 max subscribers, 30 analytics days.
  Source: `src/lib/vendor-limits.ts:31-43`
  Test type: Unit — `getTierLimits('standard')`

**VT-003:** FM premium tier: 20 listings, 3 traditional markets, 3 private pickups, 6 total boxes, 4 active boxes, 20 max subscribers, 60 analytics days.
  Source: `src/lib/vendor-limits.ts:44-56`
  Test type: Unit — `getTierLimits('premium')`

**VT-004:** FM featured tier: 30 listings, 5 traditional markets, 5 private pickups, 10 total boxes, 8 active boxes, 30 max subscribers, 90 analytics days, analytics export enabled.
  Source: `src/lib/vendor-limits.ts:57-69`
  Test type: Unit — `getTierLimits('featured')`

### FT Tier Limits

**VT-005:** FT free tier: 5 listings, 1 traditional market, 2 private pickups, 0 market boxes, 0 active boxes, 0 max subscribers, 0 analytics days, no priority placement.
  Source: `src/lib/vendor-limits.ts:82-96`
  Test type: Unit — `getTierLimits('free', 'food_trucks')`

**VT-006:** FT basic tier: 10 listings, 3 traditional markets, 3 private pickups, 2 market boxes, 2 active boxes, 10 max subscribers, 30 analytics days, no priority placement, basic location insights.
  Source: `src/lib/vendor-limits.ts:97-111`
  Test type: Unit — `getTierLimits('basic', 'food_trucks')`

**VT-007:** FT pro tier: 20 listings, 5 traditional markets, 5 private pickups, 4 market boxes, 4 active boxes, 20 max subscribers, 60 analytics days, 2nd priority placement, pro location insights.
  Source: `src/lib/vendor-limits.ts:112-126`
  Test type: Unit — `getTierLimits('pro', 'food_trucks')`

**VT-008:** FT boss tier: 45 listings, 8 traditional markets, 15 private pickups, 8 market boxes, 8 active boxes, 50 max subscribers, 90 analytics days, 1st priority placement, boss location insights, analytics export enabled.
  Source: `src/lib/vendor-limits.ts:127-141`
  Test type: Unit — `getTierLimits('boss', 'food_trucks')`

### Tier Classification

**VT-009:** `isFoodTruckTier(tier)` returns true for `free`, `basic`, `pro`, `boss` (case-insensitive).
  Source: `src/lib/vendor-limits.ts:147-149`
  Test type: Unit

**VT-010:** `isPremiumTier` for FM: `premium` and `featured` return true. `free` and `standard` return false.
  Source: `src/lib/vendor-limits.ts:229-237`
  Test type: Unit

**VT-011:** `isPremiumTier` for FT: `pro` and `boss` return true. `free` and `basic` return false.
  Source: `src/lib/vendor-limits.ts:232-233`
  Test type: Unit

### Tier Sort Priority

**VT-012:** FM sort order: featured=0, premium=1, standard=2, free=3.
  Source: `src/lib/vendor-limits.ts:201-204`
  Test type: Unit — `getTierSortPriority('featured', 'farmers_market')` → 0

**VT-013:** FT sort order: boss=0, pro=1, basic=2, free=3.
  Source: `src/lib/vendor-limits.ts:194-198`
  Test type: Unit — `getTierSortPriority('boss', 'food_trucks')` → 0

### Notification Channels per Tier

**VT-014:** FM free: in_app only. FM standard: in_app + email. FM premium: in_app + email + push. FM featured: in_app + email + push + sms.
  Source: `src/lib/vendor-limits.ts:29, :42, :55, :68`
  Test type: Unit — `getTierNotificationChannels('free')` etc.

**VT-015:** FT free: in_app only. FT basic: in_app + email. FT pro: in_app + email + push. FT boss: in_app + email + push + sms.
  Source: `src/lib/vendor-limits.ts:94, :109, :124, :139`
  Test type: Unit

### Vertical Fallback

**VT-016:** FT vendor with unknown tier (e.g., 'standard') → gets FT free limits.
  Source: `src/lib/vendor-limits.ts:222`
  Test type: Unit — `getTierLimits('standard', 'food_trucks')` returns FT free values

**VT-017:** FM vendor with unknown tier → gets FM free limits.
  Source: `src/lib/vendor-limits.ts:226`
  Test type: Unit — `getTierLimits('unknown')` returns FM free values

---

## F. Inventory

**INV-001:** `atomic_decrement_inventory` RPC uses `GREATEST(0, qty - n)` — clamps to 0, does NOT reject oversell.
  Source: Supabase RPC (migration applied)
  Test type: Integration — call RPC with quantity > stock, verify stock = 0
  **NOTE:** Business rule MP-R8 says "quantity never goes negative." The RPC implements clamping, not rejection. This is a known conflict (Session 55 audit). Test should assert the RPC behavior, but the conflict is documented.

---

## G. Notifications

### Urgency Tiers

**NI-001:** `immediate` urgency → channels: `push` + `in_app`.
  Source: `src/lib/notifications/types.ts:25`
  Test type: Unit — assert `URGENCY_CHANNELS.immediate`

**NI-002:** `urgent` urgency → channels: `sms` + `in_app`.
  Source: `src/lib/notifications/types.ts:26`
  Test type: Unit

**NI-003:** `standard` urgency → channels: `email` + `in_app`.
  Source: `src/lib/notifications/types.ts:27`
  Test type: Unit

**NI-004:** `info` urgency → channels: `email` only.
  Source: `src/lib/notifications/types.ts:28`
  Test type: Unit

### Per-Type Urgency & Audience (selected key types)

**NI-005:** `order_ready` — urgency: `immediate`, audience: `buyer`.
  Source: `src/lib/notifications/types.ts:168-169`
  Test type: Unit

**NI-006:** `order_cancelled_by_vendor` — urgency: `immediate`, severity: `critical`, audience: `buyer`.
  Source: `src/lib/notifications/types.ts:186-188`
  Test type: Unit

**NI-007:** `new_paid_order` — urgency: `immediate`, audience: `vendor`.
  Source: `src/lib/notifications/types.ts:260-262`
  Test type: Unit

**NI-008:** `payout_failed` — urgency: `urgent`, severity: `critical`, audience: `vendor`.
  Source: `src/lib/notifications/types.ts:377-379`
  Test type: Unit

**NI-009:** `charge_dispute_created` — urgency: `urgent`, severity: `critical`, audience: `admin`.
  Source: `src/lib/notifications/types.ts:513-515`
  Test type: Unit

### Per-Vertical Urgency Overrides (NI-R19 through NI-R27)

**NI-010:** `order_ready` for FM → override to `standard` (default is `immediate` for FT).
  Source: `src/lib/notifications/types.ts:603`
  Test type: Unit — `getNotificationUrgency('order_ready', 'farmers_market')` → `'standard'`

**NI-011:** `order_cancelled_by_vendor` for FM → override to `urgent`.
  Source: `src/lib/notifications/types.ts:605`
  Test type: Unit

**NI-012:** `new_paid_order` for FM → override to `standard` (FT default is `immediate`).
  Source: `src/lib/notifications/types.ts:609`
  Test type: Unit

**NI-013:** `getNotificationUrgency(type, undefined)` returns registry default (FT-level).
  Source: `src/lib/notifications/types.ts:645-646`
  Test type: Unit — no vertical → uses base urgency

### Notification Type Count

**NI-014:** Total registered notification types = 46 (12 buyer + 18 vendor + 7 trial + 3 admin + 6 catering/event).
  Source: `src/lib/notifications/types.ts:33-84` (NotificationType union) + registry lines 149-574
  Test type: Unit — `Object.keys(NOTIFICATION_REGISTRY).length === 46`

---

## H. Vendor Onboarding

**OB-001:** Gate 1 — Business docs must be uploaded and status approved by admin.
  Source: `src/app/api/vendor/onboarding/status/route.ts:74-81`
  Test type: Integration (needs DB)

**OB-002:** Gate 2 — All required category/permit docs must be uploaded and approved.
  Source: `src/app/api/vendor/onboarding/status/route.ts:84-157`
  Test type: Integration (needs DB)

**OB-003:** Gate 3 — COI (Certificate of Insurance) is a soft gate: NOT required for publishing, required for event approval.
  Source: `src/app/api/vendor/onboarding/status/route.ts:216` (comment: "COI is a soft gate")
  Test type: Integration

**OB-004:** Gate 4 — Stripe account connected AND payouts enabled.
  Source: `src/app/api/vendor/onboarding/status/route.ts:209-213`
  Test type: Integration

**OB-005:** `canPublishListings` requires: (1) verification.status === 'approved', (2) all permits/categories approved, (3) Stripe payouts enabled, (4) partner agreement accepted OR grandfathered.
  Source: `src/app/api/vendor/onboarding/status/route.ts:217-221`
  Test type: Integration

**OB-006:** `canSubmitForApproval` requires: (1) business docs uploaded, (2) prohibited items acknowledged, (3) all required docs submitted.
  Source: `src/app/api/vendor/onboarding/status/route.ts:187-190`
  Test type: Integration

**OB-007:** Grandfathered vendors (have `onboarding_completed_at`) skip partner agreement requirement.
  Source: `src/app/api/vendor/onboarding/status/route.ts:215, :221`
  Test type: Integration

---

## I. Payments & Payouts

### Stripe Config

**PP-001:** `STRIPE_CONFIG.applicationFeePercent` = `buyerFeePercent + vendorFeePercent` = 13%.
  Source: `src/lib/stripe/config.ts:16`
  Test type: Unit — assert `STRIPE_CONFIG.applicationFeePercent === 13`

### Subscription Price Config

**PP-002:** Stripe subscription prices must match `SUBSCRIPTION_AMOUNTS` in pricing.ts.
  Source: `src/lib/stripe/config.ts:26-92` (mirrors `src/lib/pricing.ts:23-37`)
  Test type: Unit — compare corresponding values between both files

---

## J. Cron Jobs

### Phase Timing & Constants

**CR-001:** Stripe checkout expiry = 10 minutes (600,000 ms).
  Source: `src/lib/cron/order-timing.ts:19`
  Test type: Unit — assert `STRIPE_CHECKOUT_EXPIRY_MS === 600000`

**CR-002:** Payout retry max = 7 days.
  Source: `src/lib/cron/order-timing.ts:22`
  Test type: Unit — assert `PAYOUT_RETRY_MAX_DAYS === 7`

**CR-003:** Stale confirmation window = 5 minutes (300,000 ms).
  Source: `src/lib/cron/order-timing.ts:25`
  Test type: Unit — assert `STALE_CONFIRMATION_WINDOW_MS === 300000`

**CR-004:** Confirmation window duration = 30 seconds.
  Source: `src/lib/cron/order-timing.ts:28`
  Test type: Unit — assert `CONFIRMATION_WINDOW_SECONDS === 30`

### Order Timing Functions

**CR-005:** `isStripeCheckoutExpired(createdAt, now)` — true if `now - created >= 10 minutes`.
  Source: `src/lib/cron/order-timing.ts:34-38`
  Test type: Unit — boundary tests at exactly 10min

**CR-006:** `isPayoutRetryable(createdAt, now)` — true if `now - created < 7 days`.
  Source: `src/lib/cron/order-timing.ts:44-49`
  Test type: Unit — boundary tests at exactly 7 days

**CR-007:** `isConfirmationWindowStale(expiresAt, now)` — true if `now - expires >= 5 minutes`.
  Source: `src/lib/cron/order-timing.ts:55-59`
  Test type: Unit — boundary tests

**CR-008:** `calculateWindowExpiry(now)` — returns `now + 30 seconds` as ISO string.
  Source: `src/lib/cron/order-timing.ts:65-68`
  Test type: Unit

### External Payment Timing

**CR-009:** FT external payment reminder delay = 15 minutes.
  Source: `src/lib/cron/external-payment.ts:13`
  Test type: Unit — `REMINDER_DELAY_MS.food_trucks === 900000`

**CR-010:** FM external payment reminder delay = 12 hours.
  Source: `src/lib/cron/external-payment.ts:14`
  Test type: Unit — `REMINDER_DELAY_MS.farmers_market === 43200000`

**CR-011:** FW external payment reminder delay = 12 hours.
  Source: `src/lib/cron/external-payment.ts:15`
  Test type: Unit

**CR-012:** Default reminder delay (unknown vertical) = 12 hours.
  Source: `src/lib/cron/external-payment.ts:19`
  Test type: Unit — `DEFAULT_REMINDER_DELAY_MS === 43200000`

**CR-013:** `isOrderOldEnoughForReminder(createdAt, vertical, now)` — compares order age to vertical-specific delay.
  Source: `src/lib/cron/external-payment.ts:28-37`
  Test type: Unit — FT: 16min old → true, FM: 16min old → false

**CR-014:** Auto-confirm eligible payment methods = `['venmo', 'cashapp', 'paypal']` (cash excluded).
  Source: `src/lib/cron/external-payment.ts:22`
  Test type: Unit — assert `AUTO_CONFIRM_PAYMENT_METHODS` does NOT include 'cash'

**CR-015:** `getAutoConfirmCutoffDate(now)` — returns yesterday's date (YYYY-MM-DD).
  Source: `src/lib/cron/external-payment.ts:43-47`
  Test type: Unit

**CR-016:** `areAllItemsPastPickupWindow(items, cutoffDate)` — true when all non-cancelled items have pickup_date ≤ cutoff. Returns false for empty active items.
  Source: `src/lib/cron/external-payment.ts:53-64`
  Test type: Unit

**CR-017:** `formatPaymentMethodLabel('cashapp')` → `'Cash App'`, `formatPaymentMethodLabel('paypal')` → `'PayPal'`, `formatPaymentMethodLabel('venmo')` → `'Venmo'`.
  Source: `src/lib/cron/external-payment.ts:70-76`
  Test type: Unit

### No-Show Logic

**CR-018:** `calculateNoShowPayout(params)` = `vendorPayoutCents + round((tipAmount - tipOnPlatformFeeCents) / totalItems)`.
  Source: `src/lib/cron/no-show.ts:17-28`
  Test type: Unit

**CR-019:** FT with preferred pickup time: no-show triggers 1 hour after pickup time.
  Source: `src/lib/cron/no-show.ts:46-57`
  Test type: Unit — `shouldTriggerNoShow('2026-03-14', '12:00', 'food_trucks', 1pm)` → true

**CR-020:** FM / FT without pickup time: no-show triggers when pickup_date < today.
  Source: `src/lib/cron/no-show.ts:61-63`
  Test type: Unit — `shouldTriggerNoShow('2026-03-13', null, 'farmers_market', March 14)` → true

### Data Retention

**CR-021:** Error logs retained for 90 days.
  Source: `src/lib/cron/retention.ts:13`
  Test type: Unit — `DATA_RETENTION_DAYS.error_logs === 90`

**CR-022:** Notifications retained for 60 days.
  Source: `src/lib/cron/retention.ts:14`
  Test type: Unit — `DATA_RETENTION_DAYS.notifications === 60`

**CR-023:** Activity events retained for 30 days.
  Source: `src/lib/cron/retention.ts:15`
  Test type: Unit — `DATA_RETENTION_DAYS.activity_events === 30`

**CR-024:** Data cleanup runs only on Sundays (UTC day 0).
  Source: `src/lib/cron/retention.ts:19-21`
  Test type: Unit — `isCleanupDay(new Date('2026-03-15'))` (Sunday) → true, Saturday → false

**CR-025:** `calculateRetentionCutoffs(now)` returns ISO dates for each table's retention window.
  Source: `src/lib/cron/retention.ts:24-37`
  Test type: Unit

### Misc Constants

**CR-026:** LOW_STOCK_THRESHOLD = 5 items.
  Source: `src/lib/constants.ts:25`
  Test type: Unit

**CR-027:** FM has 11 product categories. FT has 11 cuisine categories.
  Source: `src/lib/constants.ts:57-69` and `:74-86`
  Test type: Unit — assert `CATEGORIES.length === 11` and `FOOD_TRUCK_CATEGORIES.length === 11`

**CR-028:** `formatQuantityDisplay` — "feeds" unit format: `"feeds ${amount}"`, others: `"${amount} ${unit}"`.
  Source: `src/lib/constants.ts:94-101`
  Test type: Unit — `formatQuantityDisplay(4, 'feeds')` → `"feeds 4"`, `formatQuantityDisplay(2, 'lb')` → `"2 lb"`

---

## K. Admin Account Integrity

### Required Admin Accounts

**ADMIN-R1:** Platform admin accounts must always exist and maintain admin access. The following accounts are designated platform admins and MUST NOT be deleted, demoted, or have their admin role removed:
- `jennifer@8fifteenconsulting.com` (role: admin)
- `tsjr00@gmail.com` (role: admin)

Both accounts must exist in:
1. The REQUIRED_ADMIN_EMAILS constant in `src/lib/auth/admin-accounts.ts`
2. Production `auth.users` (with email confirmed)
3. Production `user_profiles` (with role = 'admin')

No migration, function, trigger, RLS policy, or code change may remove these emails from the required list, delete these users from auth, or demote their role without explicit user approval documented in the decision log.
  Source: `src/lib/auth/admin-accounts.ts` (REQUIRED_ADMIN_EMAILS)
  Test type: Unit — assert the constant contains both emails, assert the constant has at least 2 entries
  Incident: Session 59 — both admin accounts were missing from prod auth.users, causing complete admin lockout

### Self-Protection

**ADMIN-R2:** The admin integrity rule (ADMIN-R1), this rule (ADMIN-R2), and their test file must not be deleted, emptied, or weakened. The following files MUST exist:
1. This rule (ADMIN-R2) in `business-rules-document.md`
2. Rule ADMIN-R1 in `business-rules-document.md`
3. The constant file: `src/lib/auth/admin-accounts.ts`
4. The test file: `src/lib/__tests__/admin-account-integrity.test.ts`

The test file must contain assertions that verify:
- ADMIN-R1 required emails exist in the constant
- The test file itself exists on disk
- The constant file exists on disk
- Both ADMIN-R1 and ADMIN-R2 are documented in the business rules spec
  Source: `src/lib/__tests__/admin-account-integrity.test.ts`
  Test type: Unit — file existence checks + string content assertions
  Incident: Session 59 — admin lockout revealed no guardrails existed to prevent admin account loss

---

## Progress Checklist

- [x] A. Pricing & Fees — PF-001 through PF-027
- [x] B. Cancellation & Refunds — CX-001 through CX-014
- [x] B2. External Payment Fees — VF-001 through VF-013
- [x] B3. Tip Calculations — TIP-001 through TIP-007
- [x] C. Order Lifecycle — OL-001 through OL-013
- [x] D. Availability & Cutoffs — AV-001 through AV-010
- [x] E. Vendor Tiers & Limits — VT-001 through VT-017
- [x] F. Inventory — INV-001
- [x] G. Notifications — NI-001 through NI-014
- [x] H. Vendor Onboarding — OB-001 through OB-007
- [x] I. Payments & Payouts — PP-001 through PP-002
- [x] J. Cron Jobs — CR-001 through CR-028
- [x] K. Admin Account Integrity — ADMIN-R1 through ADMIN-R2

---

## Summary

**Total business rules extracted: 135**

| Domain | Prefix | Count | Test Type |
|--------|--------|-------|-----------|
| Pricing & Fees | PF | 27 | Unit |
| Cancellation & Refunds | CX | 14 | Unit |
| External Payment Fees | VF | 13 | Unit (9) + Integration (4) |
| Tip Calculations | TIP | 7 | Unit |
| Order Lifecycle | OL | 13 | Unit |
| Availability & Cutoffs | AV | 10 | Unit |
| Vendor Tiers & Limits | VT | 17 | Unit |
| Inventory | INV | 1 | Integration |
| Notifications | NI | 14 | Unit |
| Vendor Onboarding | OB | 7 | Integration |
| Payments & Payouts | PP | 2 | Unit |
| Cron Jobs | CR | 28 | Unit |
| Admin Account Integrity | ADMIN | 2 | Unit |

**Unit-testable:** ~122 rules (pure functions, no DB needed)
**Integration-testable:** ~13 rules (need real Supabase)
