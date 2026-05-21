# Current Task: Phase C complete on staging — Prod deploy pending

**Updated:** 2026-05-19 (end of Session 83)
**Mode:** Report (ready to hand off)

---

## TL;DR for next session

**Staging is 23 commits ahead of Prod.** Phase C is feature-complete on staging. All migrations 138/139/140/141/142/143 are applied to Dev + Staging — none on Prod. Next session's biggest job is the **Prod deploy** (when user is ready).

The session's main outputs:
1. Phase C booth-rental work shipped to staging (Stripe-only model, $0.15 flat fee, atomic RPCs)
2. Three payment-lifecycle notifications (vendor paid, manager paid, payment failed)
3. Vendor "My Bookings" view + dashboard card
4. Manager-editable market schedule with soft-delete pattern
5. New verification-discipline Rule 5 (Schema Intent Gate) — mechanical protection against destructive design patterns
6. Comprehensive Session 83 audit doc identifying 18 gaps in market-manager surface

---

## What's on staging (commit `1248efcb`)

### Phase C — booth rental payment flow
- Stripe-only booking: vendors must use platform for payment; managers without Stripe Connect can't receive bookings through the platform (collect cash outside the platform if they want)
- $0.15 vendor-side flat fee added on top of 6.5% markup (matches product order math shape). For $25 booth: vendor pays $26.78, manager receives $23.37
- `book_weekly_booth_atomic` RPC (mig 142): race-safe via pg_advisory_xact_lock on (market, inventory, week); RAISES OVERBOOKED / DUPLICATE / INVENTORY_NOT_FOUND
- `replace_market_optin_selections` RPC (mig 143): atomic delete+insert for manager opt-in saves; avoids fake re-acceptance prompts on partial failures
- Stripe-fail orphan cleanup: book route deletes the orphan rental row in the catch block so vendor isn't blocked from retry for 30 min
- Three payment notifications (NI-014: 67):
  - `booth_rental_paid_vendor` — vendor sees their pay amount + week
  - `booth_rental_paid_manager` — manager sees vendor name + their portion arriving in Stripe
  - `booth_rental_payment_failed_vendor` — fires from cron Phase 16 when orphan/stale booking gets swept
- Vendor "My Bookings" page (`/[vertical]/vendor/bookings`): read-only list of their weekly_booth_rentals across all markets; new 🪑 dashboard card; post-Stripe redirect lands here

### Manager-editable schedule (soft-delete pattern)
- `MarketScheduleCard.tsx` converted from read-only to editable
- API `PUT /api/market-manager/[marketId]/schedules`: per-day soft-upsert — UPDATE existing row in place (preserves id, triggers vendor-attendance deactivation cascade), or INSERT new row only when active=true. **NEVER DELETE.**
- Per-day toggle: turn a day off → row stays in DB with active=false + times preserved
- Re-enabling a day: existing row's active flips back to true, times intact (no re-typing)
- Vendor attendance: existing trigger `handle_market_schedule_deactivation` (mig 20260128_001:151-172) auto-deactivates vendor_market_schedules rows when a schedule flips active=true→false. Vendors must re-opt in if day comes back.
- New notification `market_schedule_changed` (NI-014: 68) fires to approved vendors on save
- Acknowledgment dialog with 4 bullets — manager confirms responsibility for vendor outreach + no platform refunds before save commits

### Refund policy + cancellation posture (locked decisions)
- **No vendor self-cancellation.** Once paid, booth is theirs for the selected week.
- **Market closure → manager handles.** If the market closes/cancels for a week, manager refunds OR re-schedules at their option. Platform issues no refunds.
- The booking form shows the policy explicitly before payment (NOTE: refund-policy notice block was reverted from BookBoothForm.tsx mid-session per user direction; the rule still stands but is not yet displayed on the form. See backlog for the placement question).

### Schema Intent Gate (verification-discipline Rule 5)
New mechanical rule added 2026-05-19. Before writing any DELETE or replace-all CRUD operation, run three checks:
1. **Soft-delete column present?** (`active`, `deleted_at`, `archived_at`, `is_deleted`, `status` with inactive states) → If yes, UPDATE the flag instead of DELETE.
2. **Cascade FK present?** Grep `REFERENCES <table>.*ON DELETE CASCADE`. If yes, DELETE here destroys data in other tables.
3. **Pattern reuse without diff?** When reusing a recent pattern, force the "what's different?" question.

Rule documented at `apps/web/.claude/rules/verification-discipline.md` Rule 5. CLAUDE.md gateway updated to list it + Session 83 in incidents.

