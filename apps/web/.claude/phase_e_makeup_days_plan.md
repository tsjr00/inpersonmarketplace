# Phase E — Season Make-up Days (booth-only, v1)

**Created:** 2026-06-29. **Mode:** Report (plan only — no code/migrations until each step is approved).
**Parent feature:** the deferred "season make-up / extend-a-season" work — the keystone that three earlier
deferrals were waiting on (the reserved `'ended'` status, in-platform settlement credit, make-up dates).
**Design source:** `phase_e_booth_granularity_prepay_plan.md` (O1–O6) + `phase_e_remaining_build_plan.md`
(Item 2/4 LOCKED decisions). **Decisions logged:** `decisions.md` 2026-06-29 (two rows).

---

## The problem this closes

A season booking lifecycle is **sold → active → wound-down**. The sold/active half is live on prod. The
wound-down half has one remaining gap: when a manager cancels operating days beyond the season's
`refund_cap_days`, the vendor is owed booth time, and today there is **no way to give it back** — only an
off-platform attestation that the manager settled directly. Make-up days deliver the owed booth time
*in-platform*, reducing the manager's settlement debt, with **no money movement**.

---

## The complexity decision (why fulfillment, not redemption)

Two models were considered:

- **Redemption model (REJECTED):** a make-up day is a new booth *booking* the vendor pays for by redeeming
  a settlement credit (reusing Item 4 `redeem_booth_credit`). Rejected because make-up days fall after
  season close (new weeks) and several can be squeezed into one post-close week — colliding with the
  week-grained `UNIQUE (vendor_profile_id, market_id, week_start_date)` rental model (`mig 139:83`), and
  dragging in checkout, the Stripe ~$0.50 minimum edge, and possibly the protected `payments.ts`.

- **Fulfillment model (CHOSEN):** the vendor already *paid* for their season days; a cancelled day is a day
  the manager owes; scheduling a make-up day *delivers* that day. The vendor shows up to their booth — no
  new charge, no credit redeemed, no rental row. The system's only jobs: record the date, notify affected
  vendors, reduce the settlement debt. **Touches no money path at all in v1.** The user's "any day of week"
  requirement is *free* here (the date is explicit on the override row; no `day_of_week` matching).

This honors the user constraint: do not make code complex for a seldom-used feature.

---

## Scope

**In v1 (booth-only fulfillment):**
- Manager declares make-up capacity at season setup.
- Manager schedules make-up dates (any day of week) in a post-close window.
- Affected vendors are notified; their cancelled-day debt is reduced.
- The season lifecycle gains a real `ended` (make-up-window) state before `settled`.
- First real settlement-enforcement (next-season pre-sales blocked until prior season settled).

**Explicitly OUT of v1 (deferred):**
- Buyers pre-ordering product for pickup on a make-up day → **Phase 2** (this is the
  `get_available_pickup_dates` critical-path work; any-DOW make-up dates add Phase-2 cost because that RPC
  is weekly-schedule-driven and `validate_cart_item_schedule` filters on `schedule_id`).
- Credit-redemption-on-booking for make-up days (not needed under the fulfillment model).
- Per-vendor make-up *attendance* tracking (manager attestation covers it).
- Option B balance-limited cash-out (separate backlog item).

---

## Resolved decisions (user, 2026-06-29)

1. **Capacity field — opt-in, ≥2 when set.** `market_seasons.potential_makeup_days INTEGER NOT NULL
   DEFAULT 0 CHECK (potential_makeup_days = 0 OR potential_makeup_days >= 2)`. Mirrors the
   `refund_cap_days` precedent (`NOT NULL DEFAULT 1 CHECK >= 0`, `mig 164:51`). `0` = "no make-up buffer
   this season." Editable (PATCH) until the season ends.
2. **Make-up date = `market_date_overrides` `status='special'`** — already in the table CHECK and reserved
   for exactly this (`mig 161:30-31`, comment `:5-6`). Market-wide, any DOW, post-close, **no hard date
   ceiling**. The `UNIQUE (market_id, override_date)` landmine (`mig 161:37`) is a non-issue: make-up dates
   fall after close, cancellations happen during the season — the date ranges don't overlap.
3. **`'ended'` = the make-up-window state.** Wire the reserved status (`mig 164:57-58`; currently never
   set/read — `flow-integrity.test.ts:513-522`). Lifecycle: `active` (running) → `ended` (closed, make-up
   window open) → `settled`. Make-up dates can only be scheduled while `ended`.
