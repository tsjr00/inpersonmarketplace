# Findings Ledger — pre-re-release review series

One accumulating record. Grouped by severity. `Status`: open / verifying / fixing / fixed / rejected / wontfix.
Reviewer = Fable (per-slice); findings taken as-is, verified at fix-time against the target lines.

---

## Slice 1 — Checkout & payments (Fable, 2026-07-12)

Coverage: read cart/{route,items,items/[id],validate}, checkout/{session,success,external,payment-methods}, lib/stripe/{payments,webhooks,connect,reconcile,session-status,config,market-box-payout}, lib/pricing, lib/payments/{vendor-fees,cancellation-fees,tip-math}, lib/inventory, + cross-checked checkout/page.tsx + cart RLS + SCHEMA_SNAPSHOT. No P0s. Clean: pricing/cancellation/tip pure fns; Stripe idempotency keys deterministic; transfer-after-DB-failure guarded; MB double-payout guarded; cart-item ownership enforced. The 5 P1s were Opus-verified against live code (all confirmed).

### P1

| ID | Cat | Conf | Anchor | Claim / scenario | Fix | Effort | Status |
|---|---|---|---|---|---|---|---|
| CHK-1 | money-path | Confirmed | checkout/session/route.ts:110-141; stripe/webhooks.ts:172-175; checkout/success/route.ts:73-77 | Expired-order cleanup cancels + restores inventory but never `sessions.expire()`; paid-flip has no `status='pending'` guard → buyer pays a cancelled order in a stale tab; charged for dead order + oversold. | In cleanup call `sessions.expire()` before cancel; add `.eq('status','pending')` to both paid-flips; route a paid-but-cancelled order to the existing auto-refund path (webhooks.ts:1395-1404 pattern). | M | **partial** |

> **CHK-1 partial (2026-07-12):** ROOT fix done — session-expire in the cleanup loop (`checkout/session/route.ts:110-127`): abandoned Stripe session is expired before the order is cancelled, so it can't be paid afterward; expire-throws (already-complete) skips cancelling a possibly-paid order. **DEFERRED (own reviewed change):** the `status='pending'` guard on the paid-flip + refund-routing in `webhooks.ts`/`checkout/success.ts` — needs a careful 3-way status branch (pending→flip / paid→idempotent backfill / cancelled→refund+stop) so it doesn't break the load-bearing webhook resend backfill. **ALSO:** verify `cron/expire-orders` cancels pending orders without expiring their sessions (same gap) — check in the crons slice.
| CHK-2 | money-path | Confirmed | checkout/session/route.ts:171-227 (match 194-203) | Dup-order match compares listing order_items only (ignores tip + market-box). MB-only carts have empty order_items → `[]==[]` matches ANY recent MB pending → reuses old session. (a) tip change silently dropped; (b) MB swap → charged/subscribed to wrong box. | Narrowed reuse to pure listing carts (no MB, no tip, non-empty match) — session/route.ts:203. | S | **fixed** |
| CHK-3 | contract-break | Confirmed | cart/validate/route.ts:28-57 (esp :28,:48); RLS 20260130_007:574-577 | GET filters `cart_items` by `user_id` — a column that doesn't exist (RLS proves ownership is `cart_id→carts.user_id`); query errors, error discarded → route always returns `valid:true`. Mixed-market-type/same-market/cutoff pre-checkout guard permanently fail-open. | Dropped non-existent `user_id` filter (RLS scopes ownership); fail-closed on query error — validate/route.ts:28-52 (option A). | S | **fixed** |
| CHK-4 | correctness | Confirmed | checkout/session/route.ts:268-270 | `listings.length !== items.length` rejects a cart with the same listing on two pickup dates (`.in('id',ids)` returns 1 row for 2 items) → `ERR_CHECKOUT_001`, legit cart can't check out. | Compare against unique IDs: `listings.length !== new Set(listingIds).size` — session/route.ts:268. | S | **fixed** |
| CHK-5 | security | Confirmed | checkout/external/route.ts:25-56; flag constants.ts:12 | "External payments INACTIVE" lock is client-side only; server route never checks `EXTERNAL_PAYMENTS_ENABLED` → direct POST creates a live external order, decrements inventory, notifies vendor. | Added `if (!EXTERNAL_PAYMENTS_ENABLED) return 403` at top of route — external/route.ts:35-37. | S | **fixed** |

### P2 (Fable-reported; verify at fix-time)

