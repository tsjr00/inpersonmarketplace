# Managed-market obligation — design stage (started 2026-09-18)

Owner rulings that drive this (OB-026 #3, OB-027 part 2, 2026-09-18):
- OFF-APP market (no `markets.manager_user_id`): the vendor's own active attendance row IS the obligation.
- APP-MANAGED market (`manager_user_id` set): "scheduled" should mean a REAL booking — paid park spot (FT),
  paid booth week (FM with fees), or approved roster + attendance row where the market is free.
- Open: may an UNPAID vendor sell a week at a fee-charging managed FM market? (today: yes)
- Owner: "begin the planning process so we can correctly tie these decisions together and build them correctly."

## Method
Inventory EVERY surface that answers "is this vendor attending / scheduled / allowed to sell / to be paid here",
record what each one uses TODAY (cited), then decide per surface, then build in one coordinated change set.
Rule 7 (inventory before design): map first, rule second.

## Surface inventory (checklist — write findings immediately)
- [ ] S1 SQL sell gate `get_available_pickup_dates` (mig 238 body, read 2026-09-17)
- [ ] S2 Vendor "Your next two weeks" strip (`lib/vendor/week-strip.ts`)
- [ ] S3 Vendor dashboard tiles: Upcoming Pickups / Locations & Schedule (`vendor/dashboard/page.tsx`)
- [ ] S4 Conflict checker `lib/events/availability.ts` (read in full 2026-09-17)
- [ ] S5 Booking guards: `lib/events/booking-event-guard.ts`, schedules route + mig 253 trigger
- [ ] S6 Manager roster (`VendorBoothList` + roster API) — approved / is_active_schedule / paid week (new)
- [ ] S7 Buyer-facing market visibility `lib/markets/visible-markets.ts` + market page vendor list
- [ ] S8 Booth conflict checks `lib/markets/booth-conflict-checks.ts` (pinned booth vs rentals)
- [ ] S9 Check-in (`market_day_checkins`) — who may check in
- [ ] S10 Cancel-date cascade — who is credited (paid rentals) — `cancel-date/route.ts`
- [ ] S11 FT paid parks — how "booking = selling" is enforced today (mig 199 + park_spot_bookings)
- [ ] S12 Free managed markets — is "approved roster" enforced anywhere today?

## Findings (per surface) — read 2026-09-18, cited

**Vocabulary today (four different "in" states, none of them "paid"):**
- *Roster row* = `market_vendors` (applied / approved / revoked) — the manager's relationship.
- *Attendance row* = `vendor_market_schedules.is_active` — the vendor's own "I sell here on this weekday".
- *Pinned booth* = `market_vendors.booth_number` — the manager's standing spot assignment.
- *Paid week / day* = `weekly_booth_rentals.status='paid'` (FM) / `park_spot_bookings.status='paid'` (FT).
- *Managed* = `markets.manager_user_id` set. *Charges vendors* = FT `park_mode <> 'free'`; FM any
  `market_booth_inventory.weekly_price_cents > 0` (`schedules/route.ts:48-59`).

| # | Surface | What it uses TODAY | Managed+charging FM gap? |
|---|---|---|---|
| S1 | SQL sell gate `get_available_pickup_dates` (mig 238) | Traditional (FM+FT): active attendance row (`:162`). FT PAID parks additionally a PAID booking for the date (mig 199, `:292-311`). Events: attendance/selection. | **YES — FM never checks payment**; an unpaid vendor's items sell. |
| S2 | Week strip `week-strip.ts` | Active attendance rows (`:300-308`) for every traditional market + paid park days + paid booth weeks + standing holds (`:355-380`) + selected events + boxes. | **YES** — the attendance row alone puts a managed fee market on the strip every week; a paid week ADDS a second entry (dedupe UNVERIFIED in `assembleStrip`). |
| S3 | Dashboard tiles | UNVERIFIED this pass (reads `market_box_pickups` + events; likely same strip loader) | check at build |
| S4 | Conflict checker `availability.ts` | Attendance rows + PAID park days + PAID booth weeks + accepted events (`:294-345`) | Consistent with "commitments" — an unpaid managed week counts only via the attendance row. |
| S5 | Booking guards: event↔booking (`booking-event-guard.ts`), schedule conflicts (route + mig 253) | Attendance rows + accepted events; declaration exempts | No payment concept; fine. |
| S6 | Manager roster (`VendorBoothList` + roster API) | approved / attendance row / pinned booth / (new 2026-09-18) `has_paid_booth_week` note | Closed for VISIBILITY by TR-072; enforcement is S1. |
| S7 | Buyer market visibility `visible-markets.ts` | Published listing + active attendance row, same vendor (`:30-55`) | **YES** — an unpaid vendor makes the market "open" to buyers. |
| S8 | Booth conflicts `booth-conflict-checks.ts` | pinned booth vs placeholders vs rentals `pending_payment`/`paid` (`:98-102`) | Fine (uniqueness only). |
| S9 | Check-in (`attendance/route.ts`) | FT: manager check-in requires a PAID spot that date (`:141-150`). FM: UNVERIFIED (route is park-shaped). | FM check-in has no paid-week gate (to verify). |
| S10 | Cancel-date cascade (`cancel-date-cascade.ts` header) | Paid booth renters notified (credit/reschedule manual); paid park days credited to `booth_credits`. | Consistent: only PAID rows get money handling. |
| S11 | FT paid parks | Booking = selling = paid (mig 199 D1); check-in needs paid; standing holds prepay. | The model to copy. |
| S12 | Managed-join gate (`schedules/route.ts:40-75`) | At a MANAGED market that CHARGES, a vendor cannot activate a schedule until roster-APPROVED (grandfathered: prior schedule rows). FREE managed markets: no approval needed. | Approval is enforced only where money is involved — but PAYMENT itself is never enforced on FM. |

**The shape of the gap, in one sentence:** for FM, the app knows about paid booth weeks (S2/S4/S8/S10 all read them)
but never REQUIRES one — selling (S1) and buyer visibility (S7) run on the attendance row alone, so at a
fee-charging managed FM market an approved vendor can be listed, be "scheduled" and take pre-orders for weeks
they never paid for. FT paid parks already close this at S1 + S9.

## Decisions for the owner

D1. **Should the FM sell gate require a PAID booth week at a managed, fee-charging market** (mirror of FT mig 199)?
    Effect: items at that market show no pickup dates for unpaid weeks; the market drops off "open" for that
    vendor's items. Off-app markets and free managed markets: unchanged (attendance row). Migration on the
    19×-rewritten function (workflow: live body from all 3 envs first). Recommendation: YES — it is the rule you
    stated, and FT already lives by it.
D2. **Grace for the transition:** vendors already attending fee markets today have attendance rows and NO rentals.
    Flipping D1 makes them disappear from sale immediately. Options: (a) flip on Staging only until launch (Prod has
    seed only — no real FM fee markets yet: VERIFY with an inventory query); (b) a dated cutover. Recommendation:
    (a) — Prod has no real FM fee-market vendors yet, so there is nothing to grandfather.
D3. **Week strip at managed fee markets:** show the week only when a paid week exists (and show "pay-by" for an
    unpaid upcoming week, like the FT standing-hold 'payment_due' entry)? Recommendation: YES — same shape as FT.
D4. **Buyer visibility (S7):** should a market count as "open" for a vendor only with a paid week? Recommendation:
    YES, derived from the same predicate as D1 (one shared rule, not two).
D5. **Conflict checker / schedule gates (S4/S5):** keep attendance rows as commitments (a vendor who declared a
    weekday is committed even before paying)? Recommendation: YES, unchanged — commitments ≠ selling rights.
D6. **Free managed markets:** "approved roster + attendance row" — S12 today lets vendors schedule WITHOUT approval
    when the market is free. Should approval be required at every managed market? Recommendation: owner call; the
    2026-09-05 apply-flow decision made approval the manager's gate — I lean YES for consistency.

## RULED 2026-09-18 (owner): D1 yes · D2 yes, Staging first · D3 yes · D4 yes · D5 leave as is · D6 yes
→ decisions.md 2026-09-18 row. Build go NOT yet given.

## BUILD 2026-09-18 (owner "go - build the set") — pieces 1–4 + mig 255 BUILT, piece 5 STOPPED
- Built: `lib/markets/managed-fee-gate.ts` (TS twin) · `visible-markets.ts` + `market-visibility.ts` clause (c) +
  `MarketVisibilityCard` names it · `week-strip.ts` requiresPaidWeek → 'payment_due' · mig
  `20260918_255_managed_fee_markets_sell_paid_weeks.sql` (254 + CTE column + one predicate + COMMENT; body md5 CRLF
  `dd446c1a4b70b10db45708e568181156`/12790, LF `adc6bf36b063774fdeda7057b25818ae`/12504) · paired rule
  `managed-fee-market-sells-paid-weeks` + 3 pins · snapshot row (NOT APPLIED) · map lines. Gates: tsc 0 · eslint 0
  errors · vitest 90 / 2232. UNCOMMITTED.
- ⛔ **Piece 5 (D6, approval at FREE managed markets) STOPPED — CONFLICT with a recorded owner rule + its pin.**
  `schedules/route.ts:22-34` header: owner 2026-09-05 "if it's free then even if it's managed we don't force vendors
  through the application path"; `flow-integrity.test.ts:2439-2456` pins "free stays open". D6 as ruled today
  reverses that. Per Absolute Rule 2: no code, no test change until the owner rules on the conflict knowingly.

## FOLLOW-UP RULED 2026-09-18: "free markets should require the terms" (decisions.md) — NOT YET BUILT
Shape (read 2026-09-18): the vendor UI is `components/vendor/MarketScheduleSelector.tsx` (461 lines; PATCH per
toggle at `:110`, `:160`; GET `:76`; used only by `app/[vertical]/vendor/markets/page.tsx`). Plan:
1. Schedules GET returns `needs_terms` = managed market AND no roster row / no `vendor_market_agreement_acceptances`
   row for this vendor+market (grandfathered = has either).
2. Selector: when `needs_terms`, render `MarketAgreementBlock` (+ the doc-sharing opt-in used by Apply) ABOVE the
   day toggles; toggles disabled until "I agree"; the first activating PATCH sends `agreement_accepted` +
   `info_sharing_accepted`.
3. Schedules route (PUT + PATCH): when the market is managed, free, and the vendor has no roster/acceptance row,
   an activating write without `agreement_accepted === true` → 409 `ERR_MARKET_TERMS_REQUIRED`; with it → record
   the acceptance (statements + platform clauses + optional consent; same shape as Apply) alongside the auto
   roster row. Charging markets are unaffected (Apply already records).
4. Pin: both writers require terms on first join at a free managed market; GET exposes `needs_terms`.
Size S–M. Owner's go still needed.

## Build plan (after decisions) — one coordinated change set, ONE push
1. Shared predicate `vendorSellsAtMarketOnDate(vendor, market, date)` in `lib/markets/` + SQL twin in the sell
   gate (mig 255) — register as a paired rule with a behavioural pin (same pattern as event-sells-on-acceptance).
2. Mig 255: FM branch of `get_available_pickup_dates` gains "managed + charges → paid week covering the date".
3. `visible-markets.ts` uses the predicate (D4). `week-strip.ts` (D3): managed fee market entries come from paid
   weeks; unpaid upcoming = 'payment_due'.
4. S12 (D6) if ruled: drop the `chargesVendors` bypass.
5. Registry rows + retests; Prod inventory query for D2 before any prod paste.
