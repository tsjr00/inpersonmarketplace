# Current Task: Phase E season prepay — finish + ship (NEXT SESSION READ THIS)

**Updated:** 2026-06-26 EOD. **Mode:** Report (default; await goals at kickoff).

---

## ✅ PHASE E — SHIPPED TO PROD 2026-06-27
**Full Phase E season-prepay stack is LIVE on prod** (`8f64c89a..426deff4`, 18 commits; migs 164→165→166→167 applied to prod in order; in-window 9 PM CT push, user-authorized; Vercel green + smoke test passed). Migs moved to `migrations/applied/`; SCHEMA_SNAPSHOT changelog has the prod-push line. Prod baseline is now `426deff4`. Items 1 (vendor cancel + grouped bookings), 2 (manager settlement, OFF-PLATFORM-ONLY v1), 3 (flow-integrity tests), + copy/persistence refinements all live.
**Remaining (future sessions):** season make-up / extend-a-season feature (carries the in-platform settlement credit + redemption-on-make-up-days, dissolves the credit-expiry conflict); Item 4 credit redemption + expiry enforcement (money path); manager-issued monetary refund (backlog); B2 off-platform-settlement E2E (untested — needs a real ended season w/ cancellations).

## 🔧 PHASE E REMAINING BUILD (2026-06-27, SHIPPED) — plan: `phase_e_remaining_build_plan.md`
Full-app code review done (`fullapp_review_research.md`) — only significant gap = Phase E end-of-life actions (known). Settlement design fully locked with user (manager-only + whole-group-vendor-cancel credits; managerReceives base basis; Option A value-first, ZERO platform-fronted cash; make-up-dates first; clean close, no rollover; $100 cap = Option B backlog). Market-box no-cancel = BY DESIGN.
- **Item 1 — DONE, UNCOMMITTED, gates green (tsc 0, lint 0, vitest 1493/1493).** Vendor "Cancel my season" button + grouped season view on `vendor/bookings`, and switched the cancel route credit to the managerReceives base basis. Files: `api/vendor/booth-groups/[groupId]/cancel/route.ts` (credit basis: full→managerReceives, before-start sum of weeks' managerReceives, after-start ×0.75), `components/vendor/CancelSeasonButton.tsx` (NEW client), `app/[vertical]/vendor/bookings/page.tsx` (groups fetch + Season bookings section + one-off list). No migration, no protected/money-path file. **COMMITTED `ab02f90d` + pushed to origin/staging.**
- **Item 2 — DONE, UNCOMMITTED, gates green (tsc 0, lint 0, vitest 1493/1493).** Manager season-end settlement (value-first, migration-free). NEW route `api/market-manager/[marketId]/seasons/[seasonId]/settlement` (GET per-group cancelled-days vs cap + per-day-prorated owed value; POST resolve = rollover_credit [booth_credits season_settlement] OR off_platform [0-amount marker]; auto-flips season status→settled when all shortfalls resolved). NEW `components/market-manager/MarketSeasonSettlementCard.tsx` (self-fetch, ended-unsettled seasons only). +notif type `booth_season_settled_vendor` (tripwire 82→83, user-approved). Dashboard wired after season card. Per-day proration: owed = max(0,cancelledDays−cap) × (total_manager_cents ÷ (week_count × activeDaysPerWeek)). DEFERRED to Item 4: make-up-dates (needs add-special-date), distinct season_upgrade source. **COMMITTED `dad58f4a` + pushed to origin/staging.**
- **Item 3 — DONE.** Added `describe('Phase E season flow integrity')` to `flow-integrity.test.ts` — 8 static contract tests. **COMMITTED `0ba78e84` + pushed to origin/staging.**
- **Item 2b — copy + off-platform-only trim, UNCOMMITTED, gates green (tsc 0, lint 0, vitest 1501/1501).** Two refinements after staging review:
  - **Vendor copy (no-cash-refund clarity, user feedback):** `CancelSeasonButton.tsx` dialog now leads "Cancelling does NOT refund money to your card — no monetary refund through the platform" + credit-only/no-cash-value/market-scoped/expires-at-season-end; success line says "(credit only — not a cash refund)". `SeasonBookingSection.tsx` bolds non-refundable disclosure at point of purchase.
  - **Item 2 trimmed to OFF-PLATFORM ONLY:** removed the in-platform "Grant credit" (rollover_credit) path from the settlement route + card. Route POST accepts only `off_platform` (0-amount marker row); card shows one "Settled off-platform" action. GET still shows owed value so the manager knows the magnitude.
- **DECISIONS (user, 2026-06-27):** (1) vendor-cancel credit **expires at season end** (enforcement + redemption = Item 4). (2) **In-platform settlement credit DEFERRED to the season make-up / extend-a-season feature** — a cancelled day is made up with a real date there, giving credits runway + somewhere to spend, which dissolves the "credit born at season-end vs expires at season-end" conflict. Off-platform is the v1 escape hatch for heavy-cancellation seasons. (3) **Manager-issued monetary refund** → backlog (deliberate credit-first exception, needs reverse_transfer plumbing + platform-risk handling).
- **Next:** prod push (Items 1–3 + 2b, 9 PM–7 AM CT, user call, after staging verification). Item 4 (credit redemption + expiry enforcement) + the season make-up/extend feature (which carries in-platform settlement credit) = future sessions.

## ⭐⭐ NEXT SESSION — START HERE (handoff for 2026-06-27)

### State in one paragraph
Phase E (booth **season/partial prepay**, week-grain, credit-first settlement) is **built + payment-safe + UX-polished, ALL on `origin/staging`, NOTHING on prod.** Migrations **164→165→166→167 applied Dev+Staging only** (prod pending). Season prepay is **verified working end-to-end on staging** (manager creates+opens a season → vendor sees "Reserve a whole season" → pays once → ONE Stripe destination charge). Prod baseline = `8f64c89a` (migs 159–163 already on prod). Everything below is the Phase E stack on top of that.

### Staging commit stack (Phase E, oldest→newest), all ahead of prod
`83c01879` design finalize · `b5160ada` backend booking (migs 164/165) · `7e9c991b` season UI (manager card + vendor picker) · `09166e75` settlement backend (mig 166 booth_credits + cancelled-days + vendor self-cancel route) · `a2d66e1d` docs · **`a9e7705f`** payment-safety (mig 167 + webhook atomic confirm + cron Phase 18 reconcile) · **`4ba7dab6`** season-date sync warning (admin vs manager dates) · **`d631c535`** manager Stripe-readiness UX + one-line season checkout. Bold = this session.

### Migrations — apply to PROD in this order with the push (additive, low risk)
**164** (market_seasons, booth_booking_groups, weekly_booth_rentals.group_id, markets.schedule_confirmed_at) → **165** (book_season_atomic) → **166** (booth_credits) → **167** (confirm_season_paid + cancel_season_group). All have ROLLBACK blocks; SCHEMA_SNAPSHOT changelog current.

### Verified working on staging ✅
Season create (incl. schedule-confirm gate) → open pre-sales → vendor picker → pay → ONE charge with consolidated line; webhook flips group+children paid. Manager Stripe "Action required" recovery path exists (was the unblock for a verification-failed account).

### Needs user verification on staging ⬜ (quick)
The 3 UX fixes from this session: (a) season card "payment setup incomplete" warning on a non-Stripe-ready market; (b) Stripe card "Action required → Continue verification" (vs old stuck "Under review"); (c) single-line season checkout. Plus a clean vendor season purchase once Westgate (e33b5b54) Stripe charges are enabled.

### NEXT SESSION — work remaining (priority + size; estimates)
1. **Vendor "Cancel my season" button** — **S**. Backend route already exists (`api/vendor/booth-groups/[groupId]/cancel`); pure UI on the vendor bookings page (button + ConfirmDialog + show credit result).
2. **Manager season-end settlement panel** — **M**. New manager route + ManagerCard + 2 notif types; writes `booth_credits` (table exists, no migration, no money path). ⚠️ OPEN DESIGN Q: how "booth upgrade" is recorded (note vs ledger row) — decide at kickoff.
3. **Flow-integrity tests (season path)** — **S–M**. Add to `flow-integrity.test.ts`: checkout→webhook→children-paid; reconcile confirms/cancels; settlement→ledger.
4. **Credit redemption at booking** — **L, own session**. ⚠️ MONEY PATH (`payments.ts` protected, per-file approval). Needs the platform-spread accounting DESIGNED FIRST (how credit interacts with 6.5%+$0.15 split + the manager transfer), then careful build + tests.
5. **PROD PUSH** — **M (coordination)**. Apply migs 164→165→166→167 in order → push the Phase E stack (`b5160ada..d631c535`) in the **9 PM–7 AM CT** window → verify Vercel green → smoke test.

**KICKOFF DECISION:** finish the rest of the build (items 1–3) THEN push everything to prod as one complete feature — OR push what's on staging now (booking + safety + UX is coherent/safe; settlement is end-of-season manager work, not time-critical) and build settlement after. Lean: finish 1–3 + push; treat #4 (credit redemption) as its own design-first session.

### Backlog (not urgent, independent)
- **Phase E settlement Option B (balance-limited cash-out)** — v1 ships Option A (value-first, ZERO platform-fronted cash; see `phase_e_remaining_build_plan.md`). Revisit later: optionally let the platform pass through up to $100 cash to a vendor at season close, pulled from the manager's *verified current Connect balance* in the same step (net-zero float). Only worth it if managers commonly hold balance at close. Needs Stripe balance-check + reverse_transfer/transfer plumbing.
- **Browse `event_end_date` RPC error** — Playwright web-server logs `[browse] availability RPC failed: column m.event_end_date does not exist`. ODD: `markets.event_end_date` DOES exist (SCHEMA_SNAPSHOT:714) → likely a stale DB function or alias issue; unsized until root cause found.
- **Two flaky tests** (S–M): `rate-limit.test.ts` (timing/Redis), `subscription-lifecycle.integration.test.ts` (DB connectivity) — pass on isolated re-run, cause spurious pre-commit chain failures.
- **Comprehensive-review lesser items** (`comprehensive_review_research.md`): `/api/markets` optional vertical filter (S); market-box payout uses `console.error` not `logError` (S, observability); refunds have NO auto-retry (M — payouts do, refunds don't; all logged though).

### Key gotchas / anchors (so next session doesn't re-derive)
- **Booth booking requires the MARKET's own Stripe Connect** charge-enabled (`markets.stripe_charges_enabled=true`) — SEPARATE from vendor product-sale Stripe and from "market accepts orders." Booth checkout pays the market's `stripe_account_id` as destination. Book page gates on this (`book/page.tsx:180`); vendor seasons API too (`vendor/.../seasons/route.ts:32`). NO manager-approval gate on booth booking (open marketplace, `book/page.tsx:140-143`).
- **Season + vendor booking must be the SAME market.** A market id can exist in Dev/Staging with the same value — don't assume. Manager dashboard URL contains the marketId; the season lives on whatever market that dashboard is for. (This session: season was on **Westgate e33b5b54**; testing happened on **Amarillo 98b55c73** — different markets — which caused a long false chase.)
- **`isMarketManager`/`getMarketManagerState`** (manager-auth.ts) = dual-key (`manager_user_id`==user.id OR `manager_email`==user.email) AND `manager_status='active'`. Dashboard layout + every manager API route use it identically; ERR_AUTH_002 from a manager API = that account isn't that market's manager.
- **Phase E confirm/cancel are atomic RPCs** (mig 167): webhook calls `confirm_season_paid` (idempotent, throws→Stripe-retry); cron Phase 18 reconciles pending groups vs Stripe (confirm if paid / cancel if orphan/expired) + `cancel_season_group` refuses to cancel a paid group.
- **Season children never carry `stripe_checkout_session_id`** (it's on the group) — that's why Phase 16 now excludes `group_id IS NOT NULL` and Phase 18 handles grouped rentals.
- **Fee math lives ONLY in `pricing.ts`**; child rental `status` is the source of truth; credit-first settlement = `booth_credits` ledger only (no Stripe clawback).

### Docs
Plan/design: `phase_e_booth_granularity_prepay_plan.md` (O1–O6) + `phase_e_season_payment_safety_plan.md` (F1–F3 fix). Review: `comprehensive_review_research.md`. Detailed per-fix notes for this session are in the dated blocks below.

---

## 🔧 PHASE E PAYMENT-SAFETY FIX (2026-06-26, IN PROGRESS — comprehensive-review follow-up)
Review found a 3-part gap in the season-prepay confirmation path (staging-only, pre-prod). Plan: `phase_e_season_payment_safety_plan.md`. Research: `comprehensive_review_research.md`.
- **F1 (HIGH):** expire-orders Phase 16 cancelled paid/in-flight season children (children never carry `stripe_checkout_session_id` — it lives on the group). **F2 (MED):** webhook child-flip failure left group/children permanently divergent (group idempotency guard blocked the retry). **F3 (MED):** no recovery if the webhook never arrives.
- **DONE this session — gates green (tsc 0, lint 0 err, vitest 1493/1493):**
  - mig **167** `confirm_season_paid` + `cancel_season_group` (atomic, `FOR UPDATE`, REVOKE PUBLIC/anon + service_role only) — **APPLIED Dev+Staging 2026-06-26**; SCHEMA_SNAPSHOT changelog updated. Prod PENDING (apply AFTER 164→165→166).
  - `lib/stripe/session-status.ts` (new) — `getSeasonCheckoutSessionState` (imports the shared stripe client from `stripe/config`; `payments.ts` untouched).
  - `lib/markets/season-notifications.ts` (new) — `sendSeasonPaidNotifications` shared helper (best-effort, never throws).
  - `expire-orders/route.ts`: Phase 16 both cohorts now `.is('group_id', null)` (F1); new **Phase 18** group-aware reconciliation — orphan(no-session,>30m)→cancel; has-session→ask Stripe→confirm+notify / expired→cancel; budget 25 Stripe lookups/run (F3).
  - **C3 `webhooks.ts` (PROTECTED) — DONE** (user-approved per-file 2026-06-26): `handleSeasonBoothCheckoutComplete` now calls `confirm_season_paid` RPC (throws on real error → 500 → Stripe retry; handles already_paid / cancelled_conflict) + `sendSeasonPaidNotifications` shared helper. Gates re-run green (tsc 0, lint 0 err, vitest 1493/1493).
- **COMMITTED + PUSHED TO STAGING 2026-06-26** as `a9e7705f` (main + origin/staging both at it; prod untouched). Pre-commit vitest 1493/1493 (one flaky retry on `rate-limit.test.ts` — timing-based, unrelated), pre-push build 32.8s + Playwright 49 passed.
- **REMAINING:** user runs 4-test staging plan once Vercel deploys (1: book+pay → group+children paid; 2: book+abandon → Phase 18 cancels; 3: missed-webhook → POST cron → Phase 18 reconciles+confirms+notifies; 4: one-off rental still expires via Phase 16). After staging confirmed → prod push bundles mig **167** AFTER 164→165→166, then code, 9 PM–7 AM CT.
- **Side observation (pre-existing, NOT this change, unverified root cause):** Playwright web-server logged `[browse] availability RPC failed (page slice): column m.event_end_date does not exist` — browse availability RPC references a column that doesn't exist; page falls back. Worth a separate look.

## 🔧 SEASON-DATE SYNC WARNING (2026-06-26, BUILT — awaiting commit OK)
Manager Phase E "Season pre-sales" card now warns when its dates differ from the admin-set `markets.season_start/end` (the availability gate that controls buyer ordering via `get_available_pickup_dates` → `validate_cart_item_schedule`, verified mig 162:88-89). Selling booth weeks outside the admin season = vendors can't make sales. Scope **1b + 2b** (user-approved): warning at create-entry AND on each out-of-sync existing season row (with both date ranges + contact-admin prompt), plus an **acknowledgment checkbox gating "Open pre-sales"** when out of sync. Advisory (manager can't edit admin dates). Files: `components/market-manager/MarketSeasonCard.tsx` (rewrite: helpers `datesOutOfSync`/`fmtRange` + `SeasonSyncWarning` + per-row ack state), `dashboard/page.tsx` (pass `adminSeasonStart/End` props). Gates: tsc 0, lint 0, vitest green (rate-limit + subscription-lifecycle integration tests are FLAKY — pass on isolated re-run; NOT related). No API/migration/money-path/protected-file touched.
- **Flaky-test pattern worth separate stabilization:** `rate-limit.test.ts` and `subscription-lifecycle.integration.test.ts` intermittently fail in the full-suite/pre-commit run (DB-connectivity / timing dependent) but pass on isolated re-run. Causes spurious pre-commit chain failures requiring a retry.

## 🔧 MANAGER STRIPE-READINESS UX + SEASON CHECKOUT LINE (2026-06-26, BUILT — gates green tsc0/lint0/vitest1493)
Surfaced while user tested season prepay end-to-end on staging (worked: manager creates/opens season → vendor sees picker → pays → ONE Stripe charge with weekly line items). Three fixes (user-approved 1b+2b style):
- **Season pre-sales card** (`MarketSeasonCard.tsx` + dashboard passes `stripeChargesEnabled`): amber warning when `markets.stripe_charges_enabled !== true` — "Payment setup incomplete — vendors can't book yet." (Manager can create a season with no working payment path otherwise, no signal.)
- **Stripe Connect card** (`MarketStripeConnectCard.tsx`): NEW `action_required` state. `classifyStatus` now inspects Stripe `requirements` (past_due/currently_due/errors/disabled_reason≠pending_verification) and shows "Action required" + **"Continue verification"** button (runs existing onboard flow) instead of a stuck "Under review". Root incident: a verification-failed account (`verification_failed_keyed_identity`, doc past_due) was mislabeled "under review · you don't need to do anything" with no recovery path → manager stuck, market couldn't take booth payments.
- **payments.ts (PROTECTED, user per-file approved)**: `createSeasonBoothCheckoutSession` collapses the per-week line items into ONE consolidated line ("Booth season — <market> · N weeks (range)"). **Money-neutral**: unit_amount = sum of weeks' vendorPaysCents (identical total); `transfer_data.amount` unchanged; webhook reads metadata/group_id not line items.
- **Pending:** commit + push staging (next). Then user re-verifies on staging. Rides to prod with the Phase E push (no migration in this batch).

## ⭐ PHASE E — SEASON PREPAY: NEXT-SESSION HANDOFF (updated 2026-06-25) — READ FIRST

**Status:** Phase E ~80% built. **Everything is on `origin/staging`; NOTHING on prod.** Migs 164/165/166 applied **Dev+Staging only**. Full design + all decisions O1–O6: `apps/web/.claude/phase_e_booth_granularity_prepay_plan.md` (§8 decisions, §10 verifications).

**What Phase E is:** booth **season + partial prepay** at **week grain**. A `booth_booking_groups` parent ties N existing `weekly_booth_rentals` (each child carries `group_id`; **one-off rentals = `group_id` NULL, untouched**), paid in ONE Stripe destination charge; the webhook flips the group + all children to paid by `group_id`. **Credit-first settlement** — money never moves backward through Stripe.

### ✅ DONE + on staging (each commit passed lint+tsc+vitest+build+Playwright)
- **Backend booking** — commit `b5160ada`: migs **164** (`market_seasons`, `booth_booking_groups`, `weekly_booth_rentals.group_id`, `markets.schedule_confirmed_at`) + **165** (`book_season_atomic` — loops the existing `book_weekly_booth_atomic` in ONE tx = all-or-nothing); helpers `lib/markets/season-weeks.ts` (week enumeration) + `season-booking.ts` (orchestration → totals via pricing.ts); **money path** `payments.ts createSeasonBoothCheckoutSession` + `webhooks.ts handleSeasonBoothCheckoutComplete` (**critical-path**); notif types `booth_season_paid_vendor/_manager` (tripwire **82**); route `POST api/vendor/markets/[id]/book-season`.
- **UI** — commit `7e9c991b`: manager API `api/market-manager/[marketId]/seasons` (GET/POST/PATCH); vendor GET `api/vendor/markets/[id]/seasons`; `components/market-manager/MarketSeasonCard.tsx` (dashboard "Season Pre-sales" card + JumpNav "Seasons"); `components/vendor/SeasonBookingSection.tsx` (booth-booking page "Reserve a whole season").
- **Settlement backend** — commit `09166e75`: mig **166** `booth_credits` ledger (balance = `SUM(amount_cents)` per vendor+market); `lib/markets/cancelled-days.ts` (`getGroupCancelledDays`); `api/vendor/booth-groups/[groupId]/cancel` (O5 self-cancel → credit).

**Test on staging:** Manager → dashboard "Season Pre-sales" → create season → "Open pre-sales". Vendor → `/[vertical]/markets/[id]/book` → "Reserve a whole season" → Stripe → webhook flips paid.

### ⬜ REMAINING (next session, priority order)
1. **Manager season-end settlement panel** (UI): when `getGroupCancelledDays(group)` > `market_seasons.refund_cap_days`, offer **rollover-credit / booth-upgrade** (O4); write `booth_credits` source=`season_settlement`.
2. **Credit redemption at booking**: apply a vendor's `booth_credits` balance to reduce vendorPays AND the manager transfer. **⚠️ TOUCHES THE MONEY PATH** (`payments.ts` season checkout + group totals) → **per-file approval + exact diffs**. Trickiest piece — do it carefully.
3. **Vendor "Cancel my season" button**: on the `vendor/bookings` page → `POST api/vendor/booth-groups/[groupId]/cancel`; show the credit result.
4. **Flow-integrity tests**: season-checkout→webhook→children-paid; settlement contracts.
5. **Fast-follows:** partial-week picker UI (backend already supports `week_start_dates`); confirm after-start penalty % (currently **25%**, plan §8 TBC).
6. **PROD PUSH:** apply migs **164→165→166 in order** to Prod, then push Phase E commits (`b5160ada`, `7e9c991b`, `09166e75`) in the **9 PM–7 AM CT** window + smoke test. (Phase C/D already on prod.)

### Gotchas / how it works (so next session doesn't re-derive)
- **Fee math lives ONLY in `pricing.ts`** (`calculateBoothRentalFees`, per-week rounding). The RPC returns snapshot prices; the app computes totals. Never duplicate fee math in SQL.
- **Child rental `status` is the source of truth** — every existing `status IN (pending_payment,paid)` query still works; group status is separate/denormalized.
- **Credit-first** = `booth_credits` ledger only; NO Stripe `reverse_transfer` (cash refund deferred). Redemption discounts a future booking (manager already holds the cash).
- **Dates:** parse plain DATE as local-midnight / UTC to avoid the off-by-one (the bug fixed at the start of this session).
- **O6 presale window** enforced in the manager seasons route: 60-day lead cap; `uq_market_seasons_one_open` partial index = one-season-ahead; auto-close = `start_date + 14d`.
- **Verified anchors:** rental unit `mig 139:59-84`; price-per-size `mig 134:31`; one-off atomic RPC `mig 142`/`146`; booth destination charge `payments.ts:332-347`; cutoff/day coupling `mig 109:135,154`.

### ⚠️ Process note for next session
The terminal **locked up twice** this session on **huge outputs** (a skill schema dump; 40–55 KB build logs). Keep tool outputs tight, route big content to files, and start fresh for clean context + a responsive terminal.

---

## ⭐ LATEST CHECKPOINT (2026-06-24) — READ FIRST

**✅ SHIPPED TO PROD 2026-06-24.** The full Phase C/D + vendor-categories stack (14 commits `528cbba3..8f64c89a`, migs 159–163) is **live on prod** — user-authorized out-of-window push, Vercel green, smoke test passed. migs 159–163 applied to all 3 envs; files moved to `migrations/applied/`; snapshot changelog updated. Bookkeeping commit pending below. The detailed sections below describe the stack as it was built/verified on staging.

**Deferred / next:** Phase D attendance CSV export (optional fast-follow); pickup-date display off-by-one (logged follow-up, UTC formatter — data correct); Phase E (season prepay, design-first) is the next major growth phase. Notification tripwire = 80.

### Staging stack (commits since prod `528cbba3`, oldest→newest)
Vendor-categories Part A (`a7543556` footer, `96620976` survey CSV, `5a634414` Part A foundation, `88847bbd` front-gate) → `1bbad153` Phase D check-ins → `d5615550` Phase C cancel-a-day → `2a936141` Option B (market-box skip cancelled) → `932ecf29` geo reliability → `3133bdab` geo feedback → `3517b9aa` cancel-date refund fix #1 → `b290f93f` temp diagnostic → `855f55eb` cancel-date refund fix #2 → `a00f4067` status/notification fixes.

### Migrations pending PROD (apply in order before/with the push)
**159** (vendor_profiles production_category + sell_eligible) · **160** (market_day_checkins) · **161** (market_date_overrides) · **162** (get_available_pickup_dates +NOT EXISTS cancelled) · **163** (create_market_box_pickups skip cancelled). All applied Dev+Staging; SCHEMA_SNAPSHOT changelog current.

### Verification status (staging)
- **Phase D check-ins** ✅ tested (check-in + geolocation, after the geo fixes). Vendor check-in button is INLINE in the dashboard "Manage Locations" card, only on a day the market operates.
- **Phase C cancel-a-date** ✅ availability filter (product date drops), ✅ market-box credit, ✅ re-cancel 409 guard, ✅ **buyer auto-refund** (after the two stacked bug fixes below — verified: "2 buyer items refunded" + Stripe refunds, per-item idempotency proven on same-price items).
- **Option B** ✅ verified (Amarillo-cancel didn't touch Westgate boxes; scoping correct).
- **Status/notification fixes (`a00f4067`)** ⬜ user about to verify: buyer order detail reads neutral for system-cancel; product-vendor notification on next fresh cancel.

### The cancel-date bug saga (all fixed — root cause was swallowed Supabase errors)
1. **Refund bug #1** (`3517b9aa`): status filter included `'paid'`, which is NOT an `order_item_status` enum value (it's an ORDER status) → query threw invalid-enum → swallowed by `items ?? []` → 0 refunded silently. Fix: filter `pending|confirmed|ready` + throw on query error.
2. **Refund bug #2** (`855f55eb`): `cancelled_by='market'` violated `order_items_cancelled_by_check` (allows `buyer|vendor|system`) → UPDATE 400 → swallowed by `if (!updated) continue` → 0 refunded silently. Found via an instrumented Vercel-log test (GET order_items 200, PATCH order_items 400). Fix: `cancelled_by='system'` (a market-day cancel IS a platform action; `cancellation_reason` distinguishes from cron-expiry) + throw on update error + harden payment lookup. **Lesson: every swallow-spot (`data ?? []`) in the cascade now throws/logs.**
3. **Display bug** (`a00f4067`): buyer order detail mislabeled a `system` cancellation as "You cancelled this item" / "{vendor} was unable to fulfill." Fix: added `system` case to the per-item label + Stripe banner with neutral i18n (`order.cancelled_system`, `order.banner_cancelled_system_refund`, en+es).
4. **Notification gap** (`a00f4067`): the product-order vendor whose order was cancelled got NO notification (every other cancel path notifies the counterparty). Fix: cascade collects vendor user_ids; route fires new `market_date_cancelled_order_vendor`. **Notification tripwire now 80** (was 77 at session start: +buyer/+vendor=79, +order_vendor=80).

### Remaining
- **User verifies** `a00f4067` (buyer display reads neutral; vendor notif on next cancel).
- **Phase D attendance CSV export** — deferred fast-follow (reuse `lib/export-csv.ts`), optional, would close Phase D.
- **PROD PUSH** — coordinated: apply migs 159–163 to Prod in order → `git push origin main` in 9PM–7AM CT window → Vercel green → smoke test. Sizable (≈12 commits + 5 migs).

### Logged follow-up (NOT fixed — separate from cancel work)
- **Pickup-date display off-by-one**: order-confirmation shows `pickup_date` a day early (a plain `DATE` parsed as UTC midnight, rendered in CT → prior evening). Data is correct (verified June 24 stored); display only. Audit the checkout/confirmation date formatter.

---

## ⭐ Prior checkpoint (2026-06-15/16)

**Prod push DONE:** `528cbba3` shipped to prod 2026-06-15 (the 17-commit growth/design/refund stack + migs 154–158 applied to Prod + the `subscriptionType→type` vendor-upgrade fix). User smoke-testing.

**On `main` but NOT pushed (deferred by user):**
- `a7543556` — FM-only "Market Mgrs." footer link → `/[vertical]/market-manager-program` (on staging, prod push deferred).
- `96620976` — Part B: survey CSV export ("Download CSV" on SurveyResultsCard). COMPLETE. (committed local, unpushed)
- **Part A foundation (UNCOMMITTED at checkpoint → committing now):** mig 159 (`vendor_profiles.production_category TEXT[]` + `sell_eligible BOOLEAN DEFAULT TRUE`) + backstop `sell_eligible` gates at `listings/[id]/publish/route.ts:152` and `market-boxes/route.ts` POST. Both gates are **INERT** (everyone defaults sell_eligible=TRUE). Event selling covered transitively (sales require vendor + published listing).

**Part A — front-gate BUILT 2026-06-16 (uncommitted; decisions R1=Option A, R2=FM-only — see `vendor_signup_impact_research.md`):**
1. ✅ **Signup front-gate** — FM-only production-category question in `[vertical]/vendor-signup/page.tsx` (new early return after login/error, before step-1 form; gate state `productionCategory`/`gatePassed`/`gateBlocked`). Multi-select 4 options; all picks ∈{1,2} → Continue unlocks form; any 3/4 → block screen (Option A copy). `production_category` rides in submit `data` (FM only). food_trucks unchanged.
2. ✅ **`/api/submit`** Option A enforcement — reads `production_category`, hard-rejects (4xx, no profile) if not all ∈{1,2}; else inserts `production_category` + `sell_eligible=true`. FT/absent → DB default. Zod `profileDataSchema` now allows `production_category`.
3. ⬜ Deferred fast-follow: A4 opt-in catalog statement + A5 manager messaging.
- **Gates:** tsc clean, lint 0 errors (3 pre-existing warnings), vitest 1493/1493. Files: page.tsx, api/submit/route.ts, lib/validation/vendor-signup.ts. NOT committed.
- **SHIPPED to staging** as commit `88847bbd` (2026-06-16; mig 159 already on Dev+Staging). **USER-CONFIRMED on staging 2026-06-17:** gate appears + cat 1/2 → form, cat 3/4 → block screen (test 1 ✓); real cat-1/2 signup completes (test 2 ✓); existing FM vendor still redirects to dashboard (test 4 ✓). Test 3 (FT signup unchanged) NOT visually checked — code-guarded by `vertical === 'farmers_market'`, low risk.
- **REMAINING for PROD:** (a) apply mig 159 to Prod; (b) `git push origin main` in 9PM–7AM CT window (ships footer `a7543556` + Part B `96620976` + Part A foundation `5a634414` + Part A front-gate `88847bbd` = local main is 4 ahead of prod `528cbba3`); (c) verify Vercel green; (d) prod smoke test.

## ⭐ GROWTH PHASE D — Vendor Market-Day Check-Ins (BUILT 2026-06-17, UNCOMMITTED)
Design doc: `phase_d_checkins_plan.md`. Decisions: entry on "My Locations" card; capture booth #; manager VIEW access (no counter-sign UI, columns added); ALL attendance paths; geofence **250 m** advisory; today-only; self-attestation + opt-in geolocation.
- **mig 160** `20260617_160_market_day_checkins.sql` — new table + 3 vendor own-row RLS policies + indexes + updated_at trigger. **NOT applied to any env.**
- **Files:** `lib/markets/checkin-eligibility.ts` (helper: eligibility across approved market_vendors + paid weekly_booth_rentals; operates-today via market_schedules DOW / event date range, market-local tz; meters-haversine; RADIUS 250). `api/vendor/checkins/route.ts` (GET today's eligible + status; POST checkin/checkout, self-attest + advisory distance). `api/market-manager/[marketId]/attendance/route.ts` (GET, isMarketManager-gated, date-selectable). `components/vendor/MarketCheckInPrompt.tsx` (in Manage Locations card). `components/market-manager/MarketAttendanceCard.tsx` (read-only attendance, date picker) wired into manager dashboard after broadcast card. Dashboard pages wired.
- **Gates:** tsc clean, lint clean, vitest 1493/1493.
- **DEFERRED fast-follow:** attendance CSV export (reuse `lib/export-csv.ts`).
- **SHIPPED 2026-06-21:** mig 160 applied Dev+Staging (user) + documented in SCHEMA_SNAPSHOT changelog. Phase D committed `1bbad153` → **on staging** (pre-push build + Playwright 49/49 green). NOT on prod. **User to staging-test** (market day → vendor "Manage Locations" check-in button → manager "Vendor attendance" card).

## ⭐ GROWTH PHASE C — Cancel-a-Date (DESIGN COMPLETE + migs drafted, 2026-06-21)
Design doc: `phase_c_date_overrides_plan.md` (fully grounded in verified code; review pass done). Phasing A→B→1B→C→D→E; **C built before E because E's season-prepay cancelled-day counter is fed by cancel-a-date** (decisions.md 2026-06-12).
- **Locked (user 2026-06-21):** v1 = cancel-a-date only (add-special-date deferred); un-cancel = NO (one-way); cancel-ahead window = **8 weeks** (matches booth booking horizon `book/page.tsx:196`); buyer orders → **immediate auto-refund** (reuse reject cascade MINUS `increment_vendor_cancelled` penalty — verified `reject:207`); credit-vs-reschedule = single choice for whole date; market box → **credit** via existing `vendor_skip_week` RPC (skip+extend, verified mig 124).
- **3-path cancel cascade:** buyer product orders → auto-refund (full buyer-paid: subtotal+6.5%+prorated $0.15); paid booth rentals → flag `booth_disposition` credit/reschedule (no money move; feeds E); market-box pickups → `vendor_skip_week` per affected pickup (MB→market linkage via `market_box_offerings.pickup_market_id`).
- **RPC = ONE function (review correction):** `validate_cart_item_schedule` WRAPS `get_available_pickup_dates`, so a single `NOT EXISTS(cancelled override)` filter in get_available_pickup_dates propagates to display + cart + checkout. No re-revoke (it's in mig-149 public-browse allowlist).
- **migs 161+162 APPLIED to Dev+Staging 2026-06-21** (user) + SCHEMA_SNAPSHOT changelog updated. Booth `reschedule` = ADVISORY in v1 (user chose "a"): records reschedule_date + notifies vendor; becomes a real operating date when add-special-date ships.
- **BUILT 2026-06-21 (UNCOMMITTED) — gates GREEN (tsc clean, eslint clean, vitest 1493/1493):**
  - `lib/markets/cancel-date-cascade.ts` — self-contained 3-path cascade (refund buyer orders MINUS `increment_vendor_cancelled` penalty, cancelled_by='market'; flag paid booth renters by week; credit MB pickups via `vendor_skip_week`). Touches NO existing money-path file.
  - `api/market-manager/[marketId]/cancel-date/route.ts` — isMarketManager + ack gate + 8-week/future window → insert override (23505→409) → run cascade → notify buyers+renters (try/catch).
  - `notifications/types.ts` — 2 new types `market_date_cancelled_buyer`/`_vendor` (+ 3 template-data fields). Tripwire bumped 77→79 (`cutoff-and-sort-functional.test.ts:167`, user-approved).
  - `components/market-manager/MarketCancelDateCard.tsx` — date picker + reason + credit/reschedule radio + confirm modal w/ ack checkbox. Wired into manager dashboard after schedule card; ManagerJumpNav +"Cancel day".
  - `components/vendor/BookBoothForm.tsx` — updated stale "closures off-platform" copy → in-app credit/reschedule.
- **NEXT:** user reviews → commit Phase C → push staging → user tests. Prod: migs 161+162 + Phase C code with the next prod push (after Phase D).
- **Deferred follow-up:** add-special-date (status='special') — enables real make-up dates + E's settlement "make-up days".

---

## QUICK STATE FOR NEXT SESSION
Long session. Everything below is on `origin/staging` (15 commits ahead of prod `4fc2356`), all tsc/lint/vitest green, NOT on prod yet. Prod push deferred to a 9PM–7AM CT window.

**Staging commits since prod `4fc2356`:** 12ee9069 (Items1-4), a6056031 (mig153 bookkeeping), eeb847fa (refund/fee F1/F2/F4/F5), 6cd16002 (protected-paths gate), 12b0eb9c (growth-A: visibility+earnings+open-booth cards), 52ab733d (growth-B-follows), f2ed2606 (growth-B-broadcast), 81199f61 (growth-1B suspend/restore+history), 6186f2f7 (type=button dialog-submit fix), ea1fd98d (market_vendors→vendor_profiles embed disambig — fixed broadcast 0-recipients + schedule-change-notifies-nobody), 91b1db08 (managerStatus wired into vertical-admin page + local suspend state), 4b3da05f (mm-design pass 1: sticky jump nav + ManagerCard wrapper + money-font fix).

**USER-CONFIRMED on staging:** refund/tip (F5+F2), Phase A, broadcast (rate-limit+delivery), follows button, suspend/unsuspend. Design pass 1 + help content NOT yet visually reviewed.

## OPEN ITEMS (next session)
1. **mig 158 help-articles seed — APPLIED to Dev + Staging 2026-06-14.** File `supabase/migrations/20260614_158_seed_help_articles_mm_events.sql`: 23 knowledge_articles (Market Managers 11 / Booth Rentals 3 / Events 6 / Joining a Market 3). Dollar-quoted ($art$), columns verified against mig 013 table. SCHEMA_SNAPSHOT changelog marked applied. NEXT: user reviews `/farmers_market/help` + `/food_trucks/help` on staging (events are global → show on both) → ships to Prod with the push. File stays in `supabase/migrations/` until Prod has it.
2. **Design pass COMMIT 2 + broadcast history — DONE 2026-06-14, on staging (pending user visual review).** 16 MM components unified on the `ManagerCard` wrapper (or chrome-aligned where the header is interactive): ManagerSupport/Earnings/Transactions/WeeklyBookings/ActionSummary/BoothOccupancy/Survey/VerificationDocs/StripeConnect/Branding/InviteVendorBrowser converted to `<ManagerCard>`; MarketScheduleCard chrome-aligned in place (interactive Edit/Save header kept); MarketVisibility + OnboardingChecklist keep semantic green/amber, gap aligned to 16px. `ManagerCard.title` widened to ReactNode. **Broadcast history:** new `GET /api/market-manager/[marketId]/broadcast` (manager-auth gated) + "Recent announcements" list in MarketBroadcastCard with "X of N used this week"; result boxes folded onto `statusColors`. Gates: tsc 0, vitest 1493/1493, my files lint-clean (1 pre-existing error in EventRequestForm.tsx:241 — full-CI-lint only, not mine). **OPEN Q for user after staging review:** does the sticky jump-nav overlap any global header (adjust `MANAGER_NAV_OFFSET` in ManagerCard.tsx if so).
3. **PROD PUSH (2026-06-15):** (a) ✅ migration-check on Prod = all 5 pending; (b) ✅ migs 154→155→156→157→158 APPLIED to Prod 2026-06-15 (user-confirmed; snapshot marked all-3-envs; files moved to `applied/`); (c) ⬜ `git push origin main` in the 9PM–7AM CT window (ships `4fc2356..0f1e69d9` + this bookkeeping commit, ~18 commits); (d) ⬜ verify Vercel built green; (e) ⬜ prod smoke test (homepage, login, manager dashboard, small purchase path).
4. **Form-button scan: DONE/clean** (ConfirmDialog + MarketManagerAssignment were the only offenders, both fixed).
5. **Backlog future builds (not this push):** vendor product categories (`vendor_product_categories_concept.md` — Phase 1 exclusivity gate / Phase 2 Option C booth-payment-link / Phase 3 Option B), RM/market-operations growth set, F6 cron N+1, admin-notif on failed refunds.

## DECISIONS LOGGED THIS SESSION (decisions.md): composable roles (stack never merge); season prepay no-subscriptions; (+ vendor categories strict cat1&2, Option C first → B later — in concept doc).

---

# Prior: Session 92 — growth build (A + B + 1B shipped to staging)

**ACTIVE (2026-06-13):** Growth feature build per `growth_build_plan.md` (phasing A→B→1B→C→D→E, hybrid mode). Phases A, B (follows + market-day notif + broadcast), 1B (manager suspend/restore + history) all on staging. Deep-dive findings: `session92_events_mm_growth_research.md`; decisions logged (composable roles, season prepay).

## ⚠️ BEFORE PROD PUSH (tonight, 9PM–7AM CT window) — checklist
1. **SCAN: ConfirmDialog / action buttons inside `<form>`** — grep app for `<form` hosts that contain `ConfirmDialog` or action `<button>`s lacking `type="button"`. Root cause of the manager-card dialog bug (fixed `6186f2f7`): default `type=submit` submits the host form. The `[vertical]/admin/markets/page.tsx` market-edit form was the one found; check for siblings (other admin edit forms, vendor/event forms). Fix any with `type="button"`. (ConfirmDialog's OWN buttons already hardened in `6186f2f7`.)
2. **Verify migration state on Prod** (don't trust memory): which of 153/154/155/156/157 are already on Prod vs pending. Apply pending ones IN ORDER before the code push.
3. **Staging tests cleared:** refund/tip (eeb847fa ✓ F5+F2), Phase A (✓), follows/broadcast/1B (⬜ user to test).
4. Push window 9PM–7AM CT; one coordinated `git push origin main` chain; smoke-test prod critical path after.

Staging stack since prod `4fc2356` (13 commits): 12ee9069, a6056031, eeb847fa, 6cd16002, 12b0eb9c, 52ab733d, f2ed2606, 81199f61, 6186f2f7, ea1fd98d (+ earlier). `6186f2f7` = type=button dialog-submit fix (admin manager card). `ea1fd98d` = market_vendors→vendor_profiles embed disambiguation — fixes broadcast 0-recipients AND a PRE-EXISTING prod bug where schedule-change notifications silently went to zero approved vendors (bare ambiguous embed errored → null). Both found during staging testing of B-broadcast/1B.

**Bugs found+fixed during staging testing (all on staging):** 6186f2f7 dialog-form-submit; ea1fd98d broadcast 0-recipients + schedule-change-notifies-nobody (market_vendors embed); 91b1db08 stuck suspend button (vertical-admin page missing managerStatus prop). Stack now 14 commits since prod.

**CONFIRMED working on staging (user):** broadcast (rate limit + delivery, 2 mgr/vendor combos). **Re-tests open after 91b1db08 deploys:** suspend→Restore button flips + restore works; follows button; schedule-change notifies. Then prod push.

---

# Prior: Session 92 — fresh review fixes (F1/F2/F4/F5) → then Stripe LIVE rotation

**Updated:** 2026-06-11 (Session 92)
**Mode:** Fix (user-approved batch: F1 full version, F2 cap=100, F4 logError now + admin-notif to backlog, F6 to backlog)

## Session 92 plan/state

Fresh end-to-end review done (NO prior audit files read, per user direction). Findings + verification: `apps/web/.claude/session92_fresh_review_research.md`. Error-log review: prod clean; staging = resolved Resend incident + benign auth blip.

**Approved fix batch (one commit → staging):**
- **F5** createRefund idempotency-key collision (payments.ts:245). Fix: required `idempotencySuffix` param; 10 call sites enumerated by grep: cancel:225, expire-orders:228, reject:165, resolve-issue:186, webhooks:237/251/438/453, success:240/257. Suffix = order-item id (order paths) / offeringId (MB paths)
- **F4** failed-refund catches console-only → logError, shared code ERR_REFUND_001 (5 sites): expire-orders:229-236, cancel:233-242, reject:173-180, resolve-issue:191-193, success:262-268. Admin notification → backlog
- **F1** vendor_fee_ledger double-billing: **mig 155** (order_item_id col + partial unique idx WHERE type='debit') + recordExternalPaymentFee gains required orderItemId + 23505→benign no-op; claim-first reorder in cron Phase 3.6 (:556-575) AND confirm-external-payment (:108-148). Callers: confirm-external:109 (item.id), fulfill:188 (orderItem id), cron 3.6:558 (item.id)
- **F2** tipPercentage clamp to 100 (session/route.ts:76)

**⚠️ SEQUENCING:** mig 155 must be applied to Dev+Staging BEFORE staging code push (code inserts order_item_id; old schema would break fee recording). Prod: mig before prod push.

**IMPLEMENTED (uncommitted, 2026-06-11):** all of F1/F2/F4/F5 code + mig 155 file (`20260611_155_vendor_fee_ledger_item_idempotency.sql`). 11 files modified: payments.ts (suffix param), webhooks.ts (4 callers), checkout/success (2 callers + ERR_REFUND_001 catch), reject + resolve-issue + cancel (caller + ERR_REFUND_001 catch each), expire-orders (caller + catch + Phase 3.6 claim-first + ERR_FEE_001), confirm-external-payment (claim-first reorder + item.id), fulfill (item.id arg), vendor-fees.ts (orderItemId param + 23505 no-op), checkout/session (tip pct clamp 100). Critical-path approvals given by user for all 6 protected files. **Gates: tsc clean, vitest 1493/1493 green, lint = 1 PRE-EXISTING error in EventRequestForm.tsx:241 (untouched by this batch; react-hooks/set-state-in-effect — will fail full-lint CI; flag to user).**
**NEXT:** user applies mig 155 to Dev + Staging → verify → commit chain → staging push → user tests → (later, in window) mig 155 to Prod + prod push. Note: untracked `apps/web/src/lib/tax/` dir exists, predates session, untouched.

**DONE 2026-06-12 — Stripe LIVE rotation (Session 92):** `STRIPE_SECRET_KEY` (sk_live) + `STRIPE_WEBHOOK_SECRET` rolled in Stripe (key ~1h grace, webhook ~24h overlap), both deleted + re-created as Sensitive in Vercel Production, ONE fresh redeploy of `4fc2356`. **VERIFIED:** (1) sk_live — buyer-premium upgrade reached live checkout.stripe.com (session created server-side via config.ts:5); (2) webhook secret — completed a real buyer-premium purchase (user's own card → platform account, no vendor needed); tier flipped to premium = event received + signature verified with the new secret + handler processed (old env var deleted, so deployment could only hold the new value — overlap ambiguity eliminated); (3) prod error_logs 1-hour window = zero rows. Old key + old whsec auto-expire. **Follow-ups:** (a) cancel (+ optionally refund) the test premium subscription — RENEWS MONTHLY if left; (b) refresh the LOCAL test-mode STRIPE_WEBHOOK_SECRET in .env.local (value accidentally printed into Session 92 chat — test-mode, low stakes); (c) remaining rotation backlog: Staging + Dev Supabase service-role (+ 3 GitHub Actions CI secrets with Staging), sk_test Stripe keys (low stakes).

---

# Prior: Session 90 — full review + audit fixes (Items 1-4)

**Updated:** 2026-06-10 (Session 91 — Prod Supabase service-role rotated + verified; full codebase review done)
**Mode:** Fix (audit-fix batch + secret rotation)

> **NEXT SESSION — quick state:** Secret rotation is the active work. **DONE (rotated + verified):** Twilio, CRON, Resend (incl. prod), Google Vision, Upstash token, **Prod Supabase service-role** (Session 91 — migrated Prod to new sb_publishable/sb_secret keys + disabled legacy JWT-based keys; verified zero user disruption). **REMAINING:** **Stripe LIVE secret key + webhook secret (Prod) — flagged exposed in Vercel, HIGHEST stakes, rotating Session 91**; Staging + Dev Supabase projects (Staging also needs the 3 GitHub Actions CI secrets updated, since CI runs against Staging). Stripe price IDs + publishable key = not secrets (no action). CI does NOT use Stripe (ci.yml only injects Supabase vars). Plus: bookkeeping commit `a6056031` is local-only/unpushed (E2E flake), and Items 1-4 (`12ee9069`) await USER staging-test before prod. Details below in the "Secret Rotation" section. The `current_task.md` edits + `a6056031` are uncommitted/unpushed.

## Session 90 status

Full code/systems review done (findings + verification in `apps/web/.claude/session90_review_research.md`). User approved fixing Items 1-4; all implemented + tsc clean + lint clean (2 pre-existing warnings only). NOT committed yet (staging-first pending user approval).

**Implemented (uncommitted):**
- **Item 1 (data integrity, HIGH)** — market_schedules hard-delete → soft-upsert (composite day+start+end key, decision B). Files: `api/admin/markets/[id]/route.ts` (2A), `api/vendor/markets/[id]/route.ts` (2B, also fixed latent HH:MM vs HH:MM:SS key mismatch), `api/markets/[id]/schedules/[scheduleId]/route.ts` (2C → active=false). Supporting: `app/admin/markets/[id]/page.tsx` (filter activeSchedules), `ScheduleManager.tsx` (copy), `api/markets/[id]/schedules/route.ts` POST (reactivate-or-insert). Relies on existing `active` col + trigger_market_schedule_deactivation. RLS update policy verified (mig 004:255).
- **Item 2 (security, MED)** — strong event_token in `lib/events/event-actions.ts` (crypto randomBytes, additive — existing tokens valid). Defense-in-depth already satisfied (state guards select:201-266; tokens not logged).
- **Item 3 (security, LOW)** — `api/market-boxes/route.ts` vertical_id filter now required + friendly 400.
- **Item 4 (UI)** — confirm()→ConfirmDialog (VendorActivityClient), alert()→Toast pattern (both UsersTableClient variants, mirrors ListingsTableClient).

**Done:** Items 1-4 committed + pushed to staging (commit `12ee9069`, pre-push build+Playwright green). Doc-line CLAUDE_CONTEXT.md:451 fixed. **mig 153 APPLIED to all 3 envs 2026-06-05** (Dev + Staging + Prod; verified `has_function_privilege('anon',...)`=false on each) → file moved to `applied/`, SCHEMA_SNAPSHOT changelog marked applied.

**Remaining (Items 1-4):** USER to TEST Items 1-4 on staging (now live at `12ee9069`) before any prod push. Bookkeeping commit `a6056031` is LOCAL-ONLY (see rotation section). Prod push only after staging test + approval + 9PM-7AM CT window.

---

## Secret Rotation (Session 90 — 2026-06-06/07)

Context: Vercel flagged ~12 env vars as "value visible to anyone with access." Rotating the real secrets and (where possible) marking Sensitive.

### ⚠️ NEXT — HIGHEST PRIORITY: Stripe LIVE secret key + webhook secret (deferred to a focused session, Session 91)

Both `STRIPE_SECRET_KEY` (`sk_live_…`, `src/lib/stripe/config.ts:5`) and `STRIPE_WEBHOOK_SECRET` (`whsec_…`, `src/app/api/webhooks/stripe/route.ts:25`) are flagged **"needs attention" (exposed)** in Vercel. These are the **highest-stakes secrets — the live payment path** — so the rotation was **intentionally deferred to a dedicated, focused session** (do NOT rush at the end of a long session). Empty platform = ideal window. **LIVE = PROD ONLY** (staging/dev use `sk_test_…`, separate + lower-stakes, rotate later). **CI does NOT use Stripe** (`ci.yml` injects only Supabase vars). NOT secrets, skip: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_live`, public by design) + all `STRIPE_*_PRICE_ID` (`price_…` identifiers).

**RUNBOOK (use Stripe's built-in grace/overlap so there's always a fallback):**
- **A. Secret key** — Stripe (LIVE mode) → Developers → API keys → **Roll key** → set the OLD key's expiry to a **SHORT grace window (~1 hour, NOT "immediately")** → copy new `sk_live_…` → Vercel **Production**: **delete + re-create `STRIPE_SECRET_KEY` as Sensitive** with the new value.
- **B. Webhook secret** — Stripe → Developers → Webhooks → select the **PROD endpoint** (Session 63 note: prod webhook uses the **Vercel domain** as primary — pick that one, not staging; if multiple endpoints, roll ONLY the prod one) → **Roll secret** with a **~24h overlap** (old + new both valid during transition → no missed payment events) → copy new `whsec_…` → Vercel **Production**: **delete + re-create `STRIPE_WEBHOOK_SECRET` as Sensitive**.
- **C.** ONE **redeploy** of prod (latest/live deployment, fresh build).
- **D. VERIFY with a real small test transaction** on the live site: payment **succeeds** (proves new secret key) AND the order flips to **`paid`** (proves the new webhook secret verified the event). Resend-incident lesson — confirm the deployed build actually uses the new values; don't assume.
- **E.** Old key + old webhook secret **auto-expire** on their windows — nothing to manually revoke.
- **PRE-CHECK:** confirm `.env.local` does NOT hold the **live** `sk_live_…` (dev should use `sk_test_…`). If it does, that copy goes dead after the roll — clean it up.


### DONE — rotated + verified
- **TWILIO_AUTH_TOKEN** — rotated via Twilio secondary token → promoted to primary (old killed). Account SID + From number unchanged. (Decided to KEEP Twilio on — $1.23/mo, turning off risks re-paying $20 setup.)
- **CRON_SECRET** — regenerated (randomBytes), set in Vercel (all envs), redeployed. Old auto-dead (Vercel Cron + routes read current value). `.env.local` left as placeholder (only used for local cron tests).
- **RESEND_API_KEY** — new key in BOTH Vercel entries (Production + "all nonproduction") + `.env.local`; old keys DELETED in Resend. **VERIFIED end-to-end** via a real staging transaction (email arrived + logged in Resend) after the deployment fix below. **Prod email confirmed working 2026-06-09.** RESEND_FROM_EMAIL (not a secret) + RESEND_WEBHOOK_SECRET (no roll option, low stakes) left as-is.
- **GOOGLE_CLOUD_VISION_API_KEY** (2026-06-09) — new key created in GCP (Application restrictions = None; API restriction = Cloud Vision API only), set in all Vercel scopes + `.env.local`, prod + staging redeployed, old key DELETED. Verification skipped by choice (moderation is fail-open — `image-moderation.ts:10-12,45-49` — a bad key only silently skips moderation, never breaks uploads).
- **UPSTASH_REDIS_REST_TOKEN** (2026-06-09) — rotated via Upstash "Reset Credentials" (rotates the TOKEN only, NOT the URL — confirmed: local URL unchanged). New token in the editable Vercel token var + `.env.local`; both envs redeployed; old token auto-killed by the reset. The `UPSTASH_REDIS_REST_URL` var is integration-managed/locked in Vercel (won't save manual edits) — left untouched, correctly. Low-risk (rate-limit falls back to in-memory if Upstash unreachable, `rate-limit.ts:181-186`).
- **SUPABASE_SERVICE_ROLE_KEY — Prod** (2026-06-10, Session 91) — migrated the Prod project to the new API key system: created an `sb_secret_…` key + used the existing `sb_publishable_…`. Swapped both into Vercel **Production** scope (service-role **re-created as Sensitive**, publishable plain). Redeployed prod with a **fresh build (no cache)** so the `NEXT_PUBLIC_` publishable key re-inlined. Verified logged-out browse + login + admin/service-client + session intact. Then **Disabled legacy JWT-based API keys** in Supabase (NOT the JWT secret) → old exposed legacy `service_role` is now dead, **zero user disruption** (stayed logged in through the disable = JWT secret untouched). Consumers cleared first: Sentry (no DB key), Playwright (never prod — `playwright.config.ts:10-11`), CI (Staging project — `.github/workflows/ci.yml`). **Staging + Dev projects NOT yet rotated.**
- **SENTRY_AUTH_TOKEN** (2026-06-10, Session 91) — personal token (NOT integration-managed). Created a new personal token (scopes: **Releases=Admin, Project=Read, all else None**), swapped into the plain Vercel `SENTRY_AUTH_TOKEN` var, prod redeployed. Verified via Sentry → **Settings → Source Maps** showing a fresh **315-file upload** at deploy time (build logs are silent by design — `next.config.ts:85` `silent:true`, so log output is NOT a valid check). New token confirmed working → old personal token safe to revoke. Non-secrets left as-is: `SENTRY_ORG`/`SENTRY_PROJECT` (slugs), `NEXT_PUBLIC_SENTRY_DSN` (public by design — ships in client bundle).

### Vercel "Sensitive" note
Marking an EXISTING var Sensitive is blocked (it's a create-time, one-way setting — would need delete+recreate). Integration-managed vars (Upstash, Sentry) can't be toggled at all. For a SOLO dev the Sensitive flag is low value (only hides values from OTHER people with Vercel access). Decision: rotation is the real win; not chasing Sensitive.

### The email incident — ROOT CAUSE + LESSON
After the Resend rotation, transaction confirmation emails stopped (in-app worked, nothing in Resend). Proven NOT the key (direct Resend API send with the key SUCCEEDED), NOT the domain (both `mail.*` domains verified), NOT the account (email present + `email_order_updates:true`). **Actual cause: a stale/wrong STAGING deployment** — an accidental "Redeploy of old commit `4fc2356`" had reverted staging to old code and that deployment lacked the new key effective. Fix: redeploy the CORRECT commit `12ee9069` → fresh build picked up current env (new key) → email worked.
**Lessons:** (1) env-var changes need a fresh deploy of the CORRECT/latest commit — redeploying an OLD deployment reverts code + may carry stale env. (2) Test on the SAME env you redeployed (use the staging alias URL, not a pinned old-deploy URL). (3) A direct provider API call isolates "key works" from "deployment uses it."

### TODO TOMORROW
1. ~~VERIFY PROD EMAIL~~ — **DONE 2026-06-09**, prod email confirmed working (redeployed `4fc2356` to pick up new Resend key).
2. **Push bookkeeping commit `a6056031`** (local-only: mig 153 → applied/, snapshot "applied" note, this file). Blocked by pre-push E2E **Supabase-connectivity timeouts in the local test runner** (environmental, not code — build compiled fine). Retry the staging chain when connectivity returns, OR `--no-verify` (docs-only commit; needs explicit user OK per rules).
3. **Continue rotating remaining flagged secrets** (priority):
   - ~~GOOGLE_CLOUD_VISION_API_KEY~~ — **DONE 2026-06-09** (new restricted key, old deleted).
   - ~~UPSTASH_REDIS_REST_TOKEN~~ — **DONE 2026-06-09** via Upstash "Reset Credentials" (rotates token only, NOT the URL). New token pasted into the editable Vercel token var + `.env.local`; both envs redeployed. The URL var is integration-managed/locked (won't save manual edits) — left alone, correctly. Low-risk: rate-limit falls back to in-memory if Upstash unreachable (`rate-limit.ts:181-186`).
   - ~~SENTRY_AUTH_TOKEN~~ — **DONE 2026-06-10 (Session 91)** (see DONE section — personal token, not integration-managed; verified via the Source Maps page, since build logs are silenced).
   - UPSTASH_REDIS_REST_URL — not a secret → skip/leave.
   - RESEND_WEBHOOK_SECRET — **SKIP** (no roll in Resend; low-stakes email-event verification only).
   - VAPID_PRIVATE_KEY — **SKIP unless leak suspected** (rotating invalidates ALL push subscriptions + needs NEXT_PUBLIC_VAPID_PUBLIC_KEY changed too).
   - ~~SUPABASE_SERVICE_ROLE_KEY (Prod)~~ — **DONE 2026-06-10 (Session 91)** via new-key migration + disable legacy JWT-based keys (see DONE section). **REMAINING: Staging + Dev projects.** Staging rotation must update BOTH the Vercel **Preview** scope AND the 3 **GitHub Actions** CI secrets (CI runs tests against Staging). Dev = `.env.local` (low urgency — no real data). NOTE: `.env.local` currently holds all 3 projects' keys — the Prod line is now a **dead string**; decide whether to trim it to Dev-only or keep all 3 + secure the file (BitLocker on, keep out of OneDrive/File History).
4. **Backup hygiene** — `apps/web/.env.local` holds ~15 real secrets and is the only secret-bearing file in the repo (gitignored, but copied by any full-folder backup/thumb drive). Confirm BitLocker is on + keep that folder out of OneDrive/File History.
5. **USER: test Items 1-4 on staging** (`12ee9069`) before any prod push.

### Git/deploy state at handoff
- Local `main` = `a6056031` (Items 1-4 + bookkeeping) — bookkeeping NOT pushed.
- `origin/staging` = `12ee9069` (Items 1-4). Staging LIVE deploy = redeploy of `12ee9069` (+ new key). ✅
- `origin/main` (prod) = `4fc2356` (no Items 1-4; new-key status UNVERIFIED → TODO #1).

---

<details><summary>Prior: Session 88 handoff (Phase 1B queued) — still valid</summary>

# Current Task: Session 88 — close-out + Phase 1A shipped + diagnostic mission queued

**Updated:** 2026-06-03 (end of Session 88)
**Mode:** Fix (winding down)

---

## 🟡 Two lingering notes for next session — DO NOT MISS

### Lingering note 1 (carried from Session 87)

**`validate_cart_item_schedule` was missed from mig 152's scope.** It follows the same pattern as `validate_cart_item_inventory` and `validate_cart_item_market` (both covered by mig 152) but was overlooked. Confirmed via Session 87 Prod advisor: still appears in the `anon_security_definer_function_executable` warning list.

When you draft mig 153 (X1b in backlog), include `validate_cart_item_schedule` in the REVOKE list — REVOKE EXECUTE FROM PUBLIC + anon + authenticated, DO-block-wrapped for env conditional safety.

### Lingering note 2 (NEW Session 88)

**Phase 1B (manager export + lockout, second half) is queued.** Mig 154 schema is on Dev + Staging but NOT Prod. Code (lockout layout + 2 access pages + manager-auth helper) is on staging at `68638348`. Phase 1B work:

1. Extend `POST /api/admin/markets/[id]/manager` route to add `suspend` + `restore` actions, and write to `market_manager_history` on assign/clear (currently does neither — just updates `markets.manager_*` columns)
2. Update `MarketManagerAssignment.tsx` component to add suspend/restore buttons
3. New `ManagerHistoryPanel` component showing past assignments + reasons
4. 3 notification templates: `manager_access_removed`, `_suspended`, `_restored` (register in `src/lib/notifications/types.ts` `NotificationType` union + `NOTIFICATION_REGISTRY` + add i18n keys to `lib/locale/messages`)
5. Apply mig 154 to Prod + push Phase 1B code together (single coordinated push, same pattern as Session 87)

Plan doc with full design + state transitions + business rules: `apps/web/.claude/manager_export_and_lockout_plan.md` (Phase 1B starts where the "Build phasing" → Phase 2 estimate begins).

---

## State at end of Session 88

**Branches in sync:**
- Local `main` == `origin/staging` == `68638348`
- `origin/main` (Prod) still at `4fc2356f` (yesterday's COI fix from Session 87 — does not yet have Phase 1A code)

**Reason `origin/main` was not advanced this session:** Phase 1A code is only useful if Phase 1B ships alongside. The lockout layout + helper will redirect any user navigating to a manager URL — but without admin tools to suspend/reassign managers, the new states are unreachable in practice. Holding the Prod push for Phase 1B to bundle code + mig 154 apply + admin UI together.

**Working tree (uncommitted, intentional handoff state):**
- `apps/web/.claude/current_task.md` (this file — being updated)
- `apps/web/.claude/backlog.md` (mig 153 entry + COI item from Session 87, untouched today)
- `apps/web/.claude/settings.local.json` (gitignored / local-only)
- Plus untracked planning docs from earlier today: `session88_prod_readiness_audit.md`, `manager_export_and_lockout_plan.md`, and the new `session89_diagnostic_prompt.md`

---

## What Session 88 accomplished

### Documentation + plans
- **Session 87 close-out** — bookkeeping commit + COI upload-button fix shipped Prod (Session 87 carried over briefly into Session 88's start)
- **Testing protocol** — `apps/web/docs/staging_test_checklist.md` (37 tests, 10 sections, printable for an off-machine tester on a Chromebook)
- **Prod-readiness audit** — `apps/web/.claude/session88_prod_readiness_audit.md` covering market manager data/grant features (8/14 shipped, G2 keystone gap = no CSV/PDF export), booth rentals (no new env vars; 4 Stripe Live items to verify; per-market Stripe Connect onboarding is the launch gate), and events (no new env vars or Stripe config)
- **Manager export + lockout plan** — `apps/web/.claude/manager_export_and_lockout_plan.md` (~20 KB design doc: request-based exports + dashboard lockout, 3 new tables, full state machine, 7 new notification templates planned, 15-18 hour estimated build across 3-4 sessions)
- **Concept: self-serve micro-market (FROG Market)** — `apps/web/.claude/self_serve_micro_market_concept.md` (idea capture, not on roadmap)

### Code (Phase 1A — shipped to staging only)
- **Migration 154** at `supabase/migrations/20260603_154_market_manager_lockout.sql` — applied to Dev + Staging. Adds `market_manager_history` audit table + `markets.manager_status` column + idempotent backfill. RLS enabled, no policies (service-client-only access).
- **`src/lib/markets/manager-auth.ts`** — new `getMarketManagerState()` returning rich enum (`'active' | 'suspended' | 'removed' | 'none'`) + market name. Hardened `isMarketManager()` to require `manager_status === 'active'` (suspended managers blocked at the API layer alongside non-managers).
- **`/[vertical]/market-manager/[marketId]/layout.tsx`** — new server-side guard runs once for all 4 child pages. Redirects on no-user / suspended / removed / none.
- **`/[vertical]/market-manager/access-removed/page.tsx`** — landing page; distinguishes former-manager (with end date) from random-user via history lookup.
- **`/[vertical]/market-manager/access-suspended/page.tsx`** — landing page; preserves assignment messaging.
- **`SCHEMA_SNAPSHOT.md`** changelog updated for mig 154.

Two commits shipped:
- `6ae50a3d` — Phase 1A initial (had a `typography.sizes.md` typo that pre-push build caught)
- `68638348` — fix-forward (`typography.sizes.base`)

### Other observations
- Several gates fired this session: PERF-R8 doc-completeness on mig 154 (forgot SCHEMA_SNAPSHOT entry — fixed), typography.sizes type error on lockout pages (build caught — fix-forward), git branch drift on the fix-forward commit (committed on staging instead of main because we'd been left on staging by a previous failed chain — recovered via `merge --ff-only`).

---

## Diagnostic mission queued for next session

User flagged that overall pace has slowed. A starting prompt for a fresh session was drafted at `apps/web/.claude/session89_diagnostic_prompt.md` — the next session reads it, investigates ~8 named diagnostic targets (rule + hook proliferation, memory file count, pre-commit/pre-push cycle time, error rate per commit, scope creep per session, tool-call efficiency, migration overhead, Rule 7 teaching mode overhead), and produces structured findings + cuts.

**Recommended:** run that diagnostic session BEFORE Phase 1B starts, so Phase 1B benefits from any process improvements identified.

---

## Reference points

### Recent commit history
- `68638348` — fix(market-manager): use typography.sizes.base (Session 88 fix-forward)
- `6ae50a3d` — feat(market-manager): Phase 1A — lockout schema + layout guard + access pages (Session 88)
- `4fc2356f` — fix(vendor-coi): show Upload button for grandfathered approved+empty COI rows (Session 87)
- `5f4f9dd1` — chore(deploy): Session 87 bookkeeping (Session 87)
- `8caf174c` — fix(docs): mig 151 prod rollback recorded + current_task updated (Session 86 close)

### Verification queries for sanity check at next session start

```sql
-- Confirm migration 154 is on Dev + Staging (NOT Prod yet)
-- Run on each env separately:
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'market_manager_history') AS history_table_exists,
  (SELECT column_default FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'markets' AND column_name = 'manager_status') AS manager_status_default;
-- Expected on Dev + Staging: history_table_exists=1, manager_status_default='active'::text
-- Expected on Prod:         history_table_exists=0, manager_status_default=NULL
```

### Phase 1B starting checklist
1. Read this file + `manager_export_and_lockout_plan.md` "Phase 1B" section
2. Confirm mig 154 on Dev + Staging (queries above)
3. Confirm Prod still at `4fc2356f` — Phase 1A code is on staging, not Prod
4. Run the diagnostic session FIRST (read `session89_diagnostic_prompt.md`)
5. Then start Phase 1B with the process improvements identified

### Vault state
Unchanged at `7f895e5` (`vault/pre-session-59`). No vault files touched this session.

</details>
