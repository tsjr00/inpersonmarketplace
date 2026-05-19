# Current Task: Phase C complete on staging — review before prod batch

**Updated:** 2026-05-17 (end of session 82+)
**Mode:** Fix (per recent user-approved commits)

---

## TL;DR for next session

**Staging is 18 commits ahead of prod.** Phase B closeout + Phase C Stages 1/1A/2/3 all shipped to staging across this session, plus tonight's testing-driven fixes. Migs 138, 139, 141 are on Dev + Staging — **NOT on Prod.** Prod push is gated on:
1. Apply mig 138 to Prod
2. Apply mig 139 to Prod
3. Apply mig 141 to Prod
4. Push staging branch tip to `origin/main`
5. Bookkeeping commit (move 3 mig files to `applied/`, regenerate SCHEMA_SNAPSHOT structured tables)

---

## What's on staging (commit `74154b2d`)

### Phase B closeout (3 items)
- **B-close-1** — Info-sharing consent checkbox on new-vendor signup (mirrors State C). `/api/submit` appends synthetic `_info_sharing_consent` snapshot entry when flag is true. Submit gated on both checkboxes when `?market=` present.
- **B-close-2** — Manager approval triggers `vendor_market_approval_granted` notification (email + in-app) to the approved vendor. Silent on revoke. Bumped NI-014 tripwire to 64.
- **B-close-3** — Auto-hash `agreement_version` from current statement set. New helper `src/lib/markets/agreement-version.ts`. Both `/api/vendor/markets/[id]/join` and `/api/submit` write deterministic version hashes. State D of vendor-signup detects staleness via new `GET /api/vendor/markets/[id]/agreement-status` and renders a re-accept block.

### Phase C Stage 1 — Booth booking flow (no payment)
- **Mig 139** (`weekly_booth_rentals`) — applied Dev + Staging. Stripe columns present but unused at this stage.
- **API:** `POST /api/vendor/markets/[id]/book` writes rental row with `status='pending_payment'`.
- **Vendor UI:** new page `/[vertical]/markets/[id]/book` + `BookBoothForm` client component. Week picker (next 8 Sundays in market tz), inventory dropdown, agreement block, submit.
- **Manager UI:** `<WeeklyBookingsCard>` on dashboard — read-only list.
- **CTA:** "Book a Booth Space" button on `/[vertical]/vendor/markets` between Manage Schedule + Prep Sheet.

### Phase C Stage 1A — Manager booth-# editor
- New PATCH `/api/market-manager/[marketId]/weekly-rental/[rentalId]` — set/clear booth_number.
- `<WeeklyBookingsCard>` refactored: server-side fetch + stitching, client child `<WeeklyBookingsList>` for the inline editor.
- Cancelled bookings show read-only (no editor).

### Phase C Stage 2 — Manager Stripe Connect onboarding
- **Mig 141** (`markets.stripe_account_id`, `stripe_onboarding_complete`, `stripe_charges_enabled`, `stripe_payouts_enabled` + partial index) — applied Dev + Staging.
- **New lib function:** `createMarketConnectAccount(email, marketId)` in `src/lib/stripe/connect.ts` — separate idempotency namespace from vendor (`connect-account-market-{marketId}`).
- **APIs:** `POST /api/market-manager/[marketId]/stripe/onboard` (creates account if absent, returns hosted onboarding URL) + `GET /api/market-manager/[marketId]/stripe/status` (lazy-syncs Stripe state to DB).
- **UI:** `<MarketStripeConnectCard>` on manager dashboard with 4 states (not_connected / in_progress / under_review / active). Handles `?stripe=complete` and `?stripe=refresh` return flags.

