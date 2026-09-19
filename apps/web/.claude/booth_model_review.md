# Booth model review — pins, auto-assign, placeholders, rentals (started 2026-09-19, OB-028)

Owner: "This is a core function of the market management and revenue generation process, it has to be right and we
need a clear + comprehensive understanding of how it works + communicate it to managers & vendors. dig deep."

## How it works today (read, cited)

**Four kinds of booth fact at an FM market** (the "3-layer model", mig 186 header):
1. **Inventory tiers** — `market_booth_inventory`: size_label, count, weekly_price_cents. The manager's SUPPLY.
   Capacity is PER TIER; booth LABELS are MARKET-WIDE (default 1..sum(count); or `markets.booth_label_start/end`).
2. **Placeholders** (layer 1) — `market_booth_placeholders`: off-platform vendors the manager records by booth
   number (+ optional inventory_id). Reduce a tier's capacity only when inventory_id matches; always block a label.
3. **Pins** (layer 2) — `market_vendors.booth_number` (+ `inventory_id`, mig 145): the manager's STANDING
   assignment of an on-platform vendor to a label. No week, no payment. Written by `vendor-booth/route.ts`.
4. **Rentals** (layer 3 + payment) — `weekly_booth_rentals`: one row per vendor per week (UNIQUE), status
   pending_payment → paid (Stripe webhook) / cancelled; carries booth_number, price snapshot, inventory_id,
   agreement_acceptance_id. Booked by `book/route.ts` → RPC `book_weekly_booth_atomic` (mig 186); seasons loop it
   (`book_season_atomic`, mig 165, all-or-nothing).

