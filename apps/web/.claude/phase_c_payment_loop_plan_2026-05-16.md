# Phase C — Booth-Rental Payment Loop (Planning Doc)

**Date:** 2026-05-16
**Status:** Planning only. Awaiting user sign-off + decision locks before any code.
**Predecessor:** `phase_b_agreement_loop_plan_2026-05-15.md` (Phase B agreement loop, shipped to staging)
**Strategic reference:** `market_manager_v2_plan.md` §164-168 (Phase C scope)

Phase C is the **wedge** described in the v2 plan: weekly booth rentals through the platform with 6.5% × 2 markup. It is the first revenue stream from the market-manager surface, and it touches critical-path payment infrastructure. Worth slow-walking.

---

## 1. Goal

Vendor can book a weekly booth at a managed market via Stripe Checkout. Manager receives the booth-rental fee (less platform markup) in their separate "market" Stripe Connect account. Each booking carries an electronic-signature snapshot of the agreement the vendor accepted at booking time.

**Success criteria:**
- Manager can complete Stripe Connect onboarding for a "market" account from their dashboard.
- Vendor can complete a full booking on a managed market: pick week → pick size → see price → see agreement → pay.
- A successful Stripe Checkout writes a `weekly_booth_rentals` row with `status='paid'` and links to a `vendor_market_agreement_acceptances` snapshot row.
- Manager dashboard shows the booking in a "Weekly bookings" list with paid status, booth #, vendor.
- Platform keeps `0.13 × price_cents` (sum of both sides' 6.5% markup); manager receives `0.935 × price_cents`.
- No double-payouts. No orphaned bookings (paid in Stripe but no row in DB, or row exists but Stripe failed).

---

## 2. Out of scope (explicit)

- **Multi-week bundles / monthly subscriptions** — Phase C2 or later. Weekly-only for v1.
- **Booth auto-assignment (Path A)** — locked as Path B (manual) for v1. Manager assigns booth_number after payment.
- **Refund flow with partial refund logic** — basic full-refund yes; partials deferred.
- **Vendor cancellation policy enforcement** — set policy + display it; automated enforcement deferred unless trivial.
- **Manager dispute / chargeback handling UI** — Stripe handles webhook events; surface in admin only for v1, not manager UI.
- **Tax collection** — TaxCloud / state-specific tax not wired for booth rentals in v1. Document as known gap.
- **Same-day / festival transactions** — separate build entirely per v2 plan §9.
- **Payouts to multiple managers from the same vendor booking** — N/A; each booking is 1 market = 1 manager.
- **FT (food trucks) park-operator equivalent** — FM-only for v1.

---

## 3. Decisions to lock before kickoff

| # | Topic | Options | Recommendation |
|---|---|---|---|
| C.1 | Stripe Connect account type for managers | Express / Standard | **Express** — same as vendor flow; we already have onboarding UI patterns + webhook handlers wired |
| C.2 | What happens if vendor abandons checkout mid-flow | DB row with `status='pending_payment'` lingers / expires / never created | **Create row with `status='pending_payment'` BEFORE redirect to Stripe**, cron expires after 30 min if no `stripe_payment_intent_id` |
| C.3 | Booking cancellation policy (vendor-initiated, post-payment) | No refund / partial / full / window-based | **Full refund if cancelled ≥7 days before market day; no refund otherwise** — matches typical farmers-market policy. Manager-overridable later (deferred) |
| C.4 | Booking cancellation policy (manager-initiated) | Refund vendor / keep / partial | **Always full refund** when manager cancels. Manager has no incentive to cancel arbitrarily; refund preserves trust |
| C.5 | Idempotency key shape for Stripe Checkout session creation | Deterministic vs Date.now() | **Deterministic**: `weekly-rental-${rental_id}` — must be stable across retries per memory `feedback_data_integrity_traceability.md` and existing pattern |
| C.6 | When is the agreement-acceptance snapshot taken? | Pre-checkout / at successful payment / at booking-row insert | **At booking-row insert (before Stripe redirect)** — vendor has already clicked "I agree" in the UI; row exists pre-payment with `agreement_acceptance_id` populated |
| C.7 | What if manager hasn't completed Connect onboarding when vendor tries to book? | Block booking / let vendor pay platform, manual payout later / hide booking CTA entirely | **Hide booking CTA** on the public market profile + vendor booking flow if `markets.stripe_connect_account_id` is null. Show "This market isn't accepting bookings online yet." |
| C.8 | Tax handling on booth rentals | Collect / don't / TBD | **Don't collect for v1; document as known gap** — booth rental tax treatment varies wildly by state; address in a focused Phase C2 |
| C.9 | Receipt / confirmation email to vendor on successful payment | Yes / no / who sends (us vs Stripe) | **Both**: Stripe sends its standard receipt; we ALSO send an in-app + email notification with booking details (booth size, week, market name) — matches `sendNotification()` pattern |
| C.10 | Notification to manager when a booking is paid | Yes / no | **Yes** — email + in-app, includes vendor name + week + size. Manager wants to know immediately so they can assign booth_number |
| C.11 | Multi-week booking display (when shipped) | One row per week / one parent row with N children | **Defer** — out of scope for v1, but plan should not preclude either. Mig 139's `(vendor_profile_id, market_id, week_start_date)` UNIQUE supports one-row-per-week cleanly |
| C.12 | Vendor sees opt-in agreement at booking time (every time? or just first?) | Every booking / first-only per market / on version bump | **Every booking** — even if they've accepted at signup, the booking is a separate transaction that records its own snapshot. Friction is acceptable; this is the "electronic signature at payment" marketing story |

---

## 4. Migration 139 application

**File:** `supabase/migrations/20260512_139_weekly_booth_rentals.sql` (drafted, on staging branch, never applied)

**Schema recap** (from audit Section 3.2):
- `weekly_booth_rentals (id, vendor_profile_id, market_id, week_start_date, inventory_id, booth_number, price_cents, status, stripe_checkout_session_id, stripe_payment_intent_id, agreement_acceptance_id, booked_at, paid_at, cancelled_at, ...)`
- UNIQUE `(vendor_profile_id, market_id, week_start_date)`
- Indexes on `(market_id, week_start_date)`, `(vendor_profile_id, week_start_date)`, `(market_id, week_start_date, status)`
- Same-market integrity trigger on `inventory_id`
- RLS default-deny (no policies)

**Dependencies:**
- Mig 138 **must be applied first** (FK to `vendor_market_agreement_acceptances`). Already on Dev + Staging; **pending Prod**.

**Order:**
1. Mig 138 → Prod (pending operational task)
2. Mig 139 → Dev → Staging → Prod (after Phase C code is built — apply migration before pushing app code that depends on the table)

**Bookkeeping after each env:**
- Move file to `supabase/migrations/applied/`
- Update `SCHEMA_SNAPSHOT.md` Change Log
- After Prod confirmed, run `REFRESH_SCHEMA.sql` to regenerate structured tables (overdue per audit R4)

---

## 5. New schema additions Phase C needs (beyond mig 139)

Need to confirm whether existing `markets` columns cover this, but at minimum:

- `markets.stripe_connect_account_id TEXT` — manager's "market" Connect account ID. Probably new column = **draft mig 141** (or rename if a similar column exists; need to read `markets` schema).
- `markets.stripe_connect_account_status TEXT` — `'not_started' | 'pending' | 'active' | 'restricted'`. Useful for UX gating.
- `markets.stripe_connect_account_onboarded_at TIMESTAMPTZ` — when onboarding completed.

**Optional but recommended:**
- `weekly_booth_rentals.platform_fee_cents INTEGER` — denormalized snapshot of platform's cut at booking time (consistency with how vendor orders snapshot fees).
- `weekly_booth_rentals.manager_payout_cents INTEGER` — denormalized snapshot of what manager receives.

**Verification needed before drafting mig 141:** read `markets` schema for any pre-existing Stripe columns. Check if `vertical_admin_config.stripe_connect_*` or any precedent table has similar fields we should mirror.

---

## 6. Code touchpoints (high-level — not detailed yet)

### 6.1 Manager Stripe Connect onboarding

- **New page:** `/[vertical]/market-manager/[marketId]/connect/onboard` — initiates onboarding link via Stripe API.
- **New API:** `POST /api/market-manager/[marketId]/stripe-connect/onboard` — creates Stripe Connect account if absent, returns onboarding link URL.
- **New API:** `GET /api/market-manager/[marketId]/stripe-connect/status` — polls Stripe for account status. Updates `markets.stripe_connect_account_status` + `_onboarded_at`.
- **New dashboard section:** `<MarketStripeConnectCard>` — shows current status + "Continue onboarding" / "Manage in Stripe" buttons.

**Reuse:** the vendor Stripe Connect onboarding code at `src/lib/stripe/vendor-onboarding.ts` (or similar) — patterns transfer. **DO NOT** modify vendor flow.

### 6.2 Vendor weekly booking flow

- **New page:** `/[vertical]/markets/[id]/book` — entry point for booking. Or extend existing market profile with inline booking UI. (Decision needed: separate page vs embedded.)
- **Flow steps (one page, scrollable, vs wizard):**
  1. Pick week (default: next market day's week)
  2. Pick booth size tier (from `market_booth_inventory`)
  3. See price (`booth.weekly_price_cents`)
  4. See agreement (reuse `<MarketAgreementBlock>`)
  5. Click "Continue to payment" → POST `/api/vendor/markets/[id]/book` → row created, redirect to Stripe Checkout
- **New API:** `POST /api/vendor/markets/[id]/book` — creates `weekly_booth_rentals` row + `vendor_market_agreement_acceptances` row + Stripe Checkout session. Returns checkout URL.
- **Reuse:** Stripe Checkout creation patterns from `src/lib/stripe/checkout.ts` (or wherever vendor product checkout lives).

### 6.3 Stripe webhook handling

- **Modify:** `src/lib/stripe/webhooks.ts` (CRITICAL PATH — Rule 3 file-level approval required). Add handler for `checkout.session.completed` events tagged with our booking metadata.
- Handler updates `weekly_booth_rentals.status` → `'paid'`, populates `stripe_payment_intent_id`, sets `paid_at`.
- Triggers vendor + manager notifications via `sendNotification()`.
- **Idempotency:** webhook handler must handle duplicate deliveries — Stripe retries. Use event ID check or status guard (`if (rental.status !== 'pending_payment') return`).

### 6.4 Pricing helper

- **Modify:** `src/lib/pricing.ts` (CRITICAL PATH — Rule 3 file-level approval required). Add `calculateBoothRentalFees(weeklyPriceCents)` returning `{ vendor_pays_cents, manager_receives_cents, platform_keeps_cents }`.
- Pure function. Mirrors existing pricing structure. **DO NOT** touch existing product fee functions.

### 6.5 Stripe payments helper

- **Modify:** `src/lib/stripe/payments.ts` (CRITICAL PATH — Rule 3 file-level approval required). Add `createBoothRentalCheckoutSession({ rental, market, vendor })` — wraps Stripe SDK call with markup math + Connect transfer destination.
- Idempotency key: `weekly-rental-${rental.id}` (deterministic per C.5).

### 6.6 Manager dashboard — weekly bookings card

- **New component:** `<WeeklyBookingsCard>` — server-side fetch of `weekly_booth_rentals` for this market, ordered by `week_start_date DESC`. Shows paid status, vendor name, booth size, week, manager-assigned booth #.
- Inline "Assign booth #" input for paid bookings without a `booth_number` set.
- **Reuse:** `<VendorBoothList>` patterns for the booth-number editing.

### 6.7 Cron — expire abandoned bookings

- **Modify:** existing cron in `src/app/api/cron/` (which file? need to check — likely `expire-orders` or sibling).
- Add task: find `weekly_booth_rentals` with `status='pending_payment'` AND `booked_at < now() - interval '30 minutes'` AND `stripe_payment_intent_id IS NULL`. Set `status='cancelled'`, `cancelled_at=now()`. Log how many cleaned.
- Frequency: piggyback existing cron schedule (every 15 min or hourly).

### 6.8 Vendor dashboard — bookings list

- **New section** on vendor dashboard: "My Bookings" — list of `weekly_booth_rentals` for this vendor, grouped by market. Status (pending/paid/cancelled), booth size, week.
- Read-only for v1 (cancel link comes later).
- **Reuse:** existing dashboard card patterns.

---

## 7. Critical-path file impact + pre-merge audit

Per `change-discipline.md` Rule 3, the following files are critical-path. **Each modification requires its own file-named approval — design approval is NOT file approval.**

| File | What changes | Risk |
|---|---|---|
| `src/lib/pricing.ts` | Add booth-rental fee calc | Math errors → manager underpaid / overpaid. Test thoroughly. |
| `src/lib/stripe/payments.ts` | Add booth-rental checkout session creator | Wrong transfer destination → manager doesn't get paid. Idempotency bugs → double payout. |
| `src/lib/stripe/webhooks.ts` | Add booking-paid handler | Missed event → vendor charged but no DB record. Duplicate event → status flipped twice. |

**Pre-merge audit checklist** (per `docs/api-route-security-checklist.md`):
- [ ] New API routes use service client for RLS-blocked tables
- [ ] Manager-only routes gate on `isMarketManager`
- [ ] Idempotency keys are deterministic
- [ ] Webhook handler is idempotent on duplicate delivery
- [ ] No PII in error messages returned to caller
- [ ] Rate limits applied to public-facing endpoints

**Stress test protocols** at `apps/web/.claude/stress-test-protocols.md` — run before any prod push.

---

## 8. Test plan (high-level)

### Unit / vitest
- `pricing.ts` — golden-path test cases for booth-rental math at multiple price points (cents rounding edge cases). MUST NOT change existing pricing tests.
- Idempotency-key generation determinism.

### Flow integrity
- Add test: any manager-side route that creates a `weekly_booth_rentals` row must also create a `vendor_market_agreement_acceptances` row (or link to existing). Walk `/api/vendor/markets/` and assert pairing.
- Existing permission boundary test (manager can't delete `market_vendors`) — unchanged.

### Manual staging smoke
- Manager completes Connect onboarding → status flips to `active`
- Vendor books a week → checkout → returns to success page → DB row `status='paid'`
- Manager dashboard shows the booking → assigns booth_number
- Vendor sees their booking in their dashboard
- Stripe dashboard shows correct transfer to manager Connect
- Cron sweeps an abandoned booking (manual: kill the redirect to Stripe, wait 30 min, confirm row marked cancelled)
- Refund flow (manual: refund via Stripe → webhook updates row → vendor notified)

### Prod smoke (Tier 2)
- One real booking by a friendly test vendor against a friendly test market
- Verify $1 transfer landed in manager Stripe Connect dashboard
- Verify markup math reconciles to penny

---

## 9. Commit sequence (proposed)

Each commit needs explicit user approval per `change-discipline.md` Rule 1.

| # | Subject | Touches | Critical-path? |
|---|---|---|---|
| C-1 | `feat(market-manager): mig 141 — markets.stripe_connect_* columns` | mig 141 + SCHEMA_SNAPSHOT changelog | No (DB only) |
| C-2 | `feat(market-manager): manager Stripe Connect onboarding API + UI` | New API routes + new dashboard card | No |
| C-3 | `feat(market-manager): pricing.ts — booth rental fee calc` | `pricing.ts` only | **YES — file approval needed** |
| C-4 | `feat(market-manager): mig 139 + booking API + booking flow UI` | mig 139 + new API + new pages | No |
| C-5 | `feat(market-manager): Stripe Checkout for booth rentals` | `stripe/payments.ts` | **YES — file approval needed** |
| C-6 | `feat(market-manager): webhook handler for booth-rental paid` | `stripe/webhooks.ts` | **YES — file approval needed** |
| C-7 | `feat(market-manager): manager weekly-bookings dashboard card` | New component + dashboard wiring | No |
| C-8 | `feat(market-manager): vendor my-bookings dashboard section` | Vendor dashboard | No |
| C-9 | `feat(market-manager): cron — expire abandoned bookings` | Existing cron file | No |
| C-10 | `chore(db): mig 139 applied to all envs` | Bookkeeping | No |
| C-11 | `chore(db): mig 141 applied to all envs` | Bookkeeping | No |

**Rough estimate:** 5-7 sessions, given file-level approval gates on 3 critical-path files + the volume of new code. Bundling proposals will come per-session.

---

## 10. Risks

| | |
|---|---|
| **Stripe Connect account type mismatch** (Express vs Standard) — once chosen, switching is painful | Mitigate: read existing vendor Connect setup at `src/lib/stripe/...`, match. Lock C.1 decision before any code. |
| **Idempotency bugs cause double charges or duplicate transfers** | Mitigate: deterministic keys (C.5), status guards in webhook handler, vitest coverage. |
| **Manager and vendor share the same email** (allowed per v2 plan) — booking flow could confuse identity | Mitigate: booking always identifies the vendor via `vendor_profiles.id`, never email. Manager Connect account is keyed by `markets.stripe_connect_account_id`. |
| **Critical-path file modifications introduce cart bugs** (Session 66 precedent) | Mitigate: each critical-path change ships as its own commit with file-level approval, vitest run, and pre-push Playwright. Cart paths must not be touched. |
| **Webhook delivery is async + best-effort** — race between user landing on success page and DB row being updated | Mitigate: success page polls `/api/vendor/bookings/[id]` and shows "processing..." until status flips. Or rely on Stripe's `return_url` carrying enough state. |
| **Manager refunds a booking but webhook handler missed the event** | Mitigate: cron reconciliation — periodically poll Stripe for state and reconcile with DB. Deferred for v1; document as known gap. |
| **Vertical scope creep — FT operators ask for it before FM is proven** | Mitigate: explicit FM-only check in booking route + UI; FT users get "not yet available" message. |

---

## 11. Open questions (must answer before kickoff)

Aside from C.1-C.12 above:

- **Booking UX shape**: dedicated `/book` page vs inline on market profile? Recommendation: dedicated page, link from profile CTA. Cleaner state machine, easier to deep-link, easier to A/B test later.
- **Should vendor see prices BEFORE picking a week?** Some markets price differently by season. Mig 139 snapshots price at booking time, but the UX question is whether to show "$25/week" up front vs after week selection. Recommendation: show on size-tier selection step (after week picked) — the vendor knows the price they'll pay before clicking confirm.
- **Where does manager see total weekly revenue / month / season aggregates?** Probably a new section in `MarketTransactionsCard` (currently shows product sales). Phase D scope — note for later.
- **Booth-rental tax — when do we tackle it?** Phase C2 minimum. Document the gap publicly so managers understand.

---

## 12. When this gets picked up

Read in order:
1. This file
2. `phase_b_agreement_loop_plan_2026-05-15.md` (Phase B reference — same patterns, smaller scope)
3. `market_manager_v2_plan.md` §164-168 (strategic context for Phase C)
4. Vendor product checkout flow as reference: `src/app/api/checkout/session/route.ts` (critical-path, **read only — never modify when adding booth rental**)
5. Existing vendor Stripe Connect onboarding: `src/lib/stripe/...` (audit the FILES not yet identified)
6. `apps/web/docs/api-route-security-checklist.md` + `apps/web/.claude/stress-test-protocols.md` for pre-merge gates

---

## 13. Resume point checklist

- [ ] Plan reviewed by user
- [ ] Decisions C.1–C.12 locked
- [ ] Mig 138 applied to Prod (precondition)
- [ ] Mig 141 drafted (markets.stripe_connect_* columns) — verify against existing `markets` schema first
- [ ] Mig 141 applied to all 3 envs
- [ ] Phase C commits C-1 through C-11 (in order, with per-critical-path approvals)
- [ ] Friendly-test booking on prod
- [ ] Roadmap section in v2 plan marked Phase C complete

---

## 14. What this plan deliberately does NOT decide

- Exact wording of vendor-facing booking copy
- Exact email templates for notifications (placeholder content acceptable for v1)
- Exact dashboard layout for the weekly-bookings card
- Whether to add booking analytics in the manager dashboard before Phase D (recommendation: yes, lightweight count + revenue snapshot)

These get decided session-by-session as the work happens, with the user's feedback loop on each commit.
