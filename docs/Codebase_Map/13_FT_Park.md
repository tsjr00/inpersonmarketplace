# 13 — Food-Truck Park Operator ⚠ money

<!-- map-stamp: domain=ft-park; verified=2026-07-18; commit=b9f82116 -->
<!-- map-claims
src/app/api/vendor/markets/[id]/book-park-spot/**
src/app/api/vendor/markets/[id]/standing-reservation/**
src/app/api/vendor/park-occurrences/**
src/app/[vertical]/vendor/park-bookings/**
src/app/[vertical]/markets/[id]/book-spot/**
-->

Parks are the **same `markets` table** with `park_mode` set: `'free'` = attendance and compliance only, `'paid'` = spots and bookings. FT intake creates parks with `park_mode='paid'`. Most operator surfaces are shared with [12_Market_Manager.md](12_Market_Manager.md) — this file covers what forks.

---

## Read this first

1. `lib/markets/park-standing.ts` header (`:7-31`) then `runStandingOccurrenceSweep` (`:225-443`) — the highest-concept file on the FT side. Its three sweep steps encode most park invariants.
2. `api/vendor/markets/[id]/book-park-spot/route.ts:27-186` — the full gate list, in enforcement order.
3. `lib/markets/cancel-date-cascade.ts:20-31` and `:402-493` — **why park bookings go to `cancelled` and never `expired`.**
4. `api/market-manager/[marketId]/park-bookings/[bookingId]/bar/route.ts:12-20` — the "book-then-vet" enforcement model in eight lines; it explains why barred bookings stay `paid`.
5. `lib/markets/park-week-schedule.ts` — how an operator actually reads their park: by day, not by truck.
6. Migration `20260718_201_park_date_cancel_credit.sql` — the newest and least-settled money surface.

## The model: book first, vet after

A truck can book a spot **without** having submitted documents — booking requires only `doc_ack_accepted: true` (`book-park-spot/route.ts:51-55`). Compliance is enforced afterwards by the operator, through vetting (block future bookings) and barring (block a specific booking). This is deliberate: it keeps the booking funnel open and puts judgment with the operator.

Consequently **barring does not refund.** A barred booking keeps `status='paid'` so the slot is not resold, the truck forfeits the money, a reason is required, and the truck is notified. That truck's buyer orders for the date are refunded separately via `runBarredBookingOrderCascade`.

## The flow

1. **Enable paid mode.** `PUT park-mode/route.ts` sets `park_mode='paid'`; the operator completes Stripe Connect. Both are hard gates downstream (`book-park-spot/route.ts:66-75`).
2. **Spot listing.** The operator adds `park_spots` rows with a **per-day** `base_price_cents`. An optional `recurring_eligible` flag governs standing holds. Operating days come from the shared `market_schedules`; `required-docs/route.ts` publishes the compliance note (enforcement stays human).
3. **Truck books a spot** — `POST book-park-spot/route.ts:27`. Gates in enforcement order: `park_mode='paid'` → operator Stripe-ready → spot exists, active, in-market → `park_vendor_vetting.blocked !== true` (**fail-open when the row is absent**) → at most `PARK_SPOT_MAX_DATES` dates → each date is future, an operating day, not a cancelled override, and inside the season window → total ≥ the FT minimum. Then `book_park_spot_atomic` (migration 172) creates all rows **all-or-nothing**; a 409 means the slot was taken. Booth credit is applied, then `createParkSpotCheckoutSession`, with the session id stored on every row in the group. **On Stripe failure the redeemed credit is released *before* the rows are deleted**, because the delete SET-NULLs the FK.
4. **Payment lands** via the `park_spot` webhook branch, flipping the group to `paid`. Meanwhile the slot is held by a partial unique index on `(spot_id, booking_date)` covering `pending_payment|paid`.
5. **Standing reservations.** The truck *requests* a recurring day-of-week hold → `requested`; the operator approves → `active`. Constants (`park-standing.ts:26-31`): prepay cutoff **2 days**, strike limit **3**, rolling window **32 days**, generation horizon **7 days**.
6. **Occurrence generation** — the daily sweep `runStandingOccurrenceSweep` (cron Phase 21), in three steps:
   - **Expire** past-cutoff unpaid standing occurrences and abandoned one-off pending bookings (24h TTL or past date). The Stripe session is expired **first** so a stale tab can't charge for a released slot; if expire throws, the flip is skipped. The flip is guarded on `status='pending_payment'`, and any redeemed credit is released.
   - **Generate** the next occurrence per active hold as a `pending_payment` row that occupies the slot. Skips: inactive spot · park not `paid` or Stripe-disabled (otherwise *every* anchor would be struck into suspension) · blocked vendor · before `requested_start_date` · beyond horizon · outside the season window · closed day or cancelled date · existing booking or occupied slot. Notifies with the pay-by date.
   - **Auto-suspend** any active hold at or over the strike limit, guarded on `status='active'`, and notify.
7. **Truck pays the occurrence** via `api/vendor/park-occurrences/[bookingId]/pay/route.ts` before the prepay cutoff. This attaches the existing pending row to a booking group and reuses the park checkout — **it does not create a new booking.**
8. **Check-in.** `market_day_checkins` rows; `park-checkin-reminders.ts` nudges paid-but-not-checked-in trucks three times on the operating day (open, midday, pre-close).
9. **Strikes are computed on read — there is no strike table.** `getStrikeCountsForReservations` (`park-standing.ts:114-203`) derives them from two sources: `expired` occurrences (missed prepay) and `paid` occurrences whose market-local day is fully over with no check-in (no-show). Bookings with `manager_barred_at` set are excluded, so **a barred truck isn't struck for obeying**. `countLiveStrikes` applies the 32-day rolling window and the manager's `strikes_reset_at`.
10. **Operator cancels a park day** — the shared `cancel-date` route, cascade path D (`creditParkSpotBookings`):
    - Guarded flip to `'cancelled'` — **never `'expired'`**, because the strike engine reads `expired` as missed prepay, and an operator cancellation must not strike the truck.
    - Credits only **paid and un-barred** bookings. Barred = forfeit stands; `pending_payment` = never paid.
    - Credit amount = `calculateBoothRentalFees(price_cents, operator_keep_pct).vendorPaysCents` — what the truck would pay today. The fee-drift caveat is explicitly accepted in the header.
    - Idempotent via the migration-201 partial unique index: a re-run's insert 23505s to a no-op. Pre-migration failure logs `ERR_REFUND_001` and still cancels the booking.

## Booth credits in the park domain

Parks reuse the FM `booth_credits` ledger — **there is no separate park credit table**, and there is no park season settlement, so grants happen at cancel time rather than at close.

- **Minted** by `creditParkSpotBookings` with `source='park_date_cancel'` and `related_park_booking_id`. Migration 201 widens the source CHECK, adds the FK column `ON DELETE SET NULL`, and creates `uq_booth_credit_park_booking_grant` — **one grant per booking, ever**.
- **Redeemed** at the truck's next park booking via `redeem_booth_credit` with `p_park_booking_id`. Cap: `min(totalManagerReceivesCents, totalVendorPaysCents − 50)` so the residual charge clears Stripe's minimum and the operator transfer stays ≥ 0. **Credit reduces both the vendor charge and the operator transfer**, because the operator was already paid on the cancelled booking.
- **Released** in two places, both logging `CRITICAL` for manual re-credit on failure: Stripe session creation failure, and the daily sweep expiring an unpaid booking.
- **Expired** by the shared FM Phase-19 sweep.

> **UNVERIFIED — worth confirming before relying on either outcome:** `park_date_cancel` grants are inserted **without an `expires_at`**. Under the Phase-19 rule a balance is only zeroed when there is no live grant, so how `get_booth_credit_expiry_state` (migration 198) classifies a NULL-`expires_at` grant determines whether park credits expire at all. Read the migration body before assuming.

## Operator routes

| File | Purpose | Money |
|---|---|---|
| `market-manager/[marketId]/park-mode/route.ts` | PUT `park_mode` (`free` vs `paid`) | Gates money |
| `market-manager/[marketId]/park-spots/route.ts` · `[spotId]/route.ts` | Spot CRUD with per-day `base_price_cents`; 409 on duplicate `(market_id, label)` | **Yes** (price) |
| `market-manager/[marketId]/standing-reservations/route.ts` | List requested + active holds; `approve` / `revoke` / `reinstate` — manager authority always | Indirect |
| `market-manager/[marketId]/park-bookings/[bookingId]/bar/route.ts` | Bar a specific paid booking (no refund, slot not resold) + cascade refunds to that truck's buyer orders | **Yes** |
| `market-manager/[marketId]/park-vetting/[vendorProfileId]/route.ts` | Block/unblock future bookings; mark docs reviewed or flagged; a new block notifies the truck | No |
| `market-manager/[marketId]/required-docs/route.ts` | Free-text compliance note shown at booking; enforcement stays human | No |

**Shared with FM, no fork:** `schedules`, `cancel-date`, `attendance`, `broadcast`, `stripe/onboard`, `stripe/status`, `documents`, `logo`, `branding`.

## Vendor-side park routes

These live under `api/vendor/`, not `market-manager/`:

| File | Purpose | Money |
|---|---|---|
| `vendor/markets/[id]/book-park-spot/route.ts` ⚠ | Book one spot for one or several dates; one Stripe destination charge to the operator | **Yes** |
| `vendor/markets/[id]/standing-reservation/route.ts` | Request a recurring hold → `requested` | No |
| `vendor/park-occurrences/[bookingId]/pay/route.ts` ⚠ | Pay an already-generated occurrence before the cutoff | **Yes** |

## Library

| File | Purpose |
|---|---|
| `lib/markets/park-spot-types.ts` | Types for `park_spots`; `base_price_cents` is **per day**, fed to the unit-agnostic `calculateBoothRentalFees` |
| `lib/markets/park-booking-types.ts` | Types + `PARK_SPOT_MIN_CHARGE_CENTS`, `PARK_SPOT_MAX_DATES` |
| `lib/markets/park-standing.ts` ⚠ | The occurrence engine (~440 lines): generate, expire, strike, auto-suspend |
| `lib/markets/park-week-schedule.ts` | Day-scoped "week at this park" view: per operating day, trucks with spot, recurrence and payment state, plus glance counts |
| `lib/markets/park-docs-review.ts` | Notifies an operator once when an affiliated consented truck's docs changed since last review; all comparisons are absolute instants |
| `lib/markets/park-checkin-reminders.ts` | Day-of check-in nudges; guards against false no-show strikes |

Cross-domain but park-critical: `cancel-date-cascade.ts` path D, and `checkin-eligibility.ts`.

## UI

`components/market-manager/FtParkDashboardBody.tsx` (the FT shell, rendered by the dashboard fork) · `ParkSpotsManager.tsx` ⚠ · `StandingReservationsCard.tsx` · `ParkWeekCard.tsx` · `ParkOnboardingChecklist.tsx` · `ParkRequiredDocsCard.tsx`. Truck-facing: `app/[vertical]/markets/[id]/book-spot/page.tsx` and `app/[vertical]/vendor/park-bookings/page.tsx`.

## Selling gate — paid parks sell only on paid dates

A truck's listings are only orderable at a paid park on dates it has actually **paid** for. This is enforced inside the `get_available_pickup_dates` RPC (migration 199), which requires a `park_spot_bookings` row with `status='paid'` for the `(vendor, market, date)` at `park_mode='paid'` FT markets, and excludes barred bookings (`manager_barred_at IS NULL`, migration 200).

Because the gate lives in the RPC, it propagates to every wrapper function and display surface by construction — there is no application-level duplicate to keep in sync. `guardrail-contracts.test.ts` Rule F pins both invariants so a future `CREATE OR REPLACE` from an older body cannot silently drop them. See [23_Test_Suites.md](23_Test_Suites.md).
