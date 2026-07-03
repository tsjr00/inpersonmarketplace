# FT Park-Manager P4 Review — read-only trace (Report mode)

**Started:** 2026-07-02. Verifies the actual code end-to-end (docs = map, not truth). Every claim carries a file:line citation or is marked UNVERIFIED.

Legend: ✅ = verified matches design · ⚠️ = discrepancy/risk · ❓ = open question for user

## DECISIONS (user, 2026-07-02)
- **#1 flat fee → LEAVE AS-IS (option c).** Per-day (per-period) $0.15 flat fee on prepay-week stays. Rationale: identical to the established FM season pattern (`season-booking.ts:84-86`), which is live on prod; the fee math (`calculateBoothRentalFees` per unit, summed) is proven + tested; reworking a critical money calc to save $0.15 on a multi-day booking is net-negative risk. No code change.
- **#1a per-DOW pricing → DEFERRED** (single flat daily rate stays). Net-new feature (schema + UI + booking), not opted into. Backlog.
- **#2 concurrency → FIX** (approved). Minimal/stable approach: derive the occurrence group deterministically from the booking's own id (no random UUID) so concurrent pays share one idempotency key. No new queries, no race window.
- **#3 type drift → FIX** (approved). Add `'expired'` to `ParkSpotBookingStatus`. Safe — no exhaustive switch consumes the type (only its own def + row interface).

---

## B. Booking guards / schema (migrations 172, 174, 173) — DONE

### mig 172 park_spot_bookings — VERIFIED
- Table def: `supabase/migrations/20260701_172_park_spot_bookings.sql:45-63`. status CHECK = pending_payment|paid|cancelled|completed (`:52-53`; 'expired' added in 174).
- **Two PARTIAL-unique indexes** (`:69-74`):
  - `uq_park_spot_booking_active` on `(spot_id, booking_date) WHERE status IN ('pending_payment','paid')` → one truck per spot per day.
  - `uq_park_spot_vendor_active` on `(vendor_profile_id, market_id, booking_date) WHERE status IN ('pending_payment','paid')` → one spot per truck per park per day.
  - ✅ The `WHERE status IN (pending_payment,paid)` is exactly what makes a `cancelled`/`expired` row RELEASE the slot while a `paid` no-show KEEPS it.
- **`book_park_spot_atomic`** (`:122-178`): SECURITY DEFINER, `search_path=public`. All-or-nothing FOREACH insert (`:155-176`); any `unique_violation` → RAISE `SPOT_DATE_TAKEN date=%` P0001 rolls back whole bundle (`:165-169`). Snapshots `park_spots.base_price_cents` where active+in-market (`:148-150`); SPOT_NOT_FOUND if null. **No advisory lock** — partial-unique index IS the guard (comment `:117-120`). ✅ matches design.
- REVOKE PUBLIC/anon + GRANT service_role (`:185-190`). ✅
- Same-market trigger `check_park_spot_booking_market` BEFORE INSERT/UPDATE (`:84-103`). ✅

### mig 174 — VERIFIED
- `standing_reservation_id UUID NULL REFERENCES park_standing_reservations(id) ON DELETE SET NULL` (`:42-44`) + partial index (`:49-51`).
- status CHECK dropped+re-added WITH `'expired'` (`:55-57`). ✅
- `park_standing_reservations.strikes_reset_at TIMESTAMPTZ NULL` (`:60-61`) — reset baseline, NULL = full 32d window (comment `:63-64`). ✅

### mig 173 — VERIFIED
- `park_standing_reservations` (`:28-40`): status requested|active|suspended|revoked default requested (`:34-35`).
- **PARTIAL-unique** `uq_park_standing_active` on `(spot_id, day_of_week) WHERE status IN ('requested','active')` (`:46-48`) → one holder per spot per DOW; revoke/suspend frees it. ✅
- Same-market trigger (`:54-72`), RLS no-policy (`:79`). ✅

