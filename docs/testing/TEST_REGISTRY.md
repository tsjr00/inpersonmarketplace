# Test Registry — the source of truth for what has and has not been verified

**Read at session kickoff, updated at session close and at every triage.** One row per test item. A result exists
only if it is written here (date · tester · evidence). Status vocabulary in `README.md`.
IDs are stable: never renumber; retire with `dropped`. Steps name page URL · visible card/section · widget.

Seeded 2026-09-14 from `apps/web/.claude/testing_status_research.md` (events + market bundles sweep of every test
protocol recorded since 2026-08-15). Older scripted checklists migrate in as they are run.

## Bundles

| ID | What it proves | How to run | Status | Last result | Obs |
|---|---|---|---|---|---|
| TR-001 | Fresh bundle order: quiet notification sequence (vendor ready → manager "🧺 Ready to collect", buyer silent; vendor fulfils → buyer silent; manager "Ready — notify buyer" → buyer's ONE ready notice; buyer order page = yellow status card, no blue "collecting" box) | Buyer: buy a bundle on `/[vertical]/markets/[id]` "Market Bundles" section. Vendor: `/vendor/orders` → Ready. Manager: `/market-manager/[marketId]` bundles run-sheet → Receiving now → Ready — notify buyer. Count every message on all three sides. | fixed-unverified — Push A (2026-09-15): vendor-confirm + fulfil sends gated on bundle orders; vendor Fulfil refused before the manager's tap; one acknowledge control; list page bundle-aware; stand-in wording; placed-email bundle copy; bundle_ready now also emails | 2026-09-14 owner + SQL — money proven end to end; notification/UX defects → Push A | OB-010, OB-014, OB-015, OB-017, OB-018, OB-019 |
| TR-002 | Cancel bundle (a) within first hour → full refund to the cent | Buyer `/buyer/orders/[id]` bundle card → Cancel bundle, inside 60 min of purchase | open | — | — |
| TR-003 | Cancel bundle (b) after the hour AND a vendor has confirmed → 75% refund (25% fee on items + margin), tip refunded in full, dialog shows the owner's wording ("Cancelling after the first hour or once a vendor has confirmed…") | Same page, second order; a vendor confirms first | open | — | — |
| TR-004 | Checkout success screen shows the bundle pickup spot | `/[vertical]/checkout/success` after a bundle purchase → bundle bullets → spot line present | pass | 2026-09-14 owner | OB-011 |
| TR-005 | `bundle_ready` buyer email reads correctly (post-storm-fix) | Re-read the buyer's ready email after TR-001 | fixed-unverified — Push A: bundle_ready gains an email channel (push kept). The per-vendor 'Ready to collect' emails were the MANAGER's notices (owner confirmed inbox) → not a defect | 2026-09-14 owner — see OB-020 | OB-012, OB-020 |
| TR-006 | Manager-first handoff edge: "Mark handed off" before buyer ack → handoff recorded, margin HOLDS; buyer's later ack releases the transfer | Manager run-sheet → Mark handed off first; then buyer `/buyer/orders/[id]` 🧺 ack card → confirm margin pays only then (Stripe transfer) | pass | 2026-09-14 owner — manager handed off 03:25, buyer acked 03:33; margin $9.00 tr_…WIIihUc paid on the ack, not before (OB-019) | OB-019 |
| TR-007 | E6 bundle-sold cron sweep: manager gets "🧺 Bundle sold" (in-app + email) once; second run = no duplicate | After a bundle sale, call `/api/cron/surveys` on staging with the cron bearer token, twice (staging previews never run crons) | pass | 2026-09-14 owner — run 1 managersNotified 1, run 2 managersNotified 0; manager got the in-app notice (email unconfirmed) | OB-009, OB-013 |
| TR-008 | Bundle money loop end-to-end reconciles in Stripe (margin, cause, booth) | Full loop, then Stripe dashboard amounts vs formulas | pass | 2026-09-07 owner — margin $9.00, cause $1.00, booth $24.31×2 (current_task 09-07 close) | — |
| TR-009 | Admin bundle approve loop | `/[vertical]/admin` bundles queue → approve → bundle visible on market page | pass | 2026-09-06 owner (E3) | — |
| TR-010 | Market page "Market Bundles" card lines wrap on mobile | `/[vertical]/markets/[id]` "Market Bundles" section on a phone | fixed-unverified — Push D: grid column minimum now shrinks to the container on narrow phones; card wraps long words; name/price row wraps | 2026-09-13 owner — line overflowed on mobile; cause (from code, no screenshot): 280px fixed column minimum > phone width | OB-006, OB-023 |

## Market boxes

| ID | What it proves | How to run | Status | Last result | Obs |
|---|---|---|---|---|---|
| TR-011 | Market box alone reaches payment (cart validate fix) | Cart with one box → `/[vertical]/checkout` → pay button enabled | pass | 2026-09-13 owner | OB-001 |
| TR-012 | Box + listing from another market → multi-location acknowledgment, pays | Same, add a listing from a second market | pass | 2026-09-13 owner | OB-001 |
| TR-013 | Vendor skip-a-week works (mig 250 service-client path) | Vendor `/vendor/market-boxes/[id]` → skip week; buyer sees new date + "extended by 1 week" | pass | 2026-09-13 owner (staging) | OB-002 |
| TR-014 | Pickup count agrees between `/buyer/subscriptions/[id]` and `/buyer/orders` | After completing pickup 1 of 2, compare both pages | fixed-unverified — Push B: orders list counts picked-up pickups (same predicate as the subscription page) + mig 252 lets the trigger's counter write land | 2026-09-15 cause confirmed: trigger INVOKER + no UPDATE policy on market_box_subscriptions → counter filtered to 0 | OB-001, OB-022 |
| TR-015 | Market boxes appear in vendor "My markets & schedules" and "My upcoming pickups" | After a box purchase, vendor `/vendor/markets` schedule + dashboard "Upcoming pickups" card | fixed-unverified — Push B: dashboard tile + week strip both read market_box_pickups | 2026-09-15 | OB-001, OB-022 |
| TR-016 | Vendor market-box page shows an order number | `/vendor/market-boxes/[id]` | fixed-unverified — Push B: order number shown on the subscribers and pickups tabs | 2026-09-15 | OB-001, OB-022 |

## Events

| ID | What it proves | How to run | Status | Last result | Obs |
|---|---|---|---|---|---|
| TR-020 | Admin events board: stage sections + jump-nav, card counts, card → full detail, Closed expands + cancelled offers Restore (C1–C4) | `/food_trucks/admin/events` | pass | 2026-09-05 owner (round 3) | — |
| TR-021 | Host menu pare-down loop: first-round select → tap items off a 3+-item truck (floor 2) → confirm → shop + public page lack pared items → truck's event page shows "approved N of M" (P1) | Organizer `/event-manager/[token]/select` → shop → vendor `/vendor/events/[marketId]` | pass (loop) — 5 new findings logged | 2026-09-15 owner — pare-down worked for the first 2 vendors; vendors saw only approved items; notifications fired. Findings: FM dashboard lacks FT's required-field asterisks + food/meal wording; conflict-acknowledge box lets an FM vendor accept without the multi-location declaration; organizer cannot pare/bench a vendor who responds AFTER the first selection (locks by design P1 — owner wants flexibility); 'invite more vendors' copy points nowhere; notification click lands on a stale page | OB-024 |
| TR-022 | Stage surfaces agree: locations pill accepted ≠ Attending · organizer roster badges · admin chips · "Vendors who said yes: N of M" · dashboard "Locations & Schedule" card (P2–P5) | `/vendor/markets` events section · `/event-manager/[id]/dashboard` · `/[vertical]/admin/events` · `/vendor/events/[marketId]` · public page `/[vertical]/events/[token]` | fixed-unverified — change 1a (2026-09-17): the public event page lists only organizer-SELECTED vendors on self-service events; "Pre-Orders Open" needs at least one listed vendor. Dashboard half already PASS | 2026-09-15 owner — /event-manager/[id]/dashboard shows 'Said yes — pick or bench them' vs 'Selected' correctly; /[vertical]/events/[token] still says '3 Vendors attending' and lists the unselected vendor's products (the order page correctly hides them) | OB-024 |
| TR-023 | Invitations-held gate: "Open Pre-Orders — invitations held" button DISABLED with tooltip; Inviting card says HELD (D1) | Admin event detail for a self-serve approved event with invitations not sent | open | — | — |
| TR-024 | Forced-ready while held → organizer progress says nothing orderable, not "pre-order now" (D2, optional) | Same event, force ready | open | — | — |
| TR-025 | Reverse event-conflict guard: a truck with an accepted event on date X cannot book a park spot / booth / season covering X → 409 "withdraw first" (F5) | `/vendor/markets/[id]/book-park-spot` (or book / book-season) on the event date | open | — | — |
| TR-026 | Browse "Closed" pill on an event-selected listing matches its detail page (mig 245) | `/[vertical]/browse` card face vs `/[vertical]/listing/[id]` | open (fix shipped 09-05, retest owed) | — | — |
| TR-027 | Admin event detail shows "Market-Sales Blocking In Effect" naming the blocked market | `/[vertical]/admin/events` → event with blackouts | pass | 2026-09-13 owner (item 17) | OB-003 |
| TR-028 | Event cancellation money (Protocol v6 C) | Consolidated plan in chat 2026-08-31 — steps to be re-issued | open | — (open since 08-30) | — |
| TR-029 | Event deselect / refund money (Protocol v6 D) | as above | open | — (open since 08-30) | — |
| TR-030 | Event reconfirm + prep (Protocol v6 E) | `/reconfirm/[token]` page states after vendor withdrawal | open | — (open since 08-30) | — |
| TR-031 | Protocol v6 remainder: buyer items + buyer weekly survey (B) · onboarding copy (O) · manager new-email invite + resend (L) · FM mirror (F) · print chrome (M2) · G7 | see current_task 3571 (08-28 workflow edition) | open | — | — |
| TR-032 | "Not eligible" badge for a vendor-UNapproved applicant who submits Private Events Readiness | needs a FRESH unapproved vendor → `/[vertical]/admin/events` yellow box | open | — | — |
| TR-033 | Fee card reuse-button styling (outlined, side-by-side desktop / stacked mobile) | vendor event page fee card | open | — | — |
| TR-034 | Capacity copy on `/vendor/edit` (Pickup Capacity sentence + Private Events Readiness paragraph) | `/[vertical]/vendor/edit` | open | — | — |
| TR-035 | Below-claim amber advisory on invitation accept form | accept form, "Custom for this event" below profile default | open | — | — |
| TR-036 | ParkMGR vendor-docs page crash — evidence | `/[vertical]/market-manager/[marketId]/vendor-docs/[vendorProfileId]` — need a Vercel log line or the 3 SQLs | open (evidence) | — | — |
| TR-064 | Event pre-orders only once SELECTED (owner ruling 2026-09-17; mig 254 + shop). On a FREE self-service event an accepted-but-unselected vendor and a late responder do NOT sell at the event; their regular locations keep selling (no penalty) | ⚠ needs mig 254 on Staging first. Free self-service event, 3 accepted vendors: before selecting, `/[vertical]/events/[token]/shop` shows no menus and an accepted vendor's `/[vertical]/listing/[id]` offers no event pickup date; select 2 → their menus appear and order; the 3rd vendor's regular-market listings stay orderable throughout | fixed-unverified — change 1b (2026-09-17); mig 254 Dev ✅, Staging pending the paste | — | OB-025 |
| TR-065 | Rolling selection: each vendor's menu is trimmable ONCE, at their first selection (owner ruling B 2026-09-17) | `/[vertical]/events/[token]/select`: select 2 of 3, trim one, confirm; a 4th vendor accepts late → "Change selections": the first two are pre-ticked with "Menu set when you selected this vendor" and no trim controls; the late vendor HAS trim controls; a benched vendor shows "Backup vendors bring their full menu". Select + trim the late vendor, confirm → `/vendor/events/[marketId]` shows "approved N of M", removed item absent from the shop; re-open → the late vendor is now locked too | fixed-unverified — change 3 (2026-09-17) | — | OB-024, OB-025 |
| TR-066 | A vendor DROPPED in a selection change no longer shows as confirmed or pre-ticked | `/[vertical]/events/[token]/select` → Change selections → untick a confirmed vendor → confirm the drop. Reload: they are NOT under "Your vendors are confirmed" and NOT pre-ticked in change mode. Re-select them deliberately → they get a new "you're selected" notification | fixed-unverified — 2026-09-17 (found building change 3). Vendors dropped on staging BEFORE this push keep the old behaviour — use a fresh drop | — | OB-025 |
| TR-067 | "Short on options?" sentence gives steps that work | Select page confirmed view, backup box (shows when standby < recommended): follow it — dashboard → Event Details → widen vendor types / preferences / vendor count → Save → "Refresh matches" prompt appears → tap → message reports new invitations or none found | fixed-unverified — change 4 (2026-09-17, copy only) | — | OB-024, OB-025 |
| TR-068 | Farmers-market wording on the organizer's Event Details (FT unchanged) | `/farmers_market/event-manager/[id]/dashboard` → Event Details: "Product Preferences", "Total Budget", "Budget Per Person", "Expected Number of Buyers", "Dietary or Product Requirements", "Other Food or Products at Venue", "Other Vendors Present?", event type "Corporate / Workplace Event", FM example text, access-code note says "item". Same page on `/food_trucks/…` reads exactly as before | fixed-unverified — change 5 (2026-09-17, display only) | — | OB-024, OB-025 |

## Parks / schedules / other (from the same rounds)

| ID | What it proves | How to run | Status | Last result | Obs |
|---|---|---|---|---|---|
| TR-040 | Cancel-date result card: truthful counts (trucks credited with $ total, roster notified); FT card = auto-credit note + optional make-up date, no radio buttons (F3a/F3b) | Manager `/market-manager/[marketId]` → cancel a park date | open (fix shipped 09-05) | — | — |
| TR-041 | Survey email links to the STAGING deployment (D4) + owner scopes `NEXT_PUBLIC_APP_URL` to Production in Vercel | trigger a survey email on staging; open link | open | — | — |
| TR-042 | Day-of buyer copy: FT 0-day-advance listing on a non-operating day → "Orders Open on Operating Days"; badge tooltip no longer claims prep time | `/food_trucks/listing/[id]` off-day | open | — | — |
| TR-043 | Week-strip standing hold: active standing reservation shows on its weekday >7d out with "pay-by window opens within 7 days" | `/food_trucks/vendor/markets` "Your next two weeks" | open | — | — |
| TR-044 | Schedule conflict + multi-location declaration: unchecked box + overlapping schedules at two markets is REFUSED on BOTH verticals (decision 2026-09-13) | `/farmers_market/vendor/markets` join a second market on an occupied weekday; `/vendor/edit` box unchecked | fixed-unverified — Push C: schedules route conflict check on both verticals + mig 253 (trigger, Dev+Staging applied; Prod pending) + flow-integrity pin | 2026-09-13 owner — FM double-book allowed (item 11); ruled 2026-09-14 | OB-002, OB-023 |
| TR-045 | Apply button managed-only + guidance copy; application reaches manager pending list + notification | market page of a managed market | pass | 2026-09-13 owner (item 12) | OB-002 |
| TR-046 | Booking page operating-days line present; layout ask: below the market map, above week/booth selection | `/[vertical]/markets/[id]/book` | fixed-unverified — Push D: operating-days line moved below the map, above the week/booth selection | 2026-09-13 owner (item 13 layout ask) | OB-002, OB-023 |
| TR-047 | Admin markets list: 5 columns, no horizontal scroll, one State chip, row → detail with schedule + address | `/[vertical]/admin/markets` | pass | 2026-09-13 owner (item 14) | OB-002 |
| TR-048 | Vendor orders page status count cards include a cancelled order the list shows | `/[vertical]/vendor/orders` after a buyer cancel | fixed-unverified — Push B: cancelled card counts 'refunded' items too | 2026-09-15 cause confirmed by SQL: items 'refunded', card counted 'cancelled' only | OB-001, OB-022 |
| TR-049 | Admin hub "orders stuck in paid/confirmed 24+ h" card leads somewhere useful | `/[vertical]/admin` "Needs you now" card | fail — DEFERRED (owner 2026-09-15): no admin orders page exists to point the card at; design recorded in backlog (read-only "Stuck orders" page reusing the hub predicate) | 2026-09-13 owner | OB-007 |
| TR-050 | Browse filters: users find "Available now" and market boxes | `/[vertical]/browse` Filters popup | fail (discoverability) | 2026-09-13 owner | OB-007 |

## Security / prod (smoke items from 2026-09-12/13)

| ID | What it proves | How to run | Status | Last result | Obs |
|---|---|---|---|---|---|
| TR-060 | Normal checkout decrements stock (mig 250 service path) | buy a regular listing | pass (staging) · open on Prod (no Stripe vendor yet) | 2026-09-13 owner | OB-001 |
| TR-061 | Buyer cancel before confirmation → refund shown, inventory restored, vendor notified (mig 251 allows 'cancelled') | `/buyer/orders/[id]` cancel | pass (staging) | 2026-09-13 owner | OB-001 |
| TR-062 | Buyer ack + vendor fulfil inside 30 s on a regular order → payout moves (mig 251 allows a legitimate ack) | pickup handoff | pass (staging) · open on Prod | 2026-09-13 owner | OB-001 |
| TR-063 | Located browse works after E0 (radius pills change the count; no new 42804 error rows) | `/[vertical]/browse` with a location; `error_logs` count | pass (staging + prod) | 2026-09-13 owner + Script C | OB-001 |