### Tonight's session audit artifacts (in `.claude/`)
- `session83_mm_audit.md` — 18 gaps identified across the market-manager surface area
- `session83_self_audit.md` — honest record of what I verified vs. assumed during the build (lessons that drove Rule 5)
- Plan file at `~/.claude/plans/recursive-drifting-neumann.md` — schedule editor rebuild plan

---

## Migrations status

| # | Description | Dev | Staging | Prod |
|---|---|---|---|---|
| 138 | vendor_market_agreement_acceptances | ✅ | ✅ | ❌ pending |
| 139 | weekly_booth_rentals | ✅ | ✅ | ❌ pending |
| 140 | market_branding (markets.logo_url) | ✅ | ✅ | ❌ pending |
| 141 | markets.stripe_connect_* | ✅ | ✅ | ❌ pending |
| 142 | book_weekly_booth_atomic (RPC) | ✅ | ✅ | ❌ pending |
| 143 | replace_market_optin_selections (RPC) | ✅ | ✅ | ❌ pending |
| 144 | booth_auto_assignment (markets.booth_label_*, partial UNIQUE on weekly_booth_rentals, replaces book_weekly_booth_atomic RPC) | ✅ | ✅ | ❌ pending |

**Apply order to Prod:** 138 → 139 (FK to 138) → 140 → 141 → 142 → 143 → 144 (depends on 142's signature for the DROP). Then bookkeeping commit (file moves to `applied/` + regenerate SCHEMA_SNAPSHOT structured tables via `supabase/REFRESH_SCHEMA.sql`).

---

## Branch state

- `origin/staging`: `1248efcb` (latest)
- `origin/main` (prod): `c7d0b3ec` (Session 81 end)
- Local `main`: matches staging
- **23 commits to push to prod when ready**

---

## What's NOT shipped to staging (dropped or deferred)

### Dropped from scope (user decisions this session)
- ❌ Vendor self-cancellation (Fix-10 / task #48 deleted, then restored as deleted, then redeleted — net: dropped)
- ❌ Manager-side cancel of stuck pending_payment bookings (task #49 — cron Phase 16 handles)
- ❌ Blackout dates editor (was Piece B of schedule work; dropped early in scope conversation)

### Deferred to future sessions
- **Booth allocation time-awareness** (gap G13 from session83_mm_audit.md). Off-platform vendor placeholders are time-invariant today; a placeholder for booth #5 blocks that booth every week. Schema change needed: add `week_start_date DATE NULL` to `market_booth_placeholders`. Plus the related concern about double-booking when manager manually assigns same booth_number to two vendors for the same week.
- **Booth-renter notification gap** for schedule changes. Today `market_schedule_changed` notifies only `market_vendors.approved=true` — does NOT notify vendors who paid for `weekly_booth_rentals` for upcoming weeks but aren't in the approved list. ~15 LOC fix.
- **Refund policy notice on booking form**. Locked design but UI placement reverted mid-session. Re-add when ready.
- **Pre-existing reader gaps** (catalogued by Agent A in this session):
  - R15: vendor PATCH at `/api/vendor/markets/[id]/schedules` allows attendance on inactive schedule rows
  - R7: admin GET cache returns inactive schedule rows (admin context OK, but cache is public)
  - R24/R25/R29/R30/R40: decorative leaks of inactive schedule data (no integrity impact)
- **Item 2 (admin manager contact fields)** — designed in earlier session but not built. Needs mig 142...wait, mig 142 was used for atomic booking. Item 2 needs a future migration adding manager_name, manager_phone, backup_contact_* fields to markets table.
- **Vendor schedule changes notification timing** — vendors get notified when manager saves. No batching/throttling. If manager saves 10 times in a row, vendors get 10 notifications. Acceptable for v1.

---

## Critical context for next session

### Stripe Connect for managers — already tested working
User's test market manager went through Stripe Connect onboarding and got Active status during this session (after remediation upload). Test card `4242 4242 4242 4242` works end-to-end. The manager's Stripe account is set up to receive booth rental payments.

### RLS posture (unchanged)
All Phase B / C / D tables (migs 134–143) are RLS default-deny with no policies — service-client only. Auth verified upstream by `isMarketManager()` for manager routes; by `getVendorProfileForVertical()` for vendor routes.

### Phase C math (locked 2026-05-18)
6.5% × 2 markup + $0.15 vendor-side flat fee. Math centralized in `src/lib/pricing.ts` (`calculateBoothRentalFees`). For $25 booth:
- Vendor pays: round(2500 × 1.065) + 15 = $26.78
- Manager receives: 2500 − round(2500 × 0.065) = $23.37
- Platform keeps: $3.41

### Idempotency keys (Phase C)
- Stripe Checkout session: `booth-rental-${rentalId}` (deterministic)
- Manager Connect account creation: `connect-account-market-${marketId}` (distinct namespace from vendor)

### Cron Phase 16 expiry windows
- Orphan (no Stripe session): 30 min after `booked_at`
- Stale (has Stripe session, no payment): 24 h after `booked_at` (mirrors Stripe's default session TTL)
- On sweep, fires `booth_rental_payment_failed_vendor` notification per row

### Vendor attendance after schedule change
When manager toggles a day off, the trigger automatically sets `vendor_market_schedules.is_active=false` for every linked row. Vendors are NOT auto-reactivated if the day comes back — they must re-opt in. Manager's acknowledgment dialog warns about this.

---

## Smoke test plan for Vercel rebuild (commit `1248efcb`)

### Schedule editor (the new critical test)
1. **Toggle a day off** as manager → check Supabase: `SELECT day_of_week, active, start_time, end_time FROM market_schedules WHERE market_id='...';` — row should STILL EXIST with `active=false` and times preserved. **If the row is gone, the soft-delete didn't take effect.**
2. **Re-enable that day** — times should auto-populate from before. No re-typing.
3. **Vendor attendance** — `SELECT is_active FROM vendor_market_schedules WHERE schedule_id='...';` should be `false` after the toggle-off (cascaded by the trigger).
4. **Notifications** — every approved vendor at the market should get `market_schedule_changed` (in-app + email).

### Phase C end-to-end (re-test)
- Booth booking with vendor: form shows $26.78 (all-in), proceeds to Stripe Checkout, returns to "View my bookings →"
- Manager dashboard "Weekly booth bookings" card shows new booking with Paid badge
- Vendor dashboard 🪑 "My Booth Bookings" card → vendor bookings list

### Stripe-only enforcement
- A market whose manager is NOT Stripe-approved → vendor booking page should show "Online booking not available yet"

---

## Files modified this session (chronological by commit)

### Commit `f8a433c1` (early session — Fixes 2-8 batch)
- BookBoothForm price display ($26.63 with breakdown — later redone)
- Booth-inventory delete 23503 mapping
- MarketBrandingCard logo Remove via ConfirmDialog
- VendorBoothList Revoke button
- Stripe-fail orphan delete in book route
- current_task.md mig 140 row
- session83_mm_audit.md (the 18-gap audit doc)

### Commit `75ed885b` (no-offline-mode + atomic RPCs + new migrations)
- pricing.ts: added vendorFlatFeeCents = 15
- pricing.test.ts: 14 cases updated to new math
- book/page.tsx: gate on stripe_charges_enabled
- BookBoothForm: redo with one-number price display
- book/route.ts: early Stripe-required 409 + atomic RPC wiring
- optin/selections/route.ts: atomic RPC wiring
- market-manager-program/page.tsx: landing math updated
- SCHEMA_SNAPSHOT.md: changelog for migs 142 + 143
- migs 142 + 143 SQL files
- session83_self_audit.md

### Commit `e4c5206c` (notifications + vendor bookings)
- 3 new notification types in types.ts
- NI-014: 64 → 67
- Webhook handleBoothRentalCheckoutComplete: paid notifications
- Cron Phase 16: failed-payment notifications
- NEW `src/app/[vertical]/vendor/bookings/page.tsx`
- Vendor dashboard 🪑 card
- BookBoothForm post-Stripe redirect → bookings page

### Commit `1248efcb` (schedule editor + Rule 5)
- MarketScheduleCard: converted to editable with soft-delete pattern + acknowledgment dialog
- schedules/route.ts: new API (later rebuilt to soft-upsert)
- types.ts: market_schedule_changed notification
- NI-014: 67 → 68
- Dashboard wiring
- verification-discipline.md: new Rule 5 (Schema Intent Gate)
- CLAUDE.md gateway: incidents list updated

### Reverts during session
- Refund policy notice in BookBoothForm.tsx (added then reverted)
- Error message in book/route.ts (touched then reverted)
- Schedule editor first build was destructive — caught by user, rules added, then rebuilt with soft-delete pattern

---

## When this gets picked up

Read in order:
1. This file
2. `apps/web/.claude/session83_self_audit.md` — short, sharp record of what I verified vs assumed; informs Rule 5
3. `apps/web/.claude/session83_mm_audit.md` — 18-gap audit; backlog source
4. The 5 themed rule files in `apps/web/.claude/rules/` (Rule 5 is new in verification-discipline.md)
5. `apps/web/.claude/backlog.md` Priority 1 section

**Top-of-next-session priorities:**
1. User smoke-tests staging covering the schedule editor's soft-delete behavior
2. Decide when to push migrations 138–143 to Prod + push 23 commits to `origin/main`
3. Booth-renter notification gap (small, ~15 LOC)
4. Refund policy notice placement on booking form (small)
5. Maybe: booth allocation time-awareness (gap G13; needs a migration and design call)
