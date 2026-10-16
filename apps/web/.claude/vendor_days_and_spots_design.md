# Vendor days, booth numbers and spots — DESIGN (both verticals) · 2026-10-11 · STATUS: PLANNING, NOTHING BUILT

Owner 2026-10-11: "I don't want to make this change yet … a really thorough design and planning session … the cleanest, most
elegant solution … easy to understand without a detailed explanation up front … must scale to other verticals."
This file is the hand-off for the next session. Evidence trail: `approval_days_rule_research.md` (§A–I impact trace, §R1–R12 end-to-end
review, reconciliation and rulings) · `market_days_scenarios.md` (switches, triggers, scenarios A–L). Prior design this builds on and does
NOT replace: `booth_model_design.md` (BR-1…BR-13, vocabulary §0), `managed_market_obligation_design.md` (mig 255 selling rule).

---
## 1. The rule (one sentence, for the next developer)
**A vendor's days are written only by the vendor's own act — a pick on the Markets page, or a payment for a date. Approval is vetting
plus the booth hold; it never writes days. The one exception: a market with exactly one operating day has nothing to choose, so that day
is recorded for the vendor and shown as done.**

Companion sentence for numbers: **a booth number becomes the vendor's when their commitment becomes real — at a charging market that is
payment (pin → assignment, BR-5/7, unchanged); at a free market nothing is ever paid, so it is approval (auto-assigned from the
tier's labels, or typed by the manager).**

Manager changes (a new operating day, a moved pin) are TOLD to the vendor (existing notices), never written onto their commitment.

## 2. The tiers (how to READ the system) vs the switches (how the code decides)
Owner's tiers, 2026-10-11. The code keys on the switches; the tiers are documentation.
| Tier | Managed in the app? | Operating days | Approval | Days | Number |
|---|---|---|---|---|---|
| T0 | no | one | none | recorded on listing save (nothing to choose) | vendor's own business (description text, never the roster) |
| T1 | no | many | none | vendor picks (listing save no longer guesses) | same |
| T2 | yes | one | manager vets once (BR-1) | recorded at approval (conflict skip P0020 kept + reported) | pin at approval; charging → assignment on payment; free → auto/manager at approval |
| T3 | yes | many | manager vets once | vendor picks after approval; card says "2 NEXT: Set Schedule" | same as T2 |
Switches in the data: `markets.manager_user_id` (managed) · `count(active market_schedules) = 1` (one day) · charges? (`marketChargesVendors`,
`managed-fee-gate.ts`: FM any priced tier, FT `park_mode = 'paid'`). **No vertical test in the rule** — a new vertical inherits it from its
market rows. Events and private pickups are not in the tiers: events have their own pass; private pickups are vendor-owned locations.

## 3. What exists today and stays (do not rewrite)
- Declaration table `vendor_market_schedules` and its meaning (owner 2026-09-19: "core elements rest on it").
- Day picker `MarketScheduleSelector.tsx` + route `api/vendor/markets/[id]/schedules` (BR-1 gate, hours inside market hours, pending-orders
  refusal, conflict 409, `warning` channel).
- ONE shared booking gate `lib/markets/booking-gates.ts` (BR-1 → BR-13 → BR-4 → declared-day conflict) used by both booking routes + page;
  inline `DeclareDaysGate` on the booking page.
- Booth model: apply asks size → approval sets size + number (PIN) + note → booking locked to the tier → PAID week = assignment, frozen
  (`booth-freeze.ts`) → soft after a missed week; yielding only inside a booking's auto-assign (`booth-assignment.ts`); BR-8 one notice.
- Selling right: declaration AND paid week at charging FM markets (mig 255) / paid date at paid parks (T5, mig 199); TS twins
  `visible-markets.ts`, `market-visibility.ts`, `managed-fee-gate.ts`.
- Conflict rule (mig 253/262, SQLSTATE P0020) and the multi-location switch `profile_data.multiple_trucks`.
- FT parks: same-day booking is book-then-vet BY DESIGN (owner 2026-10-11: trucks travel); docs = compliance acknowledgment at booking +
  operator review/flag/block (`park-vetting`, `park-docs-review.ts`); recurring holds REQUIRE operator approval (`standing-reservations`).
- Manager day edits: soft-delete via `active`; switching a day OFF cascades vendors off it (keep — protects vendors); every roster vendor
  already gets `market_schedule_changed`.
- Markets card sequence `market-steps.ts` (Apply → Set Schedule → Book → Listings → Prep, ONE "NEXT").

## 4. What changes (the build list, in order; each piece follows §1)
| # | Piece | Where | Class |
|---|---|---|---|
| 1 | **Mig 263** — `auto_create_vendor_schedules` + `_insert`: one active day → insert it (P0020 skip, ON CONFLICT DO NOTHING); else nothing. `auto_add_schedule_to_vendors` → no-op body (trigger stays mounted). FT early return: KEEP (owner's standing "leave FT alone") unless ruled otherwise. | migration (function replace, paste-and-go; supersedes 262's three auto-create bodies; conflict fn unchanged) | DB |
| 2 | Approval route: skipped-day report only when the market has one active day; otherwise the vendor notice says "Next: pick the days you attend on your Markets page"; manager row nothing extra. | `api/market-manager/[marketId]/vendor-approval/route.ts:186-217,250,270-271` | code |
| 3 | Listing save at UNMANAGED markets: declare only where the market has exactly one active day (same rule); the 10-09 skipped-day banner flow stays for that case. | `app/[vertical]/vendor/listings/ListingForm.tsx:441-480` | code |
| 4 | `market_schedule_changed` notice copy: "+ if you'll attend the new day, add it on your Markets page". | `lib/notifications/types.ts` template | copy |
| 5 | Free-market auto-assign at approval: charges nothing + number blank + tier has labels → lowest label passing `checkBoothNumberAvailable` (`tierLabels`, `booth-types.ts:88`; `booth-conflict-checks.ts:57`), written with its tier. No labels → no number. No freeze at free markets. | approval route | code |
| 6 | Private-pickup overlap WARNING (never a block): `loadPrivatePickupSlots` beside `loadActiveDeclaredSlots` (`booking-gates.ts:194-218`, export it); day route PUT/PATCH returns the overlap in `warning`; location create/update (`api/vendor/markets` POST `:621-658`, `[id]` PUT `:141-256`) returns `warning`; `PrivatePickupSection.tsx` gains a warning banner. Skipped when `multiple_trucks` is true. Events untouched (owner 2026-08-27 ruling stands). | `booking-gates.ts`, two routes, one component | code |
| 7 | **Provenance column (recommended, separable): `vendor_market_schedules.source TEXT NOT NULL DEFAULT 'vendor'`** — values vendor / approval / payment / listing / backfill-unknown; set by the 3 app writers + the trigger; existing rows → 'backfill-unknown'. What mig 211 lacked. | migration (additive) | DB |
| 8 | Tests — ONLY with the owner's explicit authorisation: rewrite `flow-integrity.test.ts:3869-3886` (loop/P0020 pin → one-day rule + T3 no-op), the integration test `approval-conflict.integration.test.ts:106-120,132-135` (single-day market for the conflict skip; multi-day → zero rows), `:3957` + `listing-schedule-days.test.ts` (single-day framing). New pins for pieces 2, 5, 6. Every other pin (R8) stays. | tests | tests |
| 9 | Testing docs: TR-087 testable by approval at a multi-day managed market; TR-119 post-approval = "2 NEXT: Set Schedule" (multi-day) / "3 NEXT: Book" (one-day); Round 4 note stays true for River Road; FT park page copy item. | `docs/testing/*` | docs |
Transition: forward-only; rows written by the old trigger stay (indistinguishable without piece 7). Prod order: 253 → 262 → 263 (or 263 alone for the three
functions + 262's conflict function). Blast radius of a bug in piece 1: a one-day approval writes 0 rows → the card shows "2 NEXT: Set Schedule"
and the vendor picks the day — degraded to the multi-day path; no money path touched.

## 5. Decisions MADE 2026-10-11 (owner) — logged in decisions.md
1. Multi-day market → the vendor picks their own days; single-day market → the one day is assigned, no selection. (Then: do not build yet — design first.)
2. Free managed market: the booth number is auto-assigned or set by the manager (no payment exists to make it real).
3. Food trucks: keep book-then-vet for same-day; recurring holds keep operator approval.
4. Private pickup vs a market at the same time: trace it and plan a WARNING (not a block; the 2026-08-27 events ruling stands).
5. Multi-day events + event booth/spot numbers: an EVENTS PASS after this one, not inside it.
6. A vendor's own booth number at an unmanaged market: in their description, never on the roster.
7. Rejected (Claude's recommendation, owner did not push back): a vendor-wide "baseline availability days" gate — a second source of truth;
   the per-weekday conflict rule already gives the guarantee. A read-only "My week" view later, if wanted.

## 6. Decisions OPEN (ask at the next session before building)
1. The rule sentence (§1) — confirm as the build spec.
2. Manager adds a day → notice only, no rows written (piece 1's T3 no-op) — confirm.
3. FT early return in the trigger: keep (default, zero FT change) or remove (uniform rule; only one-day parks affected).
4. Provenance column (piece 7): now / later / never. Claude recommends now.
5. Authorise the test rewrites in piece 8 (test-integrity Rule 3: no pre-planned test changes without this).
6. Free-market assignment does NOT freeze against the manager — confirm.

## 7. Parked / adjacent (backlog)
- FT park page copy: "Apply now → Applied → Book now" implies a gate the booking route does not have (book-then-vet). Wording only.
- Manager arrives at a market that already has self-declared vendors (T0/T1 → T2/T3): a confirm/dispute process — owner named it as an edge case; needs piece 7 to be tractable.
- Events pass: per-day attendance at multi-day events — VERIFIED 2026-10-16 (`approval_days_rule_research.md` §Q): it does not exist. Every event has ONE schedule row at the start date's weekday (event-actions, mig 219 keeps it), the sell gate still matches weekday (mig 255 :270-274) so a Fri–Sun event sells only on its Fridays, the shop pins `pickup_date` to the start date (`shop-data.ts:367`), waves carry no date, and the selector's multi-day branch is unreachable (consumers are traditional-only). Building it is a model change (date-based attendance + sell gate + shop date + waves per date + selection/fee per vendor-day). Booth/spot numbers at events still need an "assigner" role first. Today's limit is worth its own backlog item.
- FT Markets card: `bookDone === null` on FT so "Set Schedule" is Next after approval at a PAID park where paying is what declares — card/model mismatch (mig 210 note 3 in a new shape).
- Error mapping for trigger refusals (P0001/P00xx) at the other call sites (backlog since 2026-10-09).