### Can a spot+date be double-booked / truck double-charged? (preliminary)
- **Double-book:** NO at DB level — the partial-unique index rejects a second active row for the same (spot,date). Atomic RPC surfaces it as SPOT_DATE_TAKEN. ✅ (route-level + webhook still to trace for the charge side.)
- **How cancelled/expired frees a slot vs paid no-show keeps it:** the partial index's `WHERE status IN (pending_payment,paid)` — a row leaving that set (→cancelled/expired) drops out of the unique constraint, reopening the slot; a `paid` row stays in-set so the slot stays held even with no check-in. ✅ Confirmed by schema.

---

## A. Money path — IN PROGRESS

### calculateBoothRentalFees — VERIFIED (`src/lib/pricing.ts:324-345`)
- Unit-agnostic. `vendorPays = round(base × (1+vendorMarkup%)) + vendorFlatFeeCents` (`:333-335`); `managerReceives = base − round(base×managerMarkup%)` (`:336-337`); `platformKeeps = vendorPays − managerReceives` (`:338`). `<=0` → all-zero (`:325-332`).
- ⚠️/❓ **Per-day flat fee on prepay-week.** The route computes fees ONCE for the per-day base then multiplies: `totalVendorPays = fees.vendorPaysCents × dates.length` (`book-park-spot/route.ts:137-139`) and passes per-day `vendorPaysCents: fees.vendorPaysCents` for each date (`:199`). Because `vendorFlatFeeCents` is baked into the per-day `vendorPaysCents`, a prepay-week of N days charges the flat fee **N times** (platform collects N× flat). Each booking_date is a discrete row, so this is internally consistent — but whether the flat fee should be per-day or per-checkout is a **business decision** (contrast MEMORY: "$0.15 flat fee is per ORDER" — that was the buyer-order path, a different fee structure). Flagging, not asserting a bug.

### createParkSpotCheckoutSession — VERIFIED (`src/lib/stripe/payments.ts:470-544`)
- **Deterministic idempotency key** `park-spot-${groupId}` (`:493`, `:540`). groupId is fresh per booking request (route `:148`), so each attempt = unique key (correct — no Date.now()). ✅
- Single consolidated line, `unit_amount = Σ per-day vendorPaysCents` (`:497,:516`). ✅ "identical charge to itemizing."
- **Destination charge:** `transfer_data.destination = managerStripeAccountId`, `.amount = managerReceivesTotalCents` (`:527-530`). Standard destination charge — platform keeps the difference. ✅
- `metadata.type='park_spot'`, `group_id`, `market_id`, `day_count`, `manager_receives_total_cents` (`:532-538`); `client_reference_id='park_spot_'+groupId` (`:524`). ✅
- ⚠️ **CRITICAL-PATH file.** This fn exists as of P2b (per-file approved). Need git confirm P4b-1 added no edits (below).

### webhooks.ts park_spot branch — VERIFIED (`src/lib/stripe/webhooks.ts:160-162, 1424-1493`)
- Dispatch: `if (session.metadata?.type === 'park_spot') handleParkSpotCheckoutComplete(session)` (`:161-162`).
- groupId from metadata OR client_reference_id fallback (`:1427-1430`); missing → ERR_WEBHOOK_011 return (`:1432-1439`).
- Flips **by booking_group_id** WHERE status='pending_payment' → paid + payment_intent + paid_at (`:1474-1482`). ✅ matches design ("flips bookings by booking_group_id").
- **Idempotent:** any row already 'paid' → skip (`:1456-1459`, Stripe retries). No pending rows (all cancelled) → ERR_WEBHOOK_014 reconciliation flag, never silently re-activate (`:1463-1470`). Bookings not found → ERR_WEBHOOK_012 (`:1446-1453`). Update error → throw ERR_WEBHOOK_013 (returns non-2xx → Stripe retry) (`:1484-1490`). ✅ Sound.
- ⚠️ **CRITICAL-PATH file.** Need git confirm P4b-1 added no edits (below).

