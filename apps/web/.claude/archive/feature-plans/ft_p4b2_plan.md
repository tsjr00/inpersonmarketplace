# P4b-2 Scope — no-show strike + check-in reminders + manager_confirmed override

**Created:** 2026-07-02. **Mode:** FIX (building; user activated 2026-07-02 — "take your time, do it right"). Commit 3 of 3 for P4. Commit/push still user-gated.

## BUILD LOG (in progress)
- Tripwire: NI-014 `cutoff-and-sort-functional.test.ts:187` = 88 → bump to 89 (add `park_checkin_reminder`, user-approved).
- Foundations verified: cron-helpers timezone fns (pure); surveys cron `runMarketDayNotifications` = template for the reminder block; notif registry `src/lib/notifications/types.ts` (union ~:114, templates ~:893).
- **ALL PARTS BUILT (2026-07-02, UNCOMMITTED). Gates: tsc 0, lint clean, vitest 1575/1575 (+9).**
  - Part 1: `park-standing.ts` — `isNoShowStrike` (pure) + `getStrikeCountsForReservations` now counts paid-past-no-checkin as a 2nd strike source; `StandingReservationLite` gained market_id/vendor_profile_id/timezone; both callers updated (sweep `active` query +timezone join & activeLite; manager GET route +market_id/vendor_profile_id/markets(timezone)).
  - Part 2: NEW `park-checkin-reminders.ts` (`checkinReminderWindow` pure + `runParkCheckinReminders`); wired into hourly surveys cron (independent try/catch block); 1 notif type `park_checkin_reminder` registered (+union +template +NotificationTemplateData.window); NI-014 tripwire 88→89.
  - Part 3: attendance route +POST "mark present" (eligibility=paid booking that day; insert-or-stamp market_day_checkins.manager_confirmed); `MarketAttendanceCard` +"Mark present" button on the no-show roster.
  - Tests: +3 isNoShowStrike, +6 checkinReminderWindow. Verified sendNotification persists `data` (service.ts:141) so reminder dedup reads back marketId/marketDate/window.
  - NO migration. NO edits to payments.ts/webhooks.ts. One commit pending user approval.
**Design source:** `ft_park_manager_design.md` P4 + `current_task.md` "Immediate next action = P4b-2".
**Verified anchors this session** (cite before building): strike engine `park-standing.ts:90-116`; shared by manager GET `standing-reservations/route.ts:57` + cron sweep `park-standing.ts:238`; check-in table cols `mig 160 (applied):27,43-45,49`; hourly cron `/api/cron/surveys` (`vercel.json 0 * * * *`); timezone helpers `src/lib/surveys/cron-helpers.ts` (`computeFireMomentLocal`, `recentLocalDates`, `parseTimeToMinutes`); market tz = `markets.timezone` (used `book-park-spot/route.ts:110`).

> ⚠️ Naming: an existing `src/lib/cron/no-show.ts` handles **buyer pickup** no-shows (unrelated). Name this domain distinctly — "check-in no-show" / "attendance no-show" — to avoid collision.

---

## Risk posture
Moderate. The sharp edge is that this feeds the **cron auto-suspend** of a real anchor truck's recurring hold (`park-standing.ts:239-260`). A false no-show strike can wrongly suspend a paying vendor. Mitigations (all in scope): finalize only after the day is fully over (market-local), the `manager_confirmed` override, the 3 reminders, and manager reinstate. **No money path touched** (compute-on-read; no Stripe). Generator/sweep are prod-cron-only, so the full loop still isn't staging-smoke-testable without a seeded row.

---

## Part 1 — No-show strike source (extend the strike engine)
Extend `getStrikeCountsForReservations` (`park-standing.ts:90-116`) to add a 2nd strike source alongside `expired`:
- A `paid` `park_spot_bookings` occurrence **with `standing_reservation_id` set** (only standing occurrences strike — a one-off no-show doesn't),
- whose `booking_date` is **fully in the past in market-local time** (day over),
- with **no** `market_day_checkins` row for `(market_id, vendor_profile_id, booking_date)`,
- and **not** `manager_confirmed`.
- Event date for `countLiveStrikes` = `booking_date` (same basis as expired). Combine both source date-lists, feed existing `countLiveStrikes` (unchanged).
- Because the function is shared, this flows to BOTH the manager display and the auto-suspend automatically — no separate wiring.
- **NO migration** (all columns exist).
- Implementation note: the fn currently takes `(reservations, todayISO)`; no-show needs each reservation's **market timezone** + a join to bookings/checkins. Likely pass market tz per reservation (or group by market) and use `recentLocalDates(tz)` for the day-over gate.

## Part 2 — 3 check-in reminders (intraday) — the most new surface
Hook an **independent block into the hourly surveys cron** (`/api/cron/surveys` — precedent at `surveys/route.ts:70-71`, "same hourly cron; independent; failures captured separately"). Avoids editing `vercel.json` (deployment config → would need to ask).
- For each FT `park_mode='paid'` market with an operating day **today (market-local)**, derive open / midday / pre-close moments from `market_schedules.start_time`/`end_time` via `parseTimeToMinutes` + `computeFireMomentLocal` (reuse Session-81 helpers).
- When the current hour matches a window, notify trucks with a **paid booking that day** who have **no check-in yet** and **not manager_confirmed**.
- Reuse `sendNotification(userId, type, data, { vertical })`.

## Part 3 — manager_confirmed override (small, low-risk)
Manager marks a truck present for a date → sets `market_day_checkins.manager_confirmed` (+ `_by`/`_at`). If no row exists, INSERT (method='manager', manager_confirmed=true); else UPDATE. The Part 1 no-show computation treats manager_confirmed OR a real check-in as "present." Natural home: the existing no-show roster on `MarketAttendanceCard` (P3c) — a "Mark present" action per listed truck. **NO migration.**

---

## DECISIONS — LOCKED (user, 2026-07-02)
1. **No-show finalization** = only once market-local today > booking_date (day fully over). ✅
2. **Reminder idempotency = option (a)** — batched, indexed dedup query against `notifications` (`WHERE user_id IN (targets) AND type='<reminder>' AND created_at >= today_start`, uses `idx_notifications_user_created`; match marketId/date/window in the `data` JSON on the small result set). Verified: no security loss (internal cron/service read) + no efficiency loss (indexed, bounded to today). **→ NO migration.** ✅
3. **1 notification type** with an open/midday/close `window` data field. **NI tripwire counter +1** (currently 88 after P4b-1 → 89) — user approved the bump. ✅
4. **Strike condition = day-over + no-checkin + not-manager-confirmed.** Reminders are courtesy nudges, not a hard gate on the strike. ✅
5. **manager_confirmed** action lives on `MarketAttendanceCard` no-show roster (P3c). ✅
6. **One commit** for all of P4b-2. ✅

## Migration? — NONE. All three parts are migration-free (columns verified present; dedup uses existing notifications table).

## Tests to add (flow-integrity / unit — assert the rule, never edit to match code)
- Strike engine counts a paid+past+no-checkin standing occurrence as a strike; does NOT count if checked-in, manager_confirmed, future/today, or one-off (no standing_reservation_id).
- Auto-suspend still fires at limit via the combined sources.
- Reminder targeting: only paid-that-day + not-checked-in trucks; idempotent per window.
- manager_confirmed cancels that day's no-show.
