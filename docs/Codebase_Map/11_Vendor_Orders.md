# 11 — Vendor Orders & Vendor Dashboard ⚠ money

<!-- map-stamp: domain=vendor-orders; verified=2026-09-04; commit=8df93d4b -->
<!-- map-claims
src/app/api/vendor/**
src/lib/orders/**
src/lib/vendor/**
src/lib/vendor-limits.ts
src/components/vendor/**
src/app/[vertical]/vendor/**
src/app/vendor-signup/**
src/app/[vertical]/vendor-signup/**
-->

The largest single surface in the codebase: **74 route files** under `src/app/api/vendor/**`, plus the order state machine and the vendor dashboard.

**Your Customers report (2026-09-04, A1 of `vip_loyalty_buildout_plan.md`):** `api/vendor/customers` — the vendor's LIFETIME customer distribution (one-timers → Local Legends + favorites), rendered as the "Your Customers" card on `[vertical]/vendor/insights`. THE shared classifier's third reader (`lib/loyalty/segments.ts` — chip, badges, this report; flow-integrity-guarded). Names = `user_profiles.display_name` only, never email/phone. Sibling of `location-insights` (lifetime/vendor-level vs windowed/per-location), same tier gate.

**VIP designation (2026-09-04, A2 — mig 242 `vendor_vip_customers`):** `api/vendor/vip-customers` POST/DELETE — vendor hand-picks best customers from the Your Customers rows (star toggle + slot meter there). Cap = `vendor-limits.ts` ⚠ `TierLimits.vipCustomers` (0/10/25), gates ADDING only — a downgrade never removes VIPs. Buyer gets `vip_added` (immediate, free channels; dedup key blocks re-notification); vendor sees ⭐ VIP on OrderCard (`customer_is_vip` from the orders API); buyer sees "You're a VIP" on their Favorites vendor card. Removal is silent by design. Phase B perks (punch card, spend-threshold discount — vendor-funded only) key off these rows.

**Week strip (2026-09-03, P6 v2):** `lib/vendor/week-strip.ts` (pure `assembleStrip` + loader — the vendor's next-14-DATES commitments: weekly schedules, own private-pickup windows, paid park days/booth weeks, SELECTED events; blackout-skipped and manager-cancelled days render STRUCK with the reason, never silently dropped) → served by `api/vendor/week-schedule` (client sends its local `start` date — no server timezone guess) → rendered by `components/vendor/markets/WeekAtAGlance.tsx` at the top of `/vendor/markets`. Commitment queries mirror `lib/events/availability.ts` patterns (its doc comment explains the split); date helpers imported from it. Unit spec: `lib/vendor/__tests__/week-strip.test.ts`.

---

## Read this first

1. **`supabase/migrations/20260109_204341_001_orders_and_payments.sql:16-36`** — internalize that `order_status` and `order_item_status` are **different enums with different values**. Most bugs in this domain start with confusing them. See below.
2. **`lib/vendor/getVendorProfile.ts`** (80 lines) — the auth primitive. Its doc comment (`:8-33`) explains why `.eq('user_id', …).single()` is a bug for multi-vertical vendors.
3. **`api/vendor/orders/[id]/confirm/route.ts`** (112 lines) — the simplest complete example of the route shape: rate limit → auth → fetch item → resolve profile by the order's vertical → ownership check → status guard → guarded update → notify.
4. **`api/vendor/orders/[id]/fulfill/route.ts`** (508 lines) — read every comment, not just the code. Each `VOR-n` / `C-n` / `H-n` / `M-n` marker is a production incident someone paid for. Note especially the two branches at `:118` (buyer acknowledged first) and `:477` (vendor first).
5. **`lib/orders/status-transitions.ts`** — read this **last**, and read [§ the spec module](#the-spec-module-that-isnt-wired-in-vor-11) before trusting it. It documents intent, not behavior.

**Rules the hardened code already enforces — follow them in new work:**
- Never update an item status with a bare `.eq('id', …)`. Every hardened path adds a status / `cancelled_at` guard and checks the returned row count (`fulfill:183-192`, `reject:131-146`).
- Never move money before the tracking row exists, and treat a failed tracking insert as **fatal** (`fulfill:363-367` — "no money moves untracked").
- Refunds are computed on **buyer-paid** amounts (subtotal + 6.5% + prorated flat fee), never on `subtotal_cents` alone.
- Refund/transfer failures go through `logError(new TracedError(...))`, never `console.error` — console output is invisible to the error-log review.

## The two enums

| Enum | Values |
|---|---|
| `order_status` | `pending · paid · confirmed · ready · completed · cancelled · refunded` |
| `order_item_status` | `pending · confirmed · ready · fulfilled · cancelled · refunded` |

`orders.confirmed` and `orders.ready` exist in the database enum but **no code path ever writes them**. Almost every vendor action operates on `order_items`; the order row is derived — it flips to `paid` on payment, to `completed` via RPC, and to `cancelled` when all items are cancelled.

## Auth models

Two patterns recur across the whole vendor surface:

- **Standard vendor auth** — `supabase.auth.getUser()` → `getVendorProfileForVertical(supabase, user.id, verticalId, cols)` → explicit ownership check (`resource.vendor_profile_id !== vendorProfile.id`). Multi-vertical safe. This is the correct pattern.
- **Service-client escalation** — `createServiceClient()` bypasses RLS, used where vendors legitimately cannot read a table (`payments`, `vendor_payouts`, and `orders` itself). **Every service-client route must do its own ownership check** — the database is not protecting it. `api/vendor/orders/route.ts:14` is the clearest example: its safety rests entirely on the profile resolution plus a `vendor_profile_id` filter.

`getVendorProfileForVertical` has five documented resolution rules (`getVendorProfile.ts:18-24`): zero profiles → error; one profile → return it regardless of the vertical argument; many + matching vertical → return the match; many + no vertical → disambiguation error (`:69-77`). It auto-appends `vertical_id` to the select (`:40-43`).

## Order lifecycle

### Item transitions

| From → To | Trigger | Anchor |
|---|---|---|
| `pending → confirmed` | Vendor accepts | `orders/[id]/confirm/route.ts:86-89` (guard `:79-83`) |
| `pending → confirmed` (bulk) | External payment confirmed for the order | `confirm-external-payment/route.ts:156-160` |
| `pending\|confirmed → ready` | Vendor marks ready | `orders/[id]/ready/route.ts:82-85` (guard `:74-79`) |
| `ready → fulfilled` | Fulfill **after** buyer acknowledgment | `fulfill/route.ts:175-186`; zero-row result → validation error `:188-192` |
| `pending\|confirmed\|ready → fulfilled` | Fulfill **before** buyer acknowledgment | `fulfill/route.ts:484-493` — direct `pending → fulfilled` is deliberate live behavior (`:482`) |
| `any except fulfilled → cancelled` | Vendor rejects | `reject/route.ts:122-133`; `fulfilled` blocked at `:101-106`; reason mandatory `:44-49` |
| `cancelled → refunded` | Stripe refund succeeded | `reject/route.ts:179-182`, `resolve-issue/route.ts:192-195` |
| `any → cancelled` (unpaid external) | Payment never arrived | `cancel-nonpayment/route.ts:88-97` — `cancelled_by: 'system'`, deliberately not counted against the vendor |

### Order transitions

| From → To | Trigger | Anchor |
|---|---|---|
| `pending → paid` | External payment confirmed | `confirm-external-payment/route.ts:111-122` — atomic on `external_payment_confirmed_at IS NULL`; the loser gets "already confirmed" (`:128-130`) |
| `paid → completed` | `atomic_complete_order_if_ready(p_order_id)` RPC | Called from `fulfill/route.ts:200,238,421,458`. Sets `completed` only when **every** non-cancelled item has both `buyer_confirmed_at` and `vendor_confirmed_at`. *(A pre-migration-092 version never completed any order due to a boolean/integer type bug that callers silently swallowed — history worth knowing.)* |
| `→ cancelled` | Last active item rejected / refunded / unpaid | `reject/route.ts:227-232`, `resolve-issue/route.ts:266-270`, `cancel-nonpayment/route.ts:102-105` |

### What rides on fulfill (the money route)

1. **Paid gate** — for non-external, non-company-paid orders, if the order isn't `paid`/`completed`, a `succeeded` `payments` row is required (`:99-116`). Without this, an unpaid order's payout would transfer from the platform's own Stripe balance.
2. **30-second buyer-acknowledgment window** — if expired, `buyer_confirmed_at` resets to null and the vendor must ask again (`:120-138`).
3. **Tip split** — vendor receives the tip minus the platform-fee portion, divided across items via `calculateTipShare` (`:276-289`).
4. **Double-payout guard** — an existing non-failed `vendor_payouts` row short-circuits (`:291-306`), backed by a `23505` catch (`:353-362`).
5. **Atomic fee claim** — `claimVendorFeeDeduction` (migration 197) locks the balance row and grants `LEAST(balance, 50% of payout)` in a single transaction (`:314-335`). Claim failure deducts zero and logs. This replaced a read-compute-deduct race that could over-deduct on simultaneous fulfills.
6. **Payout row before transfer** (`:344-351`); a non-duplicate insert failure is **fatal**.
7. **Transfer failure ≠ fulfillment failure** — the item stays `fulfilled`, the payout row goes `failed`, and the cron retries (`:400-439`).
8. **Company-paid orders skip Stripe entirely** (organizer settlement, `:197-217`); **cash orders** record deferred platform fees at fulfill time (`:224-234`).

### What rides on reject / resolve-issue

- Refunds use buyer-paid amounts: subtotal + 6.5% buyer fee + prorated flat fee (`reject:115-118`).
- If the order is still `pending` with a live checkout session, **the session is expired before cancelling** so a stale tab can't pay a dead order (`reject:213-224`).
- When the last item goes, order-level **tip and small-order fee** are refunded on top of per-item refunds (`reject:240-253`).
- A Stripe-paid order with no `succeeded` payments row logs `ERR_REFUND_001` rather than silently skipping the refund (`reject:192-198`).
- Cancellation-rate warning at ≥10% once the vendor has ≥10 confirmed orders (`reject:264-288`).
- **Payout clawback** on `issue_refund` (`resolve-issue:214-257`): `completed/processing/pending` payouts insert a `debit` into `vendor_fee_ledger` for exactly what was paid (DB-idempotent via a partial unique index); `failed/pending_stripe_setup` payouts are set `cancelled` so the retry cron can't pay out a refunded item. The clawback is disclosed to the vendor in the response.
- Inventory restore is conditional on `shouldRestoreInventory(status, vertical)` — cooked food-truck food is not resold.

## Routes by area

### Orders (12)

| File | Purpose | Money |
|---|---|---|
| `orders/route.ts` | Vendor order-item list; filters by vertical, status, market, event, pickup date; defaults to the **last 30 days** for performance (`:56-61`). Service client (`:14`) | No |
| `orders/[id]/confirm/route.ts` | `pending → confirmed`; rate-limited 30/60s; production requires a Stripe account unless external payment | No |
| `orders/[id]/ready/route.ts` | `pending\|confirmed → ready` | No |
| `orders/[id]/fulfill/route.ts` ⚠ | **The money route** — fulfillment + Stripe transfer (508 lines) | **YES** |
| `orders/[id]/reject/route.ts` ⚠ | Cancel + full buyer refund + inventory restore + cancellation-rate tracking | **YES** |
| `orders/[id]/resolve-issue/route.ts` | Buyer-reported issue: `confirm_delivery` (dispute → notify admins) or `issue_refund` (cancel + refund + clawback) | **YES** |
| `orders/[id]/confirm-external-payment/route.ts` ⚠ | Vendor confirms Venmo/CashApp/PayPal/cash received; records platform fees owed. Ownership check is order-level | **YES** (ledger) |
| `orders/[id]/cancel-nonpayment/route.ts` | External order cancelled for non-payment; restores inventory; no refund | No |
| `orders/[id]/payment-not-received/route.ts` | Nudge only — notifies the buyer, changes no status | No |
| `orders/[id]/confirm-handoff/route.ts` | Strict buyer-first fulfill variant. **Dead code, deliberately retained** — not called by any UI as of 2026-04-16 (`:1-21`); still money-touching if re-armed | **YES** if reached |
| `orders/[id]/confirm-cash-complete/route.ts` | Deprecated tombstone returning HTTP 410 | No |

### Payouts, fees, Stripe, subscription (8)

`fees/route.ts` (balance + ledger history) · `fees/pay/route.ts` ⚠ (Stripe session to settle the fee balance) · `stripe/onboard/route.ts` (Connect onboarding link) · `stripe/status/route.ts` (live `charges_enabled`/`payouts_enabled`, gates fulfill) · `subscription/status/route.ts` · `subscription/downgrade-free/route.ts` ⚠ · `tier/downgrade/route.ts` ⚠ · `park-occurrences/[bookingId]/pay/route.ts` ⚠ (pays a cron-generated recurring park occurrence; does not create a booking).

### Markets, booth & park bookings (14)

`markets/route.ts` (list; create private-pickup market; `pendingInvitations` = manager-initiated `market_vendors` invites ONLY — event-matching rows are excluded since 2026-08-27, events are answered on the Vendor Event Page) · `markets/suggest/route.ts` · `markets/[id]/route.ts` (PUT/DELETE) · `markets/[id]/book/route.ts` ⚠ (weekly booth → `pending_payment`; hard gate on agreement acceptance) · `markets/[id]/book-season/route.ts` ⚠ (season prepay, presale-window gated) · `markets/[id]/book-park-spot/route.ts` ⚠ (FT park spot, single destination charge, atomic all-or-nothing via `book_park_spot_atomic`) · `markets/[id]/standing-reservation/route.ts` (recurring day-of-week hold, operator approves) · `markets/[id]/seasons/route.ts` · `markets/[id]/join/route.ts` · `markets/[id]/respond/route.ts` (accept/decline a manager invitation — flips `approved`; refuses `market_type='event'` rows with 409 `ERR_EVENT_INVITATION` since 2026-08-27, because the event accept path owns menu/caps/agreement and never sets `approved`) · `markets/[id]/schedules/route.ts` (read / bulk update / single toggle) · `markets/[id]/agreement-status/route.ts` · `markets/[id]/prep/route.ts` · `booth-groups/[groupId]/cancel/route.ts` ⚠ (self-cancel a paid season booth — **credit-first, no Stripe**: full credit before season start, remaining weeks minus a **25% penalty** after).

### Listings (3)

`listings/[listingId]/publish/route.ts` (server-side `canPublishListings` gate before `draft → published` — replaced an ungated client call; requires verification, permits/docs, `stripe_payouts_enabled`, onboarding or partner agreement) · `listings/[listingId]/images/route.ts` (CRUD + reorder) · `listings/[listingId]/markets/route.ts` (tier-limited market assignment).

### Market boxes (6)

`market-boxes/route.ts` · `market-boxes/[id]/route.ts` · `market-boxes/pickups/route.ts` · `market-boxes/pickups/[id]/route.ts` · `market-boxes/pickups/[id]/skip/route.ts` · `market-box-image/route.ts`. Creation and activation gated by `canCreateMarketBox` / `canActivateMarketBox`. Billing lives in [15_MarketBoxes_Subs.md](15_MarketBoxes_Subs.md).

### Profile, images, onboarding (11)

`profile/route.ts` · `profile/certifications/route.ts` · `profile/certifications/upload/route.ts` · `profile-image/route.ts` · `cover-image/route.ts` · `onboarding/status/route.ts` (**owns the `canPublishListings` criteria**, `:220-224`) · `onboarding/documents/route.ts` · `onboarding/category-documents/route.ts` · `onboarding/coi/route.ts` · `onboarding/acknowledge-prohibited-items/route.ts` · `tutorial/route.ts`. `onboarding/acknowledge-pickup-line/route.ts` (2026-08-29 — records `profile_data.pickup_line_acknowledged_at`: the vendor agrees to run a SEPARATE, signed pickup line for in-app orders; `onboarding/status` gates submit-for-approval on it for new vendors and the dashboard shows `PickupLineAcknowledgment` as a reminder to established ones; `[vertical]/vendor/pickup-signs` renders the standardized branded "APP ORDER PICKUP" sign for 8.5×11 / 11×17 printing) ·

### Events (6)

`events/[marketId]/route.ts` · `events/[marketId]/respond/route.ts` · `events/[marketId]/prep/route.ts` · `events/[marketId]/message/route.ts` · `events/[marketId]/cancel/route.ts` (6-step cascade: update `market_vendors`, remove `event_vendor_listings`, notify admin, email organizer, auto-escalate to a backup vendor with a 24-hour window, flag score impact if under 72 hours out) · `event-readiness/route.ts`.

### Analytics (5)

`analytics/overview` · `trends` · `top-products` · `customers` · `tax-summary`. All read-only; window and export gated by `getAnalyticsLimits()` (`vendor-limits.ts:132`). **`tax-summary` is financially load-bearing** — vendors file taxes from it.

### Everything else (10)

`checkins/route.ts` · `checkins/log/route.ts` · `location-insights/route.ts` (tier-gated) · `market-stats/route.ts` · `home-market/route.ts` (cooldown via `canChangeHomeMarket`) · `favorites/route.ts` · `referrals/route.ts` · `reviews/route.ts` · `feedback/route.ts` · `quality-findings/route.ts`.

## Library

| File | Purpose |
|---|---|
| `lib/vendor/getVendorProfile.ts` | `getVendorProfileForVertical<T>()` — the vendor auth primitive |
| `lib/vendor/tax-notice.ts` | Texas sales-tax advisory copy by vertical/category. Copy only, not tax calculation |
| `lib/vendor/event-readiness-validation.ts` | Pure validator for the private-event readiness questionnaire; FT uses vehicle types (5–80 ft), FM booth setups (4–40 ft) |
| `lib/vendor-limits.ts` ⚠ | The tier/entitlement boundary (583 lines). `free → pro ($25/mo) → boss ($50/mo)`; `normalizeTier()` maps legacy names (`basic/standard/premium/featured`) to `free` (`:30-35`); usage counters and `can*` gates. **`TRIAL_SYSTEM_ENABLED = false` (`:24`)** — the 90-day trial was **retired** (owner decision 2026-07-18), cron phases 10a/10b/10c skip trial processing, the vendor service agreement's trial clause was removed, and `TrialStatusBanner` was deleted. `vendor_profiles.trial_ends_at` / `trial_grace_ends_at` remain as historical data on legacy rows — do not build new behavior on them |
| `lib/orders/checkout-helpers.ts` | Pure helpers: `buildIdempotencyKey`, `isTippingEnabled` (food trucks only, `:52-54`), `isExternalPayment`, `shouldCallStripeRefund`, `EXTERNAL_PAYMENT_METHODS` (`:15`) |
| `lib/orders/status-transitions.ts` | The spec module — see below |

## The spec module that isn't wired in (VOR-11)

`lib/orders/status-transitions.ts` declares the intended state machine — `isValidOrderTransition`, `isValidItemTransition`, terminal-status lists. **It has zero production imports.** A repo-wide search for the module path and for every exported symbol returns hits only in its test files and in `.claude/` documentation.

Worse, **the live routes contradict it.** The spec's `VALID_ITEM_TRANSITIONS` (`:88-95`) does not permit `pending → fulfilled`, but `fulfill/route.ts:491` explicitly allows it, with a comment at `:482` naming VOR-11 directly. The spec declares `fulfilled` terminal (`:92`) while the routes only block `fulfilled` in reject.

Roughly 51 green tests exercise this module across two suites, which makes it **the largest single source of false confidence in the test suite** — the tests pass, and they are testing a module nothing calls.

**This is an open, tracked decision** (backlog): either wire `isValidItemTransition` into the routes (a real behavior change, riskiest in `resolve-issue`), or rewrite the spec to match sanctioned reality and stop calling it a spec. Do not "fix" it casually.

## Protected & money-touching files

**Tier 1 — moves real money.** `orders/[id]/fulfill` ⚠ · `orders/[id]/reject` ⚠ · `orders/[id]/resolve-issue` · `orders/[id]/confirm-external-payment` ⚠ · `orders/[id]/confirm-handoff` (dormant) · `fees/pay` · `markets/[id]/book`, `book-season`, `book-park-spot` · `park-occurrences/[bookingId]/pay` · `booth-groups/[groupId]/cancel` · `stripe/onboard` · `subscription/downgrade-free` · `tier/downgrade` · `vendor/payouts/route.ts` ⚠.

**Tier 2 — gates or reports money.** `lib/vendor/getVendorProfile.ts` (a wrong profile pays the wrong vendor) · `lib/orders/checkout-helpers.ts` (idempotency keys) · `lib/vendor-limits.ts` ⚠ (paid entitlements) · `stripe/status` · `fees/route.ts` · `analytics/tax-summary` · `listings/[listingId]/publish`.

## UI

**Pages** — all under `app/[vertical]/vendor/`; there is no `app/vendor/` directory. Hub: `dashboard/page.tsx` (~1,380 lines), `dashboard/orders/`, `orders/`, `dashboard/stripe/` (+ `complete/`, `refresh/`), `dashboard/upgrade/`. Operations: `pickup/`, `upcoming/`, `bookings/`, `park-bookings/`, `markets/`, `markets/[id]/prep/`, `checkins` surfaces, `location-log/`. Catalog: `listings/` (+ `new/`, `[listingId]/`, `[listingId]/edit/`), `market-boxes/` (+ `new/`, `[id]/`, `[id]/edit/`). Insight: `analytics/`, `insights/`, `quality/`, `reviews/`, `referrals/`, `surveys/`, `survey/[surveyId]/`. Events: `events/[marketId]/` + `prep/`. Profile: `edit/`, `prohibited-items/`. Public: `vendor/[vendorId]/profile/`, `vendor/[vendorId]/schedule/`. Signup: `vendor-signup/` + `success/` (plus a top-level redirect shim).

**Components** — `components/vendor/` (41 files). Orders: `OrderCard` (since 2026-08-25 also shows the customer's standing chip — "New customer" / "Regular · 4 orders" / "Local Legend" — from `customer_segment` on `api/vendor/orders`, classified by `lib/loyalty/segments.ts` over FULFILLED orders at this vendor), `OrderStatusBadge`, `OrderFilters`, `ExternalPaymentBanner`, `PaymentMethodBadges`. Profile/onboarding: `ProfileEditForm`, `ProfileImageUpload`, `CoverImageUpload`, `OnboardingChecklist`, `COISection`/`COIUpload`, `DocumentsCertificationsSection`, `CertificationsForm`, `CategoryDocumentUpload`, `FoodTruckPermitUpload`, `ProhibitedItemsModal`. Booking: `BookBoothForm`, `BookParkSpotForm`, `SeasonBookingSection`, `CancelSeasonButton`, `MarketScheduleSelector`, `PendingMarketInvitations`. Sub-directory `components/vendor/markets/` holds `EventMarketsSection`, `MarketSuggestionSection`, `PrivatePickupSection` plus shared types/utils.