**Booking (RPC, mig 186 `:79-251`):** advisory lock (market, tier, week) → tier capacity = count − placeholders in
tier − active rentals in tier this week (`:99-116`, OVERBOOKED) → if the vendor has a PIN, use it regardless of tier
(BOOTH_TAKEN if another rental holds it that week `:118-138`) → else smallest unused label in range, excluding this
week's rentals + placeholders + ALL pins (`:186-216`, LABELS_EXHAUSTED) → insert pending_payment (`:222-245`).
**Uniqueness trigger (mig 146 `:70-126`)** on rentals/pins/placeholders: (a) any pin with the same number blocks;
(b) any placeholder blocks; (c) for pins/placeholders, any active current/upcoming rental blocks. Self-exclusion
only by `id` within the SAME table.
**Booking does NOT require roster approval** (owner rule 2026-05-17, `book/route.ts:168-173`: "if there are open
booths and the vendor agrees + pays, the system should let them"). The header's "Gate 4: approved roster row"
(`:32-35`) is STALE — the code deliberately skips it.
**Paying** (webhook `lib/stripe/webhooks.ts:1469-1600`) flips the rental to paid and notifies; it writes NO roster
row and NO attendance row.
**Pending rentals** expire by cron: no Stripe session after 30 min, abandoned checkout after 24 h (expire-orders
`:2885-2925`); a redeemed booth credit is released.
**Manager tools:** pin/unpin + tier (`vendor-booth`), per-week booth override on a rental (`weekly-rental/[rentalId]`,
no vendor notification found), placeholders, inventory, label range. App-side pre-check
`lib/markets/booth-conflict-checks.ts` mirrors the trigger for the manager UI (rejects numbers held by pins,
placeholders, or `pending_payment`/`paid` rentals — no same-vendor exclusion either, `:98-102`).
**Selling:** since mig 255 a paid week is REQUIRED to sell at a managed fee market; the sell gate ALSO still
requires an active attendance row (`vendor_market_schedules`, mig 238 `:162`).

## Conflicts found (ranked by damage)

| # | Conflict | Effect | Evidence | Fix shape |
|---|---|---|---|---|
| C1 | **Pinned vendor cannot book their own booth** (OB-028). RPC honors the pin; trigger (a) sees the vendor's own pin as "another on-platform vendor". | Every pinned vendor is locked out of booking — and since 09-18 booking is how they get to sell. | 186 `:124-128` vs 146 `:84-92` | Mig 256: trigger (a)/(c) exclude rows with the same `vendor_profile_id`; same in `booth-conflict-checks.ts`. |
| C2 | **A paid week does not make the vendor sellable.** Paying creates no attendance row; the sell gate needs one; and setting one at a CHARGING managed market requires roster APPROVAL (`schedules/route.ts` managedJoinBlocked). A vendor who booked without applying (allowed) pays and still cannot sell or set a schedule. | Money taken, nothing sold, no path but "apply and wait". | book `:168-173`; webhook writes rental only; mig 238 `:162`; schedules gate | On PAID rental: ensure roster row (approved — payment IS the manager's supply decision per the 2026-05-17 rule) + activate the market's schedule rows for that vendor (or exempt paid-week holders from the attendance requirement in the sell gate). Owner decision. |
| C3 | **Booked tier ≠ pinned booth.** The vendor picks any tier (price) at booking; the pin decides the physical booth regardless of tier; `market_vendors.inventory_id` (the manager's tier for the vendor) is never enforced at booking. | Vendor pays the small-tier price for the large booth the manager pinned, or vice versa. Revenue leak / dispute. | 186 `:124-128` "regardless of the booked tier"; book route never reads `market_vendors.inventory_id` | Booking pre-fills and locks the tier to the pinned inventory_id when a pin exists; or the manager's pin must include the tier and the route enforces it. |
| C4 | **Pins are not capacity.** Auto-assign excludes ALL pinned labels but per-tier capacity ignores pins → LABELS_EXHAUSTED while capacity says room; conversely a manager can pin more vendors than a tier has booths. | Unpinned vendors refused with a confusing error; overselling by pins. | 186 `:99-116` vs `:186-216` | Count pins against the tier of `market_vendors.inventory_id`, or size the label range to count + pins. |
| C5 | **Pin persists after revoke.** Revoking approval never clears `booth_number`; the label stays blocked for everyone (trigger (a), auto-assign exclusion). | Dead booths after a vendor is removed. | `vendor-approval/route.ts` touches approved/revoked_at only | Revoke clears booth_number + inventory_id (or the manager is warned). |
| C6 | **Pin change vs existing rentals.** Changing a pin does not touch future paid rentals (they keep the old number); the next week books under the new pin. The per-week override route changes a rental's booth with no vendor notification. | Vendor's booth silently changes mid-season / week to week. | `vendor-booth/route.ts` (no rentals touched); `weekly-rental/[rentalId]` (no sendNotification) | Notify the vendor on any booth change; show the change on their strip. |
| C7 | **Manager cannot pin a vendor to the booth that vendor already rents** (app-side twin of C1). | Manager UI refuses a correct assignment. | `booth-conflict-checks.ts:98-102` | Same-vendor exclusion (with C1). |
| C8 | **Stale header on the booking route** claims approval is required. | Next engineer builds on a false rule. | book `:32-35` vs `:168-173` | Fix the comment when C2 is decided. |
| C9 | **FM cancel-date does not credit booth renters** — "identified for notification only; credit/reschedule manual"; FT parks auto-credit. | Manager must refund manually; vendors expect what FT gets. | `cancel-date-cascade.ts` header B vs D | Owner decision: mirror the FT auto-credit for booth weeks. |
| C10 | Placeholders without a tier consume a label but no capacity; custom label ranges narrower than inventory → LABELS_EXHAUSTED. | Confusing refusals. | 186 `:99-103, :211-216` | Validation on placeholder/range entry. |

## Pass 2 (2026-09-19, owner: "finish reading the four pieces first… accuracy not efficiency")

### Piece 1 — manager occupancy grid + weekly bookings card + manager write routes ✅ READ
**`BoothOccupancyGrid.tsx`** (manager dashboard, one week only: current week, or first in-season week `:86-97`):
- Occupants = ALL placeholders (`:105-108`) + ALL `market_vendors.approved=true` rows whether or not they have a
  booth number or a paid week (`:109-116`, `:148-154`; a pinless vendor renders "no booth #" `:344`) + PAID rentals
  for the week (`:117-125`; pending_payment NOT shown). A vendor with a paid rental this week replaces their pin
  row (`:159-173`). `filled` per tier = that union grouped by `inventory_id` (`:214-218`); NULL tier → warning bucket.
- **Consequence:** at a fee-charging market every approved-but-unpaid vendor is drawn as occupying a booth "this
  week". The grid's "N open" / "over capacity" is a THIRD capacity definition (see C4 below) — it agrees with
  neither the booking RPC nor the manager pin check.
**`WeeklyBookingsCard.tsx` + `WeeklyBookingsList.tsx`:** all rentals at the market (limit 400 `:61`), week picker,
inline booth-number editor on every non-cancelled row (`List :239`, editable on pending AND paid). Recurring roster
summarises multi-week vendors (`:132-148`). No link to pins; no notice when a rental's booth differs from the pin.
**`weekly-rental/[rentalId]/route.ts` (per-week override):** manager auth → direct UPDATE of `booth_number` on the
rental (`:70-79`); NO app-side pre-check, relies on the same-week unique index (23505 → 409 `:85-94`) and the mig 146
trigger (P0005 → 409 `:98-103`); no status restriction (`:27-30`); **no `sendNotification` anywhere in the file**
(confirms C6). Because trigger (a) also fires on rentals, a manager who types the vendor's OWN pinned number into
the vendor's rental row gets BOOTH_CONFLICT too (same mechanism as C1; 146 `:84-92`, v_table = rentals ⇒ no
self-exclusion).
**`vendor-booth/route.ts` (pin):** pre-checks via `checkBoothNumberAvailable` excluding only the vendor's own
`market_vendors` row (`:103-113`) — rentals arm (c) has no vendor filter (`booth-conflict-checks.ts:93-111`) ⇒ C7
confirmed; tier capacity via `checkTierCapacity` = placeholders + pins in tier ≤ count (`:115-128`,
`booth-conflict-checks.ts:182-215`) — rentals deliberately NOT counted (`:150-153`).
**Capacity ledgers — there are three, none reconciled (sharpens C4):**
| Ledger | Counts | Where |
|---|---|---|
| Booking RPC (per tier, per week) | placeholders in tier + pending/paid rentals in tier that week | 186 `:99-116` |
| Manager pin check (per tier, standing) | placeholders in tier + pins in tier | `booth-conflict-checks.ts:182-215` |
| Occupancy grid (per tier, this week) | placeholders + approved vendors (pinned or not) + paid rentals, deduped | grid `:175-218` |
Pins never reduce booking capacity; rentals never reduce pin capacity. Tier of 5: manager pins 5 vendors (allowed),
5 other vendors book (allowed — 0 rentals counted) → 10 vendors, 5 booths; only the LABEL range stops it, and only
when the range is the default 1..sum(count). A custom wider range (`booth-labels` route) lets the oversell through.
**C1 mechanism re-verified from the repo text:** RPC honors the pin (`186:124-128`), inserts the rental with that
label (`:223-242`) → `trg_wbr_booth_unique` (146 `:149-154`) → arm (a) finds the vendor's own `market_vendors` row;
self-exclusion applies only when `v_table = 'market_vendors'` (`:88`) → P0005. The RPC's own handler catches only
`unique_violation` (`:243-244`), so P0005 reaches the route. Mig 193 made the vendor+week uniqueness ACTIVE-only
(cancelled rows no longer poison a week `193:33-35`). ⚠ Live body of both functions NOT yet fingerprinted on any env
this pass — required before mig 256 is written.

### Piece 2 — booth credits ✅ READ (migs 166/168/169/198/201; `booth-credit-balance.ts`; book + book-season routes;
`booth-groups/[groupId]/cancel`; expire-orders Phases 16/18/19; `cancel-date-cascade.ts`)
- Ledger = `booth_credits`, balance = SUM per (vendor, market) — credit is a claim against future bookings at THAT
  market only (166 `:15-19`). Sources: season_settlement, vendor_cancel_pre/post, redeemed, expired, park_date_cancel.
- Redemption at booking: one-off `book/route.ts:430-450` and season `book-season/route.ts:237-261` call
  `redeem_booth_credit` (advisory-locked, LEAST(balance, requested) `201:99-107`), capped so the residual charge ≥ 50¢
  and ≤ manager's take. Release paths all present: Stripe-fail cleanup (`book:508-546`, `book-season:296-308`),
  abandonment sweep (expire-orders `:2932-2950` one-off; Phase 18 → `cancel_season_group` `168:115-123` groups),
  vendor self-cancel D5 (`cancel/route.ts:90-98, :143-155`). Expiry sweep Phase 19 via mig 198. **No booth-model
  conflict found inside the credit rail itself** — it is consistent and idempotent. C1 sits BEFORE redemption
  (`book:328-402`), so no credit is touched when a pinned vendor is refused.
- **C9 sharpened (FM manager cancels a market day):** cascade path B only COLLECTS paid renters for a notification
  (`cancel-date-cascade.ts:326-346`); the FM "credit" is the SEASON settlement, which (a) covers only PAID groups tied
  to a `market_seasons` row (`settlement/route.ts:53-57`) — a one-off weekly renter (group_id NULL) is in NO
  settlement, ever; (b) owes only cancelled days BEYOND `refund_cap_days` (`settlement-math.ts:25-30`); (c) resolves
  with a 0-amount marker — 'off_platform' or 'made_up' — "no in-platform credit and no Stripe money moves"
  (`route.ts:177-183, :219-226`). FT: every PAID un-barred spot-day gets an automatic in-app credit at cancel time
  (`cascade :402-475`, mig 201). So today an FM vendor who paid for a week whose market day is cancelled gets a
  notification and nothing else unless the manager acts off-platform.
- **NEW C11 — a paid one-off week cannot be cancelled by anyone in-app.** The only rental-cancel writers are the
  season-group route (groups only, `cancel/route.ts:45-47`) and the crons (pending only). `book/route.ts:58-60`:
  "Cancellation endpoint ships separately; for v1, manager handles cancellation requests manually." The manager's
  only rental tool is the booth-number PATCH. A manual Stripe refund leaves the row 'paid' → the vendor stays
  sellable at a fee market (mig 255) and still consumes the tier's capacity that week (186 `:105-110`).

### Piece 3 — season booking edges ✅ READ (migs 164/165/167/193; `season-booking.ts`; `season-weeks.ts`;
`season-window.ts`; book-season route)
- Weeks are SUNDAY-anchored everywhere on the write side: one-off route rejects non-Sunday (`book:221-226`),
  season enumeration anchors each operating date to its Sunday (`season-weeks.ts:63-66`), mig 255 covers
  `week_start_date..+6`. **NEW C12 — the occupancy grid keys its paid-rental query on MONDAY** (`mondayOf`
  `BoothOccupancyGrid.tsx:86, :379-387`, then `.eq('week_start_date', weekStartStr)` `:124`). A Monday never equals a
  Sunday, so the grid's "Paid this week" source returns zero rows for every real rental; paid renters appear only via
  their standing roster pin (if any) — an unpinned paying vendor is invisible on the grid. Confidence: Confirmed from
  code; not yet reproduced on Staging.