4. **`active → ended` = manager-clicked + cron auto-end backstop.** Primary path is a manager action
   ("End season & open make-up window") so a manager with no cancellations can settle immediately. A cron
   (reuse `expire-orders`) auto-flips `active → ended` a grace period after `end_date` so the lifecycle
   **cannot be frozen** in `active`.
5. **Netting = per-group manager attestation.** New settlement resolution `'made_up'` (a 0-amount marker,
   same mechanic as `off_platform` at `settlement/route.ts:202-209`), applied per group, defaulting to
   "fully made up" but lowerable for a vendor who couldn't attend an off-DOW make-up day; the residual is
   still resolvable `off_platform`. Chosen over blind auto-subtraction because it's fair when a make-up
   day's DOW doesn't suit every vendor.
6. **Settlement enforcement (NEW — the first real one).** (a) clean-close gate already blocks marking a
   season `settled` while debt is open; (b) **block opening the NEXT season's pre-sales until the prior
   season is `settled`** (reuses the one-open-season index `mig 164:71-72`) — ties future booth revenue to
   settling past debt; (c) escalating reminder notifications while debt is open. Today **nothing** forces a
   manager to settle, so this adds the first enforcement rather than removing one.
7. **No credit rollover to the next season.** Automatic consequence of (6b): the prior season must settle
   before the next can open, so no debt/credit carries over. No hard window date needed — the window
   self-closes when the manager wants to sell again.

---

## Data model changes (all additive, NO protected files)

| Change | Detail |
|---|---|
| `market_seasons.potential_makeup_days` | new column, opt-in, ≥2 when set (decision 1) |
| `market_date_overrides.status='special'` | reuse existing reserved value — no table-shape migration |
| `market_seasons.status='ended'` | wire the reserved value (decision 3) |

No change to `weekly_booth_rentals`, `booth_booking_groups`, `payments.ts`, `webhooks.ts`,
`get_available_pickup_dates`, or any cart/checkout file.

---

## Settlement math (no formula rewrite)

Today: `getGroupCancelledDays` counts only `'cancelled'` rows (`cancelled-days.ts`), and
`owedForGroup` = `max(0, cancelledDays − cap) × perDayBase` (`settlement/route.ts:118`,
`settlement-math.ts`). Make-up resolution is **per-group attestation**, not a counter change: the manager
marks a group `'made_up'` (full or partial), which resolves it the same way `off_platform` does today. The
owed math is only *displayed* for context; the resolution closes the group.

---

## Build sequence (each = its own present → approve → build → gate → review cycle)

1. **Migration** — add `potential_makeup_days` to `market_seasons` (DDL presented for approval; user
   applies Dev→Staging; Claude does SCHEMA_SNAPSHOT changelog bookkeeping). No money path.
2. **Lifecycle** — `active → ended` manager action + cron auto-end backstop + the make-up-window guard
   (status set today at `seasons/route.ts:131/191/208`). Block next-season open until prior settled.
3. **Make-up-date scheduling** — manager API to insert a `'special'` override (count-capped by
   `potential_makeup_days`, post-close, `isMarketManager`-gated) + the `booth_makeup_scheduled_vendor`
   notification (tripwire 84→85 — presented, never bumped silently).
4. **Settlement** — add the `'made_up'` resolution value to the settlement route (per-group, partial-able).
5. **Tests** — flow-integrity contracts for the new lifecycle + the `'made_up'` resolution + the
   next-season-block gate. (Assert the business rule; a failure is a decision point, never edited to pass.)
6. **UI (deferred, per user)** — manager screens to end the season, schedule make-up dates, and settle.
   Logic ships and is API-verifiable first; UI layers on after.

---

## Risk notes

- **No protected/critical-path files in v1.** The entire money path (`payments.ts`, `webhooks.ts`,
  checkout, `redeem_booth_credit`) is untouched. This is the lowest-risk way to close the season lifecycle.
- **Phase 2 (buyer pre-orders for make-up days)** is where the real risk lives — `get_available_pickup_dates`
  is `SECURITY DEFINER`, anon-executable, and feeds the cart/checkout validator for every market; it is
  subtractive-only today (a `NOT EXISTS` on cancelled dates) and would need a new positive branch plus a
  way for `validate_cart_item_schedule`'s `schedule_id` filter to accept an off-DOW special date. Deferred
  deliberately.
- **Building this first de-risks the later Option B cash-out** — make-up-days-first means most shortfalls
  resolve as delivered booth time, shrinking how often (and how much) any cash-out is ever needed.

---

## Open items to confirm at build time

- The cron auto-end grace period (how many days after `end_date` before the backstop fires).
- Reminder-notification cadence/escalation for open debt.
- Whether `potential_makeup_days` is editable only by the manager or also admin.