### book-park-spot route (one-off / prepay-week) — VERIFIED (`src/app/api/vendor/markets/[id]/book-park-spot/route.ts`)
- Auth (`:36-37`), rate-limit (`:32-33`). Gates: `park_mode==='paid'` (`:58-63`), `stripe_charges_enabled===true` (`:64-69`), spot active+in-market (`:90-95`), each date valid/deduped/future(market-tz)/operating-day/not-cancelled-override (`:99-134`), total ≥ `PARK_SPOT_MIN_CHARGE_CENTS` (`:140-145`). ✅ ($5 FT min — confirm constant below.)
- Fresh `groupId=crypto.randomUUID()` (`:148`) → `book_park_spot_atomic` (`:150-157`) → SPOT_DATE_TAKEN→409 naming the date (`:161-167`). ✅
- Stripe fail → **delete only pending rows with null session id** (`:217-222`) so vendor can retry (frees partial-unique slot). ✅
- **Double-charge analysis:** each request = unique groupId = unique idempotency key. If a vendor abandons checkout, the pending rows hold the partial-unique slot → a re-book of the same date hits SPOT_DATE_TAKEN (409) rather than creating a second charge. So no double-charge; the "stuck pending" case is handled by the pay-occurrence route / cron cleanup (verify). No double-charge path found here. ✅

### PARK_SPOT_MIN_CHARGE_CENTS — VERIFIED `= 500` ($5) (`park-booking-types.ts:29`). MAX_DATES=14 (`:32`). ✅
### ⚠️ Minor type drift: `ParkSpotBookingStatus` (`park-booking-types.ts:5`) = pending_payment|paid|cancelled|completed — does NOT include `'expired'` (added to the DB CHECK in mig 174:57). tsc passes (type is just narrower than DB reality); no runtime bug found, but an exhaustive switch on this type would miss 'expired'. Cosmetic/forward-risk.

### pay-occurrence route (P4b-1) — VERIFIED (`src/app/api/vendor/park-occurrences/[bookingId]/pay/route.ts`)
- Reuses `createParkSpotCheckoutSession` + park_spot webhook (no new money code). ✅
- Gates: occurrence exists + `standing_reservation_id` set (`:45-47`), status must be `pending_payment` (`:48-53`), park_mode paid + stripe-ready (`:62-67`), **caller owns it** `profile.id === booking.vendor_profile_id` (`:76-78`), ≥ $5 min (`:89-94`). ✅
- Reuses existing `booking_group_id` if present else mints one (`:97`); webhook flips by group. ✅
- ⚠️ **LOW-severity concurrency note (not a normal-flow bug):** if the occurrence has `booking_group_id=NULL` and the truck fires two `pay` requests near-simultaneously, each mints a *different* random groupId (`:97`) → two Stripe sessions with different idempotency keys → possible double charge if the truck pays both. The row's `booking_group_id` ends up as whichever update won (`:124`); the webhook for the *losing* group finds no rows → ERR_WEBHOOK_012 (charged-but-unmatched, flagged for reconciliation, not auto-flipped). Requires deliberate concurrent double-payment; same class as most checkout flows. Worth noting, not blocking.

## C. Recurring loop (park-standing) — DONE

### park-standing.ts strike engine — VERIFIED (`src/lib/markets/park-standing.ts`)
- Constants (`:23-28`): cutoff 2d, limit 3, window 32d, horizon 7d. ✅ match design/task.
- `countLiveStrikes` (`:64-76`): counts event dates where `ev > (today−32d)` AND (no reset OR `ev > resetDate`). Lexicographic YYYY-MM-DD comparison — valid. Reset baseline excludes events dated ≤ reset date. ✅
- `getStrikeCountsForReservations` (`:90-116`): reads `park_spot_bookings` WHERE `standing_reservation_id IN ids AND status='expired'` (`:99-103`); groups booking_dates per reservation; applies countLiveStrikes. **Counts only 'expired' (missed-prepay) in P4b-1; no-show is P4b-2** (`:87-88` comment). ✅
- `runStandingOccurrenceSweep` (`:138-263`), 3 steps:
  1. **Release** past-cutoff pending occurrences → `'expired'` with guard `.eq('status','pending_payment')` so a race-paid row isn't clobbered (`:152-162`). ✅
  2. **Generate** next occurrence for each `status='active'` hold within horizon; skips inactive spot (`:177`), closed DOW / cancelled date (`:189-190`), own-existing-booking or occupied slot (`:201-202`); inserts pending_payment + `standing_reservation_id`; unique_violation → skip (`:217`); notifies `park_standing_occurrence_ready` with `payByDate=cutoff` (`:222-230`). ✅
  3. **Auto-suspend** active holds with strikes ≥ limit, guard `.eq('status','active')`; notifies `park_standing_suspended` (`:239-260`). ✅

