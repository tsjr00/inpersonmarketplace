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

## What has NOT been read yet (this pass)
- Manager occupancy grid / WeeklyBookingsCard (how pins vs rentals render) · booth_credits redemption path ·
  season booking edge cases beyond "loops the RPC" · FT park analog (spots/standing) — parallel model, same
  questions.