- `book_season_atomic` loops the one-off RPC in ONE transaction (`165:97-118`) and wraps every inner error with
  `WHEN OTHERS` → `SEASON_BOOK_FAILED week=… reason=…` (`:104-107`); `season-booking.ts:61-65` turns that into
  "Week of X is no longer available — adjust your selection" (`book-season:228-233`). **C1 therefore blocks a pinned
  vendor from buying a season too, and the message blames the first week** — adjusting the selection cannot help.
- Season booking has NO roster gate either (route gates: Stripe-ready, prepay window, tier ∈ market, event
  conflicts, agreement `:67-206`); inherits C2/C3/C4 for every week at once. Tier is the vendor's pick for all weeks.
- Mig 193 partial-unique (active only) means cancelled rows never poison a week; `cancel_season_group` refuses paid
  groups (`167:90-92`). Settlement per-day denominator uses the mig-194 snapshot with live fallback.
- Not a booth-model issue but recorded: the settlement's `season_settlement` row is 0-amount by design (v1) — the
  mig 166 header's "granted at season end" describes the intent, not what is built.
### Piece 4 — FT park analog ✅ READ (migs 171–174, 201; `book-park-spot/route.ts`; `park-standing.ts`;
`book-spot/page.tsx`; webhook park handler `webhooks.ts:1921-1993`). NOT read: manager `park-spots`,
`standing-reservations`, `park-vetting` routes, `ParkSpotsManager.tsx` (approval UI only — no bearing on the brief).
**Model:** individual SPOTS (`park_spots`, mig 171), a booking = ONE spot × ONE date (`park_spot_bookings`, mig 172);
the partial-unique index on (spot, date) over active statuses IS the concurrency guard (`172:69-74`) — no count
ledger, no label generator, no cross-table trigger. The FT "pin" is a STANDING RESERVATION (spot × day-of-week,
manager-approved, `173:28-48`); a daily sweep MATERIALISES the next occurrence as the truck's own pending booking
within a 7-day horizon (`park-standing.ts:31, :309-395`), the truck pays it, unpaid past the 2-day cutoff → 'expired'
(slot released + a strike `:233-273`). So an anchor truck never "books its own spot" — the system creates the
booking for them. **C1 has no FT analog by construction.**
**What FT does that FM does not (each is a decided FT rule, cited):**
- Booking auto-creates a roster row (`market_vendors` approved=false, "book-then-vet") `book-park-spot:358-370`.
- Booking pre-checks the truck's OTHER active schedules for a date-aware overlap BEFORE payment `:283-345`
  (multi-truck vendors exempt), then the PAID webhook auto-creates/activates the park's `vendor_market_schedules`
  rows for the booked days — "a paid booking means the truck is SELLING here" `webhooks.ts:1931-1993`.