| ID | Cat | Conf | Anchor | Claim / scenario | Fix | Effort | Status |
|---|---|---|---|---|---|---|---|
| CHK-6 | money-path | Confirmed(F) | checkout/success:240,257; webhooks:252,266; session:709-724,654 | MB failure/at-capacity auto-refund refunds `mbItem.priceCents` (pre-fee) but buyer paid `round(price×1.065)`+fee share → buyer shorted ~6.5%. | Refund the fee-inclusive charged amount (store in metadata) or full-PI refund for MB-only. | S | open |
| CHK-7 | data-integrity | Confirmed(F) | checkout/session:778-798; lib/inventory:57-77; cleanup:120-137 | Inventory decrement per-item mid-loop, no rollback; `restoreOrderInventory` restores ALL non-cancelled items incl. ones never decremented → oversell. Also concurrent cleanup can double-restore (restore before `cancelled_at` set). | On decrement fail, cancel + restore only already-decremented items; set `cancelled_at` first via guarded update, restore only if guard matched. | M | open |
| CHK-8 | correctness | Confirmed | stripe/webhooks:772-777 (contrast :729) | `handleInvoicePaymentFailed` checks only `subscriptionType==='vendor'`, omits `'food_truck_vendor'` → FT vendor renewal failures never set `past_due`. | Added `|| food_truck_vendor` to the failed handler. | S | **fixed** |
| CHK-9 | correctness | Confirmed | stripe/webhooks:730-736,773-777 | Invoice renewal handlers update vendor_profiles by `user_id` only (no `vertical_id`) → multi-vertical vendor's renewal writes onto BOTH profiles → lapsed vertical stays premium indefinitely. | Both handlers now read `metadata.vertical` + `.eq('vertical_id', vertical)` (refuse+log if missing, mirrors A3). | S | **fixed** |
| CHK-10 | contract-break | Confirmed(F) | stripe/webhooks:166-292 vs checkout/success:312-473 | Regular-order notifications (`new_paid_order`, `order_placed`) + cart-clear live only in success route; webhook backup path does neither → buyer closes tab after paying → vendor not notified + cart not cleared. | Replicate the (idempotent) notification block + cart-clear into `handleCheckoutComplete`. | M | open |
| CHK-11 | efficiency | Confirmed(F) | checkout/session:438-445 | Calls `is_listing_accepting_orders` per listing while batched `get_listings_accepting_status` exists (used by cart/validate). | One batched call; per-listing detail only for the failing one. | S | N RPC/checkout→1 | open |

### P3 (Fable-reported; verify at fix-time)

| ID | Cat | Conf | Anchor | Claim | Fix | Effort | Status |
|---|---|---|---|---|---|---|---|
| CHK-12 | efficiency | Confirmed(F) | checkout/session:448-452 vs :236-249 | Second `listings` query for `id,quantity` already fetched in the parallel batch. | Add `quantity` to the first select; drop the second. | S (2 queries→1) | open |
| CHK-13 | correctness | Confirmed(F) | stripe/webhooks:24-40 | `wasNotificationSent` dedups on user+type/24h, ignores `referenceId` → 2nd legit same-type event/day suppressed (2 payouts, 2 refunds). | Add `referenceId` to the dedup query. | S | open |
| CHK-14 | money-path | High(F) | checkout/session:566-575 | Mixed listing+MB cart: vendor-tip cap computed on subtotal incl. MB, tip distributed only across listings → over-allocates tip to listing vendors, under-records `tip_on_platform_fee_cents`. | Compute the cap on listing-only subtotal. | S | open |
| CHK-15 | money-path | Confirmed(F) | checkout/session:539-543 vs :566; pricing:134-139 | `orders.platform_fee_cents` uses std 6.5% while per-item payout honors `vendor_fee_override_percent` → order-level fee bookkeeping overstates revenue for discounted vendors (reporting only; transfers correct). | Sum per-item fee components for order-level `platform_fee_cents`. | S | open |
| CHK-16 | correctness | Confirmed(F) | checkout/session:64,86,231 | `items` destructured with no default, used unchecked → body without `items` throws TypeError → traced 500 instead of 400. | Default `items=[]`, validate `Array.isArray` up front. | S | open |
| CHK-17 | money-path | Confirmed(F) | stripe/market-box-payout.ts:134-140 | Failed MB transfer logged with `console.error` only (not `logError`) → invisible to error-log review; webhook already 2xx'd (no Stripe retry) → vendor unpaid unnoticed. | Use `logError(TracedError)`; consider cron retry for failed MB payouts. | S | open |
