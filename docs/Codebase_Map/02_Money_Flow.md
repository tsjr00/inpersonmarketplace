# 02 — Money Flow

<!-- map-stamp: domain=money-flow; verified=2026-07-18; commit=b9f82116 -->

This is a payments business, and the money path is the spine of the application. This file traces money end to end across files; the per-file detail lives in [10_Checkout_Payments.md](10_Checkout_Payments.md), [11_Vendor_Orders.md](11_Vendor_Orders.md), [12_Market_Manager.md](12_Market_Manager.md) and [13_FT_Park.md](13_FT_Park.md).

---

## Three independent money paths

| Path | Who pays whom | Stripe pattern |
|---|---|---|
| **Product orders** | Buyer → platform → vendor | **Separate transfer** — the platform is charged, and transfers to the vendor fire later at fulfillment |
| **Venue rent** | Vendor → platform → venue operator | **Destination charge** (`transfer_data.destination`) — settles at payment |
| **Subscriptions** | Vendor or buyer → platform | Recurring Stripe subscription; no onward transfer |

Market boxes ride path 1 but pay out **at payment time** rather than fulfillment. Everything else in path 1 pays out at fulfillment.

## Path 1 — a product order, end to end

### 1. Cart (nothing is priced or reserved)

`AddToCartButton` → `useCart` → `POST /api/cart/items`. The validation ladder runs — inventory, market membership, schedule and date, FT time-slot boundary, cross-event isolation — then the item is inserted. **No money and no inventory hold exists yet.**

The drawer subtotal shows the **percentage-fee-only** price; the $0.15 flat fee is deliberately withheld until checkout (`CartDrawer.tsx:20-27`).

### 2. Pre-checkout validation

`GET /api/cart/validate` blocks mixed market types, multi-market traditional carts, and past-cutoff items. It **fails closed** on a query error — a prior fail-open bug is documented in place.

### 3. Session creation — `POST /api/checkout/session` ⚠

The densest money code in the app, in order:

1. **Sweep** — pending orders older than 10 minutes are expired. The Stripe session is expired **first**, then the order is cancelled: a session that already completed throws, so a just-paid order is never killed.
2. **Duplicate prevention** — an identical tip-free, box-free pending cart reuses the still-open Stripe session.
3. **Re-validation** — every vendor must have a Stripe account; cutoffs re-checked in one batched RPC; inventory re-checked.
4. **Pricing** — `calculateOrderPricing` + `calculateSmallOrderFee`. Per-item fees are recomputed with `getEffectiveVendorFeePercent` so discounted vendors are honored, and the order-level `platform_fee_cents` is rebuilt by summing those per-item components rather than assuming the standard rate.
5. **Tip split** — the vendor's tip is capped at `listingSubtotal × tipPercentage`; the remainder becomes `tip_on_platform_fee_cents`. **Vendors tip on food cost only** (decision 2026-02-20).
6. **Stripe first, order second** — line items are built (goods, then separate "Service Fee", "Small Order Fee" and "Tip" lines), the session is created with idempotency key `checkout-${orderId}`, and only then are `orders` and `order_items` inserted.
7. **Inventory decrements at checkout** via `atomic_decrement_inventory`. A mid-loop failure expires the session, cancels the order, and restores **only what this request decremented**.

### 4. The paid flip — two racing paths, both idempotent

The Stripe webhook (`handleCheckoutComplete`) and the `/checkout/success` route both finalize payment, in either order, sometimes both. Each: reads the order **first**, idempotently inserts `payments` (treating 23505 as a no-op), captures the real Stripe fee, then performs a **guarded** `pending → paid` flip.

Whichever loses the race re-reads the order. Three outcomes:

| Order state | Behavior |
|---|---|
| `pending` | Guarded flip to `paid` |
| `paid` / `completed` | Idempotent backfill; no double-write |
| `cancelled` / `refunded` | **Dead order** — record the payment, then issue a full auto-refund using the deterministic shared key `${orderId}-dead-order`, so the two paths can never double-refund |

> **Any new post-payment side effect must be idempotent and added to *both* files**, or it silently won't run for buyers who close the tab.

### 5. Fulfillment and payout — `POST /api/vendor/orders/[id]/fulfill` ⚠

1. **Paid gate** — a non-external, non-company-paid order without a `succeeded` payment cannot transfer. Without this, the payout would draw on the platform's own Stripe balance.
2. **Tip split** computed per item.
3. **Double-payout guard** — an existing non-failed `vendor_payouts` row short-circuits, backed by a 23505 catch.
4. **Atomic fee claim** — `claimVendorFeeDeduction` (migration 197) locks the vendor's balance row and grants `LEAST(balance, 50% of payout)` **in one transaction**. This replaced a read-compute-deduct sequence where two near-simultaneous fulfills could over-deduct.
5. **Payout row is inserted before the transfer**, and a non-duplicate insert failure is **fatal** — no money moves untracked.
6. **Transfer failure ≠ fulfillment failure** — the item stays fulfilled, the payout row goes `failed`, and cron Phase 5 retries it (capped at 15 transfers per run).