- Manager cancels a date → automatic in-app credit for every paid, un-barred spot-day (mig 201; cascade `:402-475`).
- Price is per SPOT (each spot has its own `base_price_cents`) — the booked thing and the priced thing are the same
  object, so C3 (tier ≠ booth) cannot arise.
**FT conflict found (recorded for the FT round, not this brief) — F1:** the one-off booking route never consults
`park_standing_reservations` (0 references in the file); a standing hold protects its spot only once the occurrence
exists, i.e. ≤ 7 days out. A one-off truck can book the anchor's spot 8+ days ahead; the sweep then finds the slot
taken and silently skips (`park-standing.ts:375-379`, no notification on that path). Confirmed from code.

## Owner rulings 2026-09-19 (chat, after the brief) — being refined
- **C11 = B, by design:** vendor bears the risk, no vendor cancel, no refund; manager MAY cancel a paid week → credit.
- **C2:** paying for a one-off week buys the right to set up + sell on every day the market is open that week.
  Approve-once-then-book-freely (manager veto kept, not per rental). Owner leaning to the veto at FREE managed
  markets too ("unless it will cause major issues to fix") — cost assessed below. Owner questions answered in chat:
  recurring-by-weekday = the vendor's DECLARATION (`vendor_market_schedules`), not a payment unit; (i) = paid week is
  the selling right by itself; (ii) = the FT P10-Layer-2 pattern whose overreach produced mig 199 → mig 211 incident →
  mig 224 (declared schedules are vendor data; booking-driven selling applies ONLY at managed paid parks).