### Phase C Stage 3 — Payment integration (all 3 critical-path files modified)
- **Step 1 — `pricing.ts`:** `calculateBoothRentalFees(weeklyPriceCents)` — 6.5% × 2 markup + $0.15 vendor-side flat fee (revised 2026-05-18). Pure math, 14 vitest cases (3 constants, 6 golden-path, 5 invariants).
- **Step 2 — `stripe/payments.ts`:** `createBoothRentalCheckoutSession({...})` — Stripe destination-charge model (`transfer_data.destination + amount`), idempotency key `booth-rental-{rentalId}`, metadata.type='booth_rental' for webhook routing.
- **Step 3 — `/api/vendor/markets/[id]/book`** orchestrator: Stripe-only model (revised 2026-05-18). If `markets.stripe_charges_enabled !== true` → returns 409 before any DB write. Otherwise creates Checkout session and returns `checkout_url`. No offline fallback.
- **Step 4 — `stripe/webhooks.ts`:** `handleBoothRentalCheckoutComplete` — resolves rental_id, idempotent status flip pending_payment → paid, populates payment_intent_id + paid_at. Three TracedError codes (ERR_WEBHOOK_011/012/013).
- **Step 5 — `BookBoothForm`:** always shows the marked-up price breakdown (base + 6.5% + $0.15 = total). Submit redirects to `checkout_url`. Handles `?session=success|cancel` return-from-Stripe flash. `book/page.tsx` gates the form on `stripe_charges_enabled` and shows a "this market isn't set up for online booth rentals yet" bail-out when false.
- **Step 6 — Cron Phase 16:** sweeps abandoned bookings. Two cohorts: orphans (no Stripe session, 30 min timeout) + stale sessions (24h timeout). Status flipped to cancelled, cancelled_at set.

### Tonight's testing-driven fixes (commits `625de7eb` + `74154b2d`)

**Earlier batch (items 1 + 5 from first round of testing):**
- **Where-Today dedup** — `(vendor_id, market_id, start_time, end_time)` dedup before sort. Legit multi-time-slot vendors still render multiply.
- **Conditional disclaimer** — "This market is listed as a pickup location… not affiliated" disclaimer on market profile NOW hidden when `markets.manager_user_id IS NOT NULL`.

**Later batch (items 3 + 4 + 5 from second round of testing):**
- **Item 5 — Where-Today timezone fix (the day-off-by-one bug):** client now sends `day_of_week` + `date` URL params explicitly. Server uses them. Fixes pre-existing UTC bug surfaced in evening CT.
- **Item 3 — Refresh status button:** added "Checking…" / "Still under review · last checked at HH:MM AM/PM" feedback. Button now visibly responds to clicks.
- **Item 4 — Drop booth-booking approval gate + add availability check:** booking no longer requires `market_vendors.approved=true`. New Gate 5 in API: `inventory.count - placeholders_for_size - pending+paid_rentals_this_week > 0` else 409 "All [size] booths for the week of X are taken". Book page dropped the "Apply to market first" and "Waiting on manager approval" branches.

---

## Migrations status

| # | Description | Dev | Staging | Prod |
|---|---|---|---|---|
| 138 | vendor_market_agreement_acceptances | ✅ | ✅ | ❌ pending |
| 139 | weekly_booth_rentals | ✅ | ✅ | ❌ pending |
| 140 | market_branding (markets.logo_url) | ✅ | ✅ | ❌ pending |
| 141 | markets.stripe_connect_* | ✅ | ✅ | ❌ pending |

**Apply order to Prod:** 138 → 139 (FK depends on 138) → 140 (independent) → 141 (independent). Then bookkeeping commit (file moves + REFRESH_SCHEMA.sql regen of structured tables).

---

## Branch state

- `origin/staging`: `74154b2d` (latest)
- `origin/main` (prod): `c7d0b3ec` (Session 81 end)
- Local `main`: matches staging
- **18 commits to push to prod** when ready

---

## Open testing findings from this session

| # | Finding | Status |
|---|---|---|
| 1 | Does mktmgr need to be a vendor? | **Answered — no.** dual-key auth checks `manager_user_id` / `manager_email` only |
| 2 | Admin should see manager name/phone/backup contact | **Open** — needs mig 142 + UI. Not built yet. |
| 3 | Refresh Stripe status button "does nothing" | ✅ **Fixed** — visible feedback added |
| 4 | Booking sent to /vendor-signup | ✅ **Fixed** — design corrected, booking is open marketplace + capacity check |
| 5 | Day-of-week off-by-one on /where-today | ✅ **Fixed** — client sends day_of_week explicitly |