### 6. Refunds

Four paths — vendor reject, buyer cancel, resolve-issue, and cron expiry — and a dedicated test asserts **all four produce identical amounts for identical input**: `subtotal + round(subtotal × 6.5%) + floor($0.15 / totalItems)`.

Rules that apply across them: refunds are computed on **buyer-paid** amounts, never `subtotal_cents` alone · when the last item goes, order-level **tip and small-order fee** are refunded too · if the order is still `pending` with a live session, the session is expired before cancelling · inventory restores only for items where `shouldRestoreInventory` allows it (FT `fulfilled` food is never restocked) · an issue-refund on an already-paid-out item triggers a **fee-ledger clawback** or cancels the pending payout.

## Path 2 — venue rent

Vendors rent selling space; the operator has their own Connect account and receives a **destination charge**.

- **FM weekly booth** — atomic rental insert → credit redemption → checkout session. On Stripe failure the row is deleted so the vendor can retry immediately.
- **FM season/partial** — `book_season_atomic`, all-or-nothing across weeks; one checkout for the whole group; per-week totals persisted as `total_vendor_cents` / `total_manager_cents`.
- **FT park spot** — `book_park_spot_atomic` across one or many dates, one destination charge. On Stripe failure **redeemed credit is released before the rows are deleted**, because the delete SET-NULLs the FK.

**Fee model** (`pricing.ts:295-357`): the vendor pays `round(price × 1.065) + 15`; the operator receives `price − round(price × 6.5%)`; the platform keeps the difference. A per-market `operator_keep_pct` lever adjusts the split. `calculateBoothRentalFees` is unit-agnostic and serves both FM per-week and FT per-day pricing.

### The booth-credit ledger

The one place value moves **without Stripe**. Balance is a plain SUM of `booth_credits` rows per `(vendor, market)` — positive granted, negative redeemed.

- **Minted** on vendor season-cancel (full before season start; remaining weeks minus a 25% penalty after), on park date-cancellation by the operator, and as a 0-amount marker row at season settlement.
- **Redeemed** through `redeem_booth_credit`, which takes an advisory lock so concurrent bookings can't double-spend. Callers cap the request so the residual Stripe charge stays ≥ 50¢ and the operator transfer can't go negative. At park checkout the credit reduces **both** the vendor charge and the operator transfer, because the operator was already paid on the cancelled booking.
- **Released** when a booking that consumed credit is cancelled, swept, or fails at Stripe — with a `CRITICAL` log if the release itself fails, since that requires manual re-credit.
- **Expired** by cron Phase 19, which zeroes a positive balance with no live grant by inserting one `−balance` row. The balance never goes negative.

**No money ever moves backward at season settlement** — shortfalls are resolved as off-platform or made-up, recorded with a 0-amount marker.

## Path 3 — subscriptions

Platform tiers (vendor Pro/Boss, buyer Premium) use genuine Stripe recurring subscriptions. A tier switch cancels the prior subscription first. The `vertical` is mandatory in the metadata for vendors so a webhook can't update the wrong profile of a multi-vertical vendor.

> **Naming trap:** `/api/subscriptions/*` means *platform memberships*. **Market boxes are not recurring** — despite the `market_box_subscriptions` table name, a box is a prepaid fixed-term (4 or 8 week) **one-time** line item; there is no Stripe subscription object and no renewal charge. See [15_MarketBoxes_Subs.md](15_MarketBoxes_Subs.md).

## Invariants the test suite enforces

These are asserted structurally on every commit — see [23_Test_Suites.md](23_Test_Suites.md):

- `buyerTotal − vendorPayout === platformFee`, **exactly**, for all inputs
- `Σ proratedFlatFee(fee, N, i) === fee` — flat-fee proration is zero-sum
- `vendorTip + platformFeeTip === totalTip`
- Every status write on a money table carries a status precondition in the same query
- The Stripe session is expired **before** any payment-holding row is released
- Every `stripe.transfers.create` carries `sourceTransaction`
- No order without a succeeded payment can produce a transfer, by any path
- Money errors go to `error_logs`, never `console.error`

## Rules that have cost money when broken

1. **Stripe idempotency keys must be deterministic.** Never `Date.now()`. A documented incident: two same-priced items generated identical refund keys and the second refund silently never happened — so keys must be *more* specific, never less.
2. **Payments are written with the service client** — buyers cannot insert `payments` rows under RLS.
3. **Per-item rounding, not order-level.** Display and tip base use `calculateItemDisplayPrice` per item so the figures match Stripe's line items.
4. **Never move money before the tracking row exists**, and treat a failed tracking insert as fatal.
5. **Inventory is reserved at checkout, not at payment** — every sweep and restore path exists because of this.
