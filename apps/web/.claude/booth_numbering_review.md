# Booth-number assignment — review of the ways a number gets onto a booth (owner ask 2026-09-20)

Owner: "we have 3 or more ways we are doing this… explore them and see if the disparate methods are working
harmoniously… if confusion / conflict is likely let's plan a unified booth number assignment process."
Report-only. Checklist → findings written as each piece is read (compaction-safe).

## Checklist
- [x] Structural fact: how labels are generated (`booth_label_candidates`, mig 256)
- [x] Writer 1 — the booking RPC auto-assign (`book_weekly_booth_atomic`, mig 256)
- [ ] Writer 2 — manager pin on the roster (`VendorBoothList` → `vendor-booth` route → `market_vendors.booth_number`)
- [ ] Writer 3 — manager per-week override (`WeeklyBookingsList` → `weekly-rental/[rentalId]` → `weekly_booth_rentals.booth_number`)
- [ ] Writer 4 — off-platform placeholder (`BoothPlaceholderManager` → `market_booth_placeholders.booth_number`)
- [ ] Writer 5 — approval sets number (`vendor-approval` route, part B)
- [ ] Writer 6 — payment writes the pin (`booth-assignment.ts`, part C)
- [ ] Reader — occupancy grid, incl. the "N occupants without a size tier" yellow box
- [ ] Helper text inventory: Booth numbering card · Weekly bookings empty/desc · roster pin field · placeholders · grid
- [ ] Action Items scope: every "needs the manager" signal on the dashboard
- [ ] TabbedCard title renders like a group heading (owner's first item)

## Findings

### F0 — labels are a MARKET-WIDE range, tiers are COUNTS. The two never meet.
`booth_label_candidates(market)` (mig 256 `:146-190`) = `generate_series(start…end)` from `markets.booth_label_start/end`,
default `1…SUM(market_booth_inventory.count)`. No tier in it. Auto-assign (mig 256 `:417-435`) takes the smallest label
not used by (this week's rentals ∪ placeholders ∪ ANY pin) — for ANY tier. So a "Large" booking can receive label 1
even if the manager thinks of 1–4 as the small booths. Capacity is checked per tier (count), the label is picked
market-wide. The tier lives on the ROW (`inventory_id`), not on the label. Consequence: the grid groups by the row's
tier, and any row written without `inventory_id` (pins typed before a tier was set, placeholders added without a size)
lands in the "⚠ N occupants without a size tier set" box (`BoothOccupancyGrid.tsx:308-321`). That box is the
symptom of F0, not of a manager mistake.

### F1 — six writers of a booth number, three tables, one trigger
| # | Who | Writes | When | Tier written? |
|---|---|---|---|---|
| 1 | booking RPC | `weekly_booth_rentals.booth_number` | vendor books (own pin → forced label → smallest free → smallest SOFT pin) | yes (booked tier) |
| 2 | manager roster pin | `market_vendors.booth_number` (+ `inventory_id`) | manager types a number on the roster | optional (field) |
| 3 | manager per-week override | `weekly_booth_rentals.booth_number` | manager edits a booking row | no change |
| 4 | placeholder | `market_booth_placeholders.booth_number` (+ `inventory_id`) | manager records an off-platform booth | optional |
| 5 | approval | `market_vendors.booth_number` + `inventory_id` | manager approves with size + number (BR-3, part B) | yes |
| 6 | payment | `market_vendors.booth_number` (+ `inventory_id` if none) | webhook after paid flip (BR-5, part C) | keeps existing |
Uniqueness across the three tables = one trigger `check_booth_number_uniqueness` (mig 256), same-vendor excluded,
soft pins yield to rentals. Freeze (BR-7) guards 2 and 3 against moving an ASSIGNED number.

### F2 — where the story breaks for the manager (each cited)
- **F2a "you can assign booth numbers" is stale at fee markets.** `WeeklyBookingsCard.tsx:115` (empty copy) and the
  roster's "needs booth #" (`VendorBoothList.tsx:590`, stat `manager-dashboard-stats.ts:145-147`) present typing a
  number as the manager's job. Since mig 186/256 the RPC assigns at booking (own pin → range → soft pin) and payment
  writes it back (part C). At a CHARGING market an approved vendor without a pin needs nothing from the manager —
  they get a number when they book. The pin is only the assignment path at markets that do NOT charge for booths
  (`market_charges_booths`, `VendorBoothList.tsx:787`) or when the manager wants to reserve a specific spot. So
  Action Items over-reports "needs a booth number" at fee markets.
- **F2b the weekly list invites an edit it will refuse.** Every non-cancelled row shows an editable number + Save
  (`WeeklyBookingsList.tsx:282, 313-346`); the route refuses a PAID week's change with 409 (`weekly-rental/[rentalId]
  /route.ts:87-93`, BR-7). The refusal is correct; the field should already be locked with the reason (the roster
  does this: `VendorBoothList.tsx:725, 782-785`).
- **F2c "N occupants without a size tier" is a pin problem.** Placeholders REQUIRE a tier (`booth-placeholders/
  route.ts:103-110`); rentals always carry one. The untiered rows are roster pins typed without picking a size (tier
  select optional, `VendorBoothList.tsx:742`) or pre-mig-145 legacy. Fix at the source (require the size with the
  number) and the box becomes an Action Item until the backlog is cleared.
- **F2d Booth numbering card copy** (`BoothInventoryManager.tsx:431-437`): "We'll assign these labels automatically
  as vendors book — no work for you on each booking" — true. Missing, and the source of wrong expectations: (1) it is
  ONE range for the whole market, not per size (F0); (2) numbers you pin on the roster or record as placeholders are
  taken out of that range; (3) a vendor's own pin always wins over the range; (4) when every label is spoken for the
  booking fails LABELS_EXHAUSTED even if the tier count says there is room (mig 256 `:472-475`) — "make the range at
  least as long as your total booth count" is the instruction the manager needs.
- **F2e TabbedCard title = group heading.** `TabbedCard.tsx:37-45` renders its title with the same accent rail +
  xl/bold as `GroupHeading.tsx:26-27`, so "Vendors at this market" reads as a section. FT uses TabbedCard AS a group
  ("Your trucks"); FM nests it under the Vendors group → needs a card-level heading variant.

### F3 — Action Items: every "needs the manager" signal on the page today
| Signal | Where it lives now | Manager can finish it? | In Action Items? |
|---|---|---|---|
| vendors pending approval | roster chip | yes → #roster | yes |
| active vendor without a pin | roster "needs booth #" | only meaningful at NON-charging markets (F2a) | yes, over-reports at fee markets |
| pinned vendors without a size tier (N) | grid yellow box `:308-321` | yes → pick size on #roster | **no** (owner's report) |
| a tier over capacity | grid "⚠ over capacity" `:276` | yes → fix count / move a placeholder | no |
| Stripe needs more information (requirements due, not passive review) | Stripe card `:78-88` | yes → #setup | no (checklist covers the initial connect only) |
| season settlement owed (ended season, vendor beyond the cap) | Season settlement card `:149-183` | yes → #seasons | no |
| booked-unpaid weeks · declared-unpaid vendors | strip | vendor's action, not the manager's | no (correct) |
| bundle awaiting platform approval · margin payment pending | bundles card | platform's action | no (correct) |

### F4 — is a unified process warranted? YES (confusion likely, conflict mostly closed)
Conflict (two writers colliding) is now largely closed by the one trigger + freeze + same-vendor rule. Confusion is
not: six entry points, two of them free-text, none of which knows which numbers belong to which size, and helper text
written at different stages (mig 144 "we auto-assign", mig 145 "assign on the roster", 09-18 "a pin is a hold",
09-19 "payment makes it yours"). The manager cannot answer "which booths are Large?" anywhere in the app, and the
system cannot either — that is why auto-assign can seat a Large booking on #1.

## Proposal (for the owner to rule on) — see the chat brief 2026-09-20
Option U (unified, recommended): numbers belong to sizes. Each tier row gets its own label range (`market_booth_inventory
.label_start/label_end`, nullable → legacy markets keep today's flat range until set; `count` = range length);
`booth_label_candidates(market, tier)`; auto-assign picks inside the booked size; roster pin, approval, placeholder and
the weekly override all become "pick a free number" dropdowns filtered by size (no typing → no untiered rows, no typos);
the grid draws every numbered slot (empty ones too) instead of only occupants; ONE helper paragraph, reused verbatim on
the four cards. Option L (light): keep the flat range, make size REQUIRED wherever a number is entered, dropdowns of free
labels everywhere, lock paid rows in the weekly list, rewrite the four helper texts to one story. L is a day; U is a
migration + the four surfaces + the RPC's candidate function (2 days) and is the only one that makes "the number system"
true.