Earlier testing batch (items 1 + 5 from first round):
- ✅ Vendor duplication on /where-today — dedup shipped
- ✅ "Not affiliated" disclaimer conditional on `manager_user_id`

Still on the backlog (already noted in `apps/web/.claude/backlog.md`):
- Failed booth rental purchase notification
- Vendor + manager payment-complete notifications (Step 4.5)
- Migs 138/139/141 → Prod + bookkeeping commit
- Stage 3 amount reconciliation (optional)
- account.updated webhook → markets.stripe_* sync (optional)

---

## Item 2 design — admin sees manager name/phone/backup contact (needs work next session)

**Scope:**
- **Mig 142:** add to `markets`:
  - `manager_name TEXT`
  - `manager_phone TEXT`
  - `backup_contact_name TEXT`
  - `backup_contact_email TEXT`
  - `backup_contact_phone TEXT`
- **UI:** edits in 3 places:
  - Platform admin: `/admin/markets/[id]` (full form)
  - Vertical admin: `/[vertical]/admin/markets` inline Edit form
  - **Optional:** manager-side edit on their own dashboard (let them update their info)
- **Display:** admin Markets list shows name + phone alongside email; admin Market detail shows full backup contact block.

Not started. Single migration + ~80-120 lines UI. Non-critical-path.

---

## What's NOT in this session's work

- Item 2 (admin manager contact fields) — designed but not built
- Manager-editable schedule (`<MarketScheduleCard>` still read-only with "coming soon" copy)
- Proactive manager application form (`/market-manager-program` is marketing only)
- Vendor "My Bookings" dashboard section (Stage 1 leftover)
- Notification implementations (vendor approved-at-market is shipped; payment-complete + booking-cancelled are not)

---

## Critical context for next session

### RLS posture (unchanged from before)
All Phase B / C tables (mig 138/139/141 columns, plus mig 134-137 manager tables) are RLS default-deny with no policies — service-client only. Auth verified upstream by `isMarketManager()` for manager routes; by `getVendorProfileForVertical()` for vendor routes.

### Phase B agreement-version model
`agreement_version` is auto-computed as `v1:<count>:<hash>` from sorted statement IDs (synthetic entries excluded). Helper at `src/lib/markets/agreement-version.ts`. Same statement set = same hash = idempotent UNIQUE conflict on (vendor, market, version) = treated as success. Different set = new row written.

### Phase C math model
6.5% × 2 markup. Math centralized in `src/lib/pricing.ts` (`calculateBoothRentalFees`). Caller passes amounts to `createBoothRentalCheckoutSession`. Stripe's destination charge (`transfer_data: { destination, amount }`) auto-routes the manager's portion at payment time — no separate transfer call. Platform retains the spread.

### Idempotency keys (Phase C)
- Stripe Checkout session: `booth-rental-${rentalId}` (deterministic)
- Manager Connect account creation: `connect-account-market-${marketId}` (distinct namespace from vendor)