### Trace: approve → generate → pay → paid
- approve: manager PATCH `approve` → `active` + approved_by/at (`standing-reservations/route.ts:113`). ✅
- generate: sweep step 2 creates pending_payment occurrence + notifies. ✅
- pay: truck hits pay-occurrence route → Stripe → webhook flips group to paid. ✅
- End-to-end works. **Caveat: the sweep only runs on prod Vercel cron** (gate below), so this loop is NOT exercisable on staging without a manually seeded pending occurrence row.

### Failure edge: miss cutoff → expired + strike → auto-suspend → reinstate
- miss cutoff (2 whole days before): sweep step 1 flips pending→expired, freeing the slot (partial-unique excludes 'expired') and creating a countable strike. ✅
- compute-on-read count: getStrikeCountsForReservations counts expired occurrences in the 32d window. ✅
- auto-suspend at 3: sweep step 3. ✅
- **manager reinstate resets strikes:** PATCH `reinstate` → `active` + `strikes_reset_at=now()` (`standing-reservations/route.ts:116-118`). ✅
- **Does reinstate instantly re-suspend? NO (verified).** Reset sets `strikes_reset_at=today`; countLiveStrikes excludes all strike events dated ≤ today. The 3 suspension-causing strikes have booking_dates in the past (they already expired) → all cleared → count 0 → not re-suspended. Only ~1 occurrence exists per hold per week (one DOW, 7d horizon), so at most one strike could be dated >today and survive the reset — never ≥3. ✅ Reinstate is safe.

## D. P4b-2 readiness — DONE (dependencies verified)

### Check-in table columns — VERIFIED (`supabase/migrations/applied/20260617_160_market_day_checkins.sql:23-50`)
- `market_date DATE` (`:27`), `manager_confirmed BOOLEAN DEFAULT false` (`:43`), `manager_confirmed_by` (`:44`), `manager_confirmed_at` (`:45`), `booth_number` (`:35`, → spot label), `UNIQUE(market_id, vendor_profile_id, market_date)` (`:49`). ✅
- **No-show detection key** = a `paid` occurrence's `(market_id, vendor_profile_id, booking_date)` with NO matching `market_day_checkins` row — the UNIQUE index exactly matches this key. ✅ P4b-2's planned extension to `getStrikeCountsForReservations` is well-supported. All columns exist; **no migration needed for P4b-2.**

### `manager_confirmed` override — column exists (`:43-45`). ✅ Marking a truck present cancels that day's no-show. Ready.

### Intraday cron question — ANSWERED (`vercel.json`)
- `/api/cron/expire-orders` = `0 12 * * *` (**DAILY**, noon UTC) — confirms the standing sweep runs once/day.
- **`/api/cron/surveys` = `0 * * * *` (HOURLY)** — an intraday cron ALREADY EXISTS. The 3 check-in reminders (open/midday/pre-close) can hook into the hourly surveys cron (compute which markets have an operating window crossing this hour) rather than adding a new schedule / editing vercel.json (deployment config → ask user before editing). Options to present to user at P4b-2 time.
- `market_schedules.start_time` / `end_time` — CONFIRMED to exist (referenced as `ms.start_time`/`ms.end_time` in mig 066, SCHEMA_SNAPSHOT:129). Drives the 3 reminder times. ✅

---

## GIT / DEPLOY STATE (verified)
- P4b-1 commit `cf0fd432` and P4a `effac4ba` — `git show --stat` confirms **NEITHER touched payments.ts NOR webhooks.ts**. Money-discipline claim holds. ✅
- Prod-only cron gate: `expire-orders/route.ts:62` early-returns `{skipped:true}` when `VERCEL_ENV && VERCEL_ENV!=='production'`. ✅ Confirms the sweep is prod-only; staging can't exercise the full standing loop.
- Migs 171–174 live in `supabase/migrations/` (NOT `applied/`) → consistent with "Dev+Staging applied, Prod pending." Mig 160 is in `applied/`.
