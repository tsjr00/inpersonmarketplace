# 10 — Checkout & Payments ⚠ money

<!-- map-stamp: domain=checkout-payments; verified=2026-07-18; commit=b9f82116 -->
<!-- map-claims
src/app/api/cart/**
src/app/api/checkout/**
src/app/api/webhooks/stripe/**
src/lib/pricing.ts
src/lib/payments/**
src/lib/stripe/**
src/lib/inventory.ts
src/lib/inventory-rules.ts
src/components/cart/**
src/app/[vertical]/checkout/**
-->

**The highest-stakes domain in the codebase.** Eight of the platform's protected files live here. Read [§ Read this first](#read-this-first) before your first edit.

---

## Read this first

1. **`lib/pricing.ts` end to end.** Every cent displayed or charged comes from this file. The trap: item *display* price excludes the flat fee (`pricing.ts:173-175`) while order *total* includes it (`:161`) — confusing the two is the classic off-by-15¢ bug.
2. **`api/checkout/session/route.ts`** (~880 lines) is the densest file in the app. Its central design choice: **the Stripe session is created before the order row** (`:647-652`), so a Stripe failure leaves the database clean.
3. **Inventory is reserved at checkout, not at payment** (`session/route.ts:815-818`). This single fact explains the expired-order sweep (`:109-166`) and the existence of `cancelOrderItemsAndRestoreGuarded`.
4. **Two paths finalize every payment** — the Stripe webhook and the `/checkout/success` route — in either order, sometimes both. Any new post-payment side effect must be idempotent *and* added to both files, or it silently won't run for buyers who close the tab. `success/route.ts:271-355` and `webhooks.ts:299-375` are deliberate near-duplicates.
5. **Idempotency keys are load-bearing.** Every Stripe mutation carries a deterministic key. `createRefund`'s doc comment (`payments.ts:242-247`) records a real bug where two same-priced items produced identical keys and the second refund never happened. Never make a key *less* specific, and never use `Date.now()`.
6. **Don't clean up the inline bug-history comments.** Tags like CHK-1, CHK-7, CRIT-1, F6, M12 each mark a production incident and the code preventing its recurrence — `inventory.ts:40-60` and `market-box-payout.ts:22-30` are the clearest examples.
7. **Read `.claude/rules/change-discipline.md` Rule 3 first.** The Session 66 incident is why the mechanical gate exists: design-approved logic added to `cart/items/route.ts` broke the entire production cart, silently, with the UI still showing success.

## The fee model (verified against `lib/pricing.ts`)

| Fee | Value | Anchor |
|---|---|---|
| Buyer percentage | **6.5%** | `pricing.ts:15` |
| Vendor percentage | **6.5%** | `pricing.ts:16` |
| Buyer flat | **15¢**, once per order | `pricing.ts:17` |
| Vendor flat | **15¢**, once per order | `pricing.ts:18` |
| Platform take | 13% + $0.30 per order | `pricing.ts:139` |

- Buyer total = `subtotal + round(subtotal × 6.5%) + 15` (`pricing.ts:128-131`)
- Vendor payout = `subtotal − round(subtotal × 6.5%) − 15` (`pricing.ts:133-136`)
- Platform revenue = both percentage fees + both flat fees (`pricing.ts:139`)

**Small-order fee** — compared against the *displayed* (marked-up) subtotal, not the base (`pricing.ts:81`). Defaults at `pricing.ts:48-52`, overridable per vertical in `verticals.config`:

| Vertical | Below | Fee |
|---|---|---|
| `farmers_market` | $10.00 | $1.00 |
| `food_trucks` | $5.00 | $0.50 |
| `fire_works` | $40.00 | $4.00 |

**Vendor fee discount** — floor **3.6%** (`pricing.ts:261`), clamped to `[3.6, 6.5]` by `getEffectiveVendorFeePercent` (`pricing.ts:270-273`). At the floor the platform nets roughly zero on the vendor side (it covers Stripe's ~2.9%); buyer-side fees remain pure revenue, and flat fees are never discounted (`pricing.ts:258-260`).

**Flat-fee proration** across N items is zero-sum: items 1..N−1 get `floor(fee/N)`, the last gets the remainder (`pricing.ts:199-208`) — 15¢ over 2 items is `[7,8]`, never `[8,8]`.

**Booth rental** uses a separate model in the same file (`pricing.ts:295-357`): vendor pays `round(price × 1.065) + 15`; the operator receives `price − round(price × 6.5%)`; a per-market `operator_keep_pct` lever derives the percentage float-safely (`:344-347`). $0 booths return all zeros. See [12_Market_Manager.md](12_Market_Manager.md) and [13_FT_Park.md](13_FT_Park.md).

**External payments use a different model** — buyer 6.5% with *no* flat fee, seller 3.5% (`payments/vendor-fees.ts:15-16`). This subsystem is **dormant, not dead**: `EXTERNAL_PAYMENTS_ENABLED` returns 403 at `checkout/external/route.ts:35-37`, but the fee model, deep links and tests are live code. Don't delete it; don't re-enable it without reading the Session 62/63 decisions.

## Cart API

| File | Purpose |
|---|---|
| `api/cart/route.ts` | GET only. Loads the cart for one vertical, joins listings/markets/schedules/box offerings, re-checks each item's schedule still exists, calls `get_cart_summary`, returns display-shaped items. Does not create carts (`:113-129`). |
| `api/cart/items/route.ts` ⚠ | POST. Adds a listing or market-box item. Listing path runs the full validation ladder: vertical → inventory (`validate_cart_item_inventory`, `:95`) → market membership (`:129`) → schedule/date (`validate_cart_item_schedule`, `:152`) → FT time slot on a 15-min boundary (`:174-185`) → cross-event cart isolation (`:204-228`). Box path checks offering status, subscriber capacity vs tier, duplicate subscriptions, and resolves the start date in market timezone (`:431`). |
| `api/cart/items/[id]/route.ts` ⚠ | PUT re-validates inventory before changing quantity (`:57-72`) and verifies ownership via `carts.user_id` (`:52`); DELETE removes the item, relying on RLS for ownership (`:108`). |
| `api/cart/validate/route.ts` ⚠ | The pre-checkout gate. GET blocks **events sharing a cart with any other market** (`:174`) and past-cutoff items via `get_listings_accepting_status` (`:132`). **Fails closed** on query error (`:76`) — a prior fail-open bug is documented in place. POST returns per-item availability. **Changed 2026-08-09:** it previously also blocked multi-market traditional carts and mixed pickup types; both were removed as a regression — see "Multi-location orders" below. |

## Checkout API

| File | Purpose |
|---|---|
| `api/checkout/session/route.ts` ⚠ | Creates the Stripe Checkout session and the order. Rate-limited 5/min (`:57`); tip capped at $50 / 100% (`:75-80`) and blocked on box-only carts (`:87-91`); sweeps pending orders older than 10 min (`:114-166`); reuses an open session for an identical pending cart (`:196-256`); requires every vendor to have a Stripe account (`:310-313`); re-checks inventory and cutoffs; builds per-item fee splits honoring vendor discounts (`:565-569`); Stripe session first (`:738-769`), then `orders` + `order_items`, then inventory decrement with unwind-on-failure (`:824-875`). `maxDuration = 30`. |
| `api/checkout/success/route.ts` ⚠ | GET with `session_id`. Verifies Stripe `payment_status === 'paid'` (`:41`) and order ownership (`:69`), guarded-flips `pending → paid` (`:82-87`), handles the dead-order case by recording payment and auto-refunding (`:106-134`), idempotently inserts `payments` (23505 = no-op, `:157`), creates market-box subscriptions with fee-inclusive refunds on capacity failure (`:271-355`), clears the cart (`:514-532`), defers side effects via `after()`. `maxDuration = 30`. |
| `api/checkout/external/route.ts` ⚠ | Dormant. Creates an order paid outside Stripe and returns a deep link; hard-gated off at `:35-37`. Single-vendor carts only. |
| `api/checkout/payment-methods/route.ts` | POST. Returns the intersection of payment methods all cart vendors support, so the UI can render the selector. Read-only. |
| `api/webhooks/stripe/route.ts` | Webhook entrypoint. Verifies the signature (400 on failure = no retry), delegates to `handleWebhookEvent`, returns 500 on throw so Stripe retries (up to 16× over 72h). `maxDuration = 30`. |

## Stripe library

| File | Purpose |
|---|---|
| `lib/stripe/payments.ts` ⚠ | All session/transfer/refund creation, each with a deterministic idempotency key. **Product orders use the separate-transfer pattern; booth/season/park bookings use destination charges** (`transfer_data.destination`). Exports `createCheckoutSession`, `transferToVendor`, `createRefund`, `createMarketBoxCheckoutSession`, `transferMarketBoxPayout`, `createBoothRentalCheckoutSession`, `createSeasonBoothCheckoutSession`, `createParkSpotCheckoutSession`, `getChargeIdFromPaymentIntent`, `getStatementSuffix`. |
| `lib/stripe/webhooks.ts` ⚠ | ~1,900 lines: the event router plus every handler. `handleCheckoutComplete` (`:129`) dispatches by `session.mode`/`metadata.type` into subscription, market-box, booth-rental, season-booth, park-spot or regular-order paths (`:133-165`). Also handles payment success/failure, `account.updated`, transfer created/reversed, `charge.refunded` (`:1127`), disputes (`:1230`), and subscription/invoice lifecycle. |
| `lib/stripe/config.ts` | Lazily constructs the SDK (null without `STRIPE_SECRET_KEY` so builds succeed, `:7-12`); API version `2025-12-15.clover`; holds per-vertical subscription price IDs and lookup helpers. |
| `lib/stripe/webhook-utils.ts` | Pure helpers extracted from webhooks.ts: the canonical handled-event list, and market-box base-price selection with a logged fallback. |
| `lib/stripe/market-box-payout.ts` | Idempotently creates the `vendor_payouts` row and fires the transfer for a paid box subscription. Pays on `actualPaidCents` (CRIT-1 fix: previously overpaid biweekly subs) and threads `source_transaction` (CRIT-2 fix: previously hit `balance_insufficient`). |
| `lib/stripe/fee-capture.ts` | Reads the **actual** Stripe fee from `latest_charge.balance_transaction.fee` into `payments.stripe_fee_cents`; non-blocking in the webhook, with a backfill path for historical rows. Feeds accurate admin P&L. |
| `lib/stripe/connect.ts` | Creates Connect Express accounts — separate functions and idempotency namespaces for managers vs vendors, so one person can hold both. |
| `lib/stripe/session-status.ts` | Reads a season-booth session's live state from Stripe so cron reconciliation decides confirm-vs-cancel from Stripe rather than a timer. |
| `lib/stripe/reconcile.ts` | Admin tooling: maps a Stripe PaymentIntent/Charge/Transfer/Payout back to local records through a 6-stage matching pipeline. Powers `/[vertical]/admin/stripe-reconcile`. |

## Payments library

| File | Purpose |
|---|---|
| `lib/payments/vendor-fees.ts` ⚠ | External-payment fee model (buyer 6.5% no flat, seller 3.5%) **and** the vendor fee-ledger: invoicing thresholds ($50 balance / 40 days) and the 50% auto-deduct cap. Also home of `claimVendorFeeDeduction`, the atomic claim-first deduction used by all three payout routes — see [11_Vendor_Orders.md](11_Vendor_Orders.md). |
| `lib/payments/tip-math.ts` | Pure tip-split math: tips split evenly across items; vendor tip is a percentage of base food price, the remainder is platform fee tip. |
| `lib/payments/cancellation-fees.ts` | Buyer-cancellation refunds: 25% cancellation fee (`:12`) outside a per-vertical grace window — FM 1h, FT 15min (`:16-20`) — splitting the retained fee between platform and vendor. |
| `lib/payments/external-links.ts` | Builds Venmo / Cash App / PayPal.me deep links with amount and order note pre-filled. Pure string building. |

## Inventory

| File | Purpose |
|---|---|
| `lib/inventory.ts` | Race-safe restore. `cancelOrderItemsAndRestoreGuarded` uses the guarded UPDATE (`cancelled_at IS NULL`) as the **claim**, restoring only rows it actually flipped, so a concurrent sweep matches zero rows (`:79-99`). Documented failure direction: a crash mid-flow *understocks* rather than overselling (`:52-56`). `restoreOrderInventory` is retired from production call sites — see [23_Test_Suites.md](23_Test_Suites.md) Rule H. |
| `lib/inventory-rules.ts` | One extracted rule: FT `fulfilled` items never restore inventory (the food was cooked); everything else restores (`:20-27`). |

## UI

| File | Purpose |
|---|---|
| `components/cart/AddToCartButton.tsx` | The pickup date/time picker + add-to-cart widget (~740 lines): groups available dates by market, renders FT time slots, shows cutoff countdowns, enforces max quantity. |
| `components/cart/CartDrawer.tsx` | Slide-over cart (~580 lines): line items, quantity edit, schedule-issue banners, subtotal at **percentage-fee-only** display price — the flat fee is deliberately deferred to checkout (`:20-27`). |
| `components/cart/CartButton.tsx` | Header button with item-count badge (caps at "99+"); opens the drawer. |
| `components/cart/CartProviderWrapper.tsx` | Wraps children in `CartProvider`; lazily mounts the drawer (`ssr: false`) only once opened. |
| `app/[vertical]/checkout/page.tsx` | The checkout screen (~1,140 lines): revalidates via `/api/cart/validate`, groups by pickup, tip selector, cross-sell, payment-method selector, then POSTs `/api/checkout/session` (`:458`) and redirects. Guards double-submit with `isSubmittingRef`. |
| `app/[vertical]/checkout/success/page.tsx` | Confirmation screen: calls `/api/checkout/success` (`:122`), renders pickup details with map links, box subscription summary, push-notification opt-in. |
| `app/[vertical]/checkout/external/page.tsx` | Dormant. Renders external-payment instructions purely from URL query params. |
| `app/[vertical]/checkout/{TipSelector,CheckoutListingItem,CheckoutMarketBoxItem,CheckoutPickupGroup,CrossSellSection,PaymentMethodSelector}.tsx`, `types.ts`, `loading.tsx` | Presentational children of the checkout page. |

**There is no `/cart` page** — the cart is a drawer only. Client-side cart state lives in `lib/hooks/useCart`.

## Multi-location orders (one rule, two files)

**An EVENT may not share a cart with any other market. Everything else combines** — two traditional markets, or a market plus a vendor's private pickup. Per-item pickup is the mechanism: `order_items` carries its own `market_id`, `schedule_id` and `pickup_date`, and `orders` carries no market at all.

| Layer | File | Behaviour |
|---|---|---|
| Add to cart | `api/cart/items/route.ts` `:204-228` | Refuses `ERR_CART_010` when the incoming item and an existing one differ AND either market is an `event`. The hard guard. |
| Buyer consent | `lib/hooks/useCart.tsx` `:296-299` → `checkout/page.tsx` `:1047` | Distinct `market_id > 1` renders the 📍 multi-location notice listing each market by name and city; the checkout button stays disabled until the buyer ticks it (`:592`). `CheckoutPickupGroup` then shows vendor/time/place per group. |
| Pre-checkout backstop | `api/cart/validate/route.ts` `:174` | Same event rule, for a cart assembled before the add-time guard. |

**Events are isolated for a money reason:** `api/events/[token]/cancel/route.ts:212` calls `createRefund` with no `amount`, which refunds the WHOLE payment intent. One order holding two events would refund both. Do not relax this without changing that refund path first.

⚠ **Do not "restore" a same-market or mixed-type block in `cart/validate`.** One existed from 2026-01-14 (`c585da5c`, day eleven, no recorded rationale) and contradicted the multi-location checkout built ten days later (`bb865e30`). It sat inert behind a fail-open bug until `f4b2700c` (2026-07-12) closed it, then began firing at `0cdda987` (2026-07-20) when the validator learned to read the buyer's chosen market — killing multi-market checkout **in production** until 2026-08-09. Guarded now by `flow-integrity.test.ts` → "Multi-location cart rule".

## Protected files in this domain

Enforced by the PreToolUse hook (`.claude/protected-paths.txt` → `scripts/hooks/protected-paths-check.mjs`): the first Edit/Write per session on a matching path is **denied** with an instruction to read the governing decision; a conscious retry proceeds.

**Rule 3 critical path:** `api/cart/items/route.ts` · `api/cart/items/[id]/route.ts` · `api/cart/validate/route.ts` · `api/checkout/session/route.ts` · `api/checkout/success/route.ts` · `lib/stripe/payments.ts` · `lib/stripe/webhooks.ts` · `lib/pricing.ts`

**Decision-log protected (dormant external-payment subsystem):** `lib/payments/vendor-fees.ts` · `api/checkout/external/route.ts` · `api/vendor/orders/[id]/confirm-external-payment/route.ts`

Rule 3's gate requires all four of: naming the exact path, stating the risk in one sentence, showing actual before/after lines, and approval *referencing that file*. Design approval explicitly does not count.

**Money-adjacent but not formally protected** — treat with equal care: `lib/inventory.ts`, `lib/stripe/market-box-payout.ts`, `lib/stripe/fee-capture.ts`, `lib/payments/tip-math.ts`, `lib/payments/cancellation-fees.ts`. Each moves money or stock and each carries documented incident history.