- **C3 agreed:** application asks for a size; approval sets size + booth number (or a different size + note);
  booking = acceptance; deny stays.
- **C4:** pins are soft holds ("put a pin in it"), NOT capacity; an ASSIGNMENT exists only once a transaction ties
  the vendor to a number, then persists while they keep paying. Owner asked whether this is a complex rewrite.
- **C6:** assigned number never changes while paid current/upcoming weeks exist; manager waits for a missed payment
  to drop/move; a yielded pin goes to the new paid renter and is THEIRS until they stop paying (not permanent);
  every number change notifies the vendor.
- **C9:** FM one-off weeks mirror FT (automatic per-day credit at cancel time, no expiry); seasons STAY on the cap
  rule (2026-06-12/27).
**Event markets are never "managed":** `event-actions.ts:123-144` inserts no `manager_user_id`, so a broader managed
gate cannot catch events. Free-market veto cost: `managedJoinBlocked` drops its charges short-circuit
(`schedules/route.ts:52-64`); `ensureFreeManagedRosterRow` (auto-APPROVED, `:99-117`) and the free-market terms path
(`freeManagedTermsNeeded`, selector `MarketAgreementBlock`) become dead or flip to Apply; business-rule pins
`flow-integrity.test.ts:2439-2456` (09-05) + the 09-18 middle-path pins + TR-076/077 change — test changes need the
owner's explicit yes.

## Consolidated for the decision brief (2026-09-19)
Mechanical, no policy question → one build set once the owner gives the go: **C1** (mig 256: trigger arms (a)/(c)
skip rows of the same vendor; `booth-conflict-checks.ts` same-vendor exclusion; `book/route.ts` translates P0005;
season path inherits) · **C5** revoke clears the pin · **C7** (same fix as C1, app side) · **C8** stale header ·
**C12** occupancy grid keys on Sunday.
Owner decisions → **C2** (what a paid week should create: roster row / attendance row / both), **C3** (pin vs
tier/price), **C4** (do pins count as capacity), **C6** (notify on booth change), **C9** (FM cancelled-day
compensation), **C11** (who may cancel a paid one-off week, and what happens to the money).
Before ANY migration: live fingerprint of `check_booth_number_uniqueness` and `book_weekly_booth_atomic` on Dev,
Staging, Prod (mig 186/146 text is the repo record, not proof of what is deployed).