### Cron Phase 16 expiry windows
- Orphan (no Stripe session): 30 min after `booked_at`
- Stale (has Stripe session, no payment): 24h after `booked_at` (mirrors Stripe's default session TTL)

### Per-file approval history (Rule 3)
All 3 critical-path files in `pricing.ts`/`stripe/payments.ts`/`stripe/webhooks.ts` received explicit per-file approval before each modification. Pattern: present diff + risk → user approves naming the file → commit.

---

## Files modified this session (chronological)

1. `apps/web/src/app/[vertical]/vendor-signup/page.tsx` — B-close-1, B-close-3 State D
2. `apps/web/src/app/api/submit/route.ts` — B-close-1 info-sharing, B-close-3 auto-hash
3. `apps/web/src/app/api/market-manager/[marketId]/vendor-approval/route.ts` — B-close-2 notification
4. `apps/web/src/lib/notifications/types.ts` — `vendor_market_approval_granted`
5. `apps/web/src/lib/__tests__/cutoff-and-sort-functional.test.ts` — NI-014 bump 63 → 64
6. `apps/web/src/lib/markets/agreement-version.ts` — NEW helper
7. `apps/web/src/app/api/vendor/markets/[id]/agreement-status/route.ts` — NEW endpoint
8. `apps/web/src/app/api/vendor/markets/[id]/join/route.ts` — auto-hash version
9. `apps/web/src/app/api/vendor/markets/[id]/book/route.ts` — Stage 1 + Stage 3 + Item 4 fix
10. `apps/web/src/app/[vertical]/markets/[id]/book/page.tsx` — booking page + return-flash + Item 4 fix
11. `apps/web/src/components/vendor/BookBoothForm.tsx` — booking form + Stripe redirect
12. `apps/web/src/components/market-manager/WeeklyBookingsCard.tsx` — refactored server wrapper
13. `apps/web/src/components/market-manager/WeeklyBookingsList.tsx` — NEW client list w/ booth-# editor
14. `apps/web/src/app/api/market-manager/[marketId]/weekly-rental/[rentalId]/route.ts` — NEW PATCH
15. `apps/web/src/lib/stripe/connect.ts` — `createMarketConnectAccount`
16. `apps/web/src/app/api/market-manager/[marketId]/stripe/onboard/route.ts` — NEW
17. `apps/web/src/app/api/market-manager/[marketId]/stripe/status/route.ts` — NEW
18. `apps/web/src/components/market-manager/MarketStripeConnectCard.tsx` — NEW + Item 3 fix
19. `apps/web/src/app/[vertical]/market-manager/[marketId]/dashboard/page.tsx` — wired Connect + Bookings cards
20. `apps/web/src/app/[vertical]/vendor/markets/page.tsx` — "Book a Booth Space" CTA
21. `apps/web/src/lib/pricing.ts` — `calculateBoothRentalFees`
22. `apps/web/src/lib/__tests__/pricing.test.ts` — 13 booth-rental cases
23. `apps/web/src/lib/stripe/payments.ts` — `createBoothRentalCheckoutSession`
24. `apps/web/src/lib/stripe/webhooks.ts` — `handleBoothRentalCheckoutComplete` + dispatch
25. `apps/web/src/app/api/cron/expire-orders/route.ts` — Phase 16 sweep
26. `apps/web/src/app/api/trucks/where-today/route.ts` — dedup + timezone fix
27. `apps/web/src/app/[vertical]/where-today/page.tsx` — client sends day_of_week
28. `apps/web/.claude/backlog.md` — Priority 1 — Phase C Stage 3 follow-ups
29. `supabase/migrations/20260512_139_weekly_booth_rentals.sql` — rollback comment block
30. `supabase/migrations/20260517_141_markets_stripe_connect.sql` — NEW migration
31. `supabase/SCHEMA_SNAPSHOT.md` — changelog entries for migs 139 + 141

Plus planning docs:
- `apps/web/.claude/phase_b_agreement_loop_plan_2026-05-15.md`
- `apps/web/.claude/phase_c_payment_loop_plan_2026-05-16.md`

---

## Smoke test plan after Vercel rebuild

See full Phase B + C test plan in the prior session message — items 1-45 covered Stripe Connect onboarding, vendor booking, manager dashboard, agreement re-acceptance, cancellation, idempotency, where-today dedup, conditional disclaimer.

Tonight's three fixes add these checks:
- **Item 5 (timezone):** evening test — click "Friday" in `/where-today` → should now show Friday markets
- **Item 3 (refresh button):** as manager with Stripe Under Review → click Refresh status → see "Checking…" then "Still under review · last checked at HH:MM"
- **Item 4 (open booking):** as vendor with no `market_vendors` row → book → form renders. Overbook attempt → 409.

---

## When this gets picked up

Read in order:
1. This file
2. `apps/web/.claude/backlog.md` Priority 1 section
3. `apps/web/.claude/phase_c_payment_loop_plan_2026-05-16.md` (if continuing Phase C)
4. The 5 themed rule files in `apps/web/.claude/rules/` (always)

**Top-of-next-session priorities:**
1. User smoke-tests staging covering the 5 fixes shipped today
2. Decide when to push migrations 138/139/141 to Prod + push 18 commits to `origin/main`
3. Item 2 (admin manager contact fields) — mig 142 + UI work
4. Backlog items: notifications on payment / cancellation
