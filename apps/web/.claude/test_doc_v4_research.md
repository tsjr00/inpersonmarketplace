# Tester document v4 — working notes (2026-09-27, after staging `ad29ed22`)

Owner ask: (1) bring TEST_REGISTRY.md fully current; (2) write a NEW tester document in plain app language,
with sequences that never dead-end (an earlier step must not make a later step impossible), covering as many
open items per sequence as possible, and adding tests ONLY for genuinely new behaviour.

## Checklist
- [x] Registry read end to end (125 rows)
- [x] Printable v3.4 read end to end
- [x] Registry normalised (OB-034 rows → fixed-unverified with 4.0 pointers; header note on 3.x pointers)
- [x] v4 document written (TEST_PROTOCOL_open_items.md replaced — README pins this filename as the owner's list)
- [x] Appendix mapping rewritten
- [ ] Owner told what accounts/data to prepare (in the report)
Strings verified 2026-09-27 for W1: term('food_trucks','vendor') = "Food Truck" → lines read "1 food truck pending your
approval." / "1 invited food truck hasn't answered yet."; roster Approve/Reinstate labels (VendorBoothList :697).

## Rows that still need a TESTER (everything else is pass / by-design / superseded / not runnable)
FM manager (Amarillo): TR-105 TR-101 TR-108 TR-120 TR-124 TR-106(links into Setup) TR-099(cancelled-day strike) TR-090(vendor notice)
Fresh vendor (River Road): TR-119 TR-083 TR-117 TR-084 TR-085 TR-087 TR-121/075(visibility) TR-118 TR-078(pass) TR-089 TR-082 TR-088 TR-086(apply door) TR-072(after payment)
Manager cancels (Market 2 Test): TR-091 TR-092 TR-099
Seasons (Market 2 Test): TR-122 TR-079
FT park (Sixth Street): TR-107 TR-140 TR-043 TR-136 TR-133 TR-137 TR-138 (TR-109 TR-040 TR-034 PASSED 09-27 → drop)
Vendor listings/markets: TR-069 TR-044 TR-123 TR-134 TR-135 TR-139 (TR-042 TR-048 PASSED 09-27 → drop)
Admin vendor lookup: TR-096(boxes half) TR-094(two questions)
Events: TR-022 TR-064 TR-065 TR-066 TR-067 TR-068 TR-026 TR-025 TR-023 TR-024 TR-030 TR-032 TR-033 TR-035
Bundles: TR-010 TR-001 TR-005 TR-002 TR-003
Boxes: TR-015 TR-125 TR-014
Survey: TR-041
Sales-tax admin prep: TR-112 TR-110 TR-113 TR-114 TR-115 TR-132 (TR-111 needs an address edit — fold into W11 as an optional step)
Sales-tax rehearsal (owner-gated): TR-129 TR-126 TR-127 TR-130 TR-116(owner)
Not runnable / owner-only / design: TR-028 TR-029 TR-031 TR-070 TR-049 TR-050 TR-060 TR-062 TR-131(guard by test)

## Sequencing constraints found (the dead-ends the owner is talking about)
FT park (W4 v3.4 was out of order):
- "Applied" state on the market page needs T1 BEFORE approval → check T1's market page BEFORE the operator approves T1.
- The weekly-hold tab is locked until T2 has a PAID day → T2 must pay for a day FIRST (that paid day also feeds
  "Your standing hold" on the strip, "Book again", and My Park Bookings).
- Spot A must have "Allow standing/recurring reservations" ON before T2 requests; the request must exist BEFORE the
  operator's Action Items check; the operator APPROVES it before T3's refusal test (refusal needs an ACTIVE hold).
- Turning the Spot A box OFF (TR-136 negative case) breaks every later hold check → it is the LAST step.
- The invited-truck line needs an invitation that stays unanswered through the Action Items checks → decline it LAST
  (after the count checks) — and the declined-row wording needs that decline.
- "Pay by" on the strip / "Pay now" on My Park Bookings need the daily job → owner runs it once, at a marked point.
Fresh vendor (W2): Set Schedule refusal must come BEFORE applying; the listing-save check BEFORE approval; the
  declare-days gate BEFORE any day is picked; "Continue payment" checks BEFORE paying; visibility card checks only
  if the market is NOT already visible (owner confirms first).
Manager cancels (W3): needs a PAID week first → run after W2; the cancel-a-day credit needs the date inside the paid
  week AND on a declared day; the season-child refusal needs W12 first → order W2 → W12 → W3.
Events (W7): D must accept AFTER the first selection (late responder) — say so as a hard rule; the drop/re-select needs
  a fresh drop; the reverse-guard vendor must have the multi-location box UNTICKED and be ACCEPTED.
Bundles (W8): the cancel-after-an-hour order needs ONE vendor confirmed BEFORE the hour passes → confirm right after
  buying, then wait; order 2's full refund must be cancelled INSIDE the hour → do it immediately after buying.
Boxes (W9): the pickup must be within 7 days for the tile; the evening check is a separate visit.
Survey (W10): the qualifying accounts must NOT open the app between Sunday 6 PM and the owner's trigger.
Sales-tax admin (W11): step 4 sets a STALE quarter → must restore it before W13; step 6/7 create a listing → do it
  AFTER the anomalies download or the totals differ? (anomalies counts mismatches, not listings — order-independent).

## v4 structure (decided)
- One workflow = one role's sitting, ordered so nothing earlier blocks anything later; "Before you start" lists what
  the owner prepares + "Look first" checks whose answer changes which Expect applies.
- Plain names only: "the market's page", "the card titled …", "the button that reads …"; no file paths; URLs only
  as a way to get to the page, always with the visible page title beside them.
- Passed steps removed. Retest steps say what changed.
- Order of running: FT park (fresh fixes) → vendor listings/menu (fresh fixes) → fresh vendor → seasons → manager
  cancels → manager dashboard → admin lookup → boxes → bundles → events → survey → sales-tax admin → rehearsal.
