# Triage — tester W1/W2 report (2026-09-25) — working file, pre-ruling
Status: code read done; OB entries NOT yet written (awaiting owner go). Next OB = OB-030.

## Confirmed defects (code-cited)
- D1 W2.15/16 BLOCKER: abandoned Stripe booth checkout leaves rental pending_payment; re-book → DUPLICATE 409
  (api/vendor/markets/[id]/book/route.ts:370-378). No "pay now" for pending booth rentals (vendor/bookings/page.tsx
  only labels it :72; FT spots have Pay now BookParkSpotForm.tsx:1109). Release = expire-orders Phase 16 stale
  cohort after 24h (cron route :2908-2916), daily cron, PROD ONLY (:73-75) → staging never frees it.
  "Stepped away" banner says "released in about 30 minutes" (BookBoothForm.tsx:219-224) — false for this case.
- D2 W1.11/W1.12: WeeklyBookingsCard with zero bookings passes `empty` (WeeklyBookingsCard.tsx:118-125) →
  DashboardCard renders only the one-line message, children hidden (DashboardCard.tsx:186) → no help paragraph,
  no Print week sheet. Week sheet lists holds/placeholders, so it's useful before any booking.
- D3 W2.12: roster pickers disabled but styled backgroundColor white (BoothNumberPicker.tsx:79-86, :96, :106)
  → look active. ~80% this is the tester's "not greyed".
- D4 W2.1 (found in read): apply-required refusal is red (MarketScheduleSelector.tsx:144-145) but its bold
  heading reads "Cannot deactivate" (:296-298) — wrong heading for this message.
- D5 W2.9/11: MarketVisibilityCard sits INSIDE Setup (FmDashboardBody.tsx:179), collapsed once onboarding done
  (:144) → "not visible to buyers" warning hidden. Also Market 2 Test was already visible (precondition broken).

## Test-document defects (no code bug)
- W1.3 optional lines only show when their condition exists (ManagerActionSummary.tsx:97-122) — doc must say "skip if none".
- W2.1 day picker = tick market in list to expand → "Set Schedule" button (vendor/markets/page.tsx:254-255, :441-453, :495-502). Doc too vague.
- W2.7 gate shows only if vendor has NO active day at this market (booking-gates.ts:81-91); tester's vendor apparently had one. Season shows only if an open season exists (book/page.tsx:365-369) — doc wrongly unconditional.
- W2.14 no "close" on Stripe; browser Back is correct; banner shown = expected.
- W2.17 conditional ("ONLY IF") — no season on sale → skipped, not fail.
- Market list is radius-filtered (api/vendor/markets/route.ts:178-190) — can hide Market 2 Test from a fresh vendor.

## Tester suggestions → need owner ruling
S1 "Disconnect all listings from this market" bulk action · S2 setup friction (tier limit 3 markets greyed Market 2; fresh test vendors needed) · S3 home market auto-expanded (page.tsx:254) · S4 vendor refund/cancel window (currently by design: no vendor cancel of paid week) · S5 "Cancel week" → "Cancel this booking" (WeeklyBookingsList.tsx:414) · S6 schedule prompt before payment (exists: DeclareDaysGate) · S7 pending payment needs a pay link (= D1).

## RE-VERIFICATION (owner: "don't assume") — corrected verdicts
- D6 NEW (High, ~85% it caused W2.7): saving a listing with a traditional market auto-declares EVERY active
  operating day there, client-side upsert (vendor/listings/ListingForm.tsx:428-455). Bypasses the schedules
  route's apply-required gate (api/vendor/markets/[id]/schedules/route.ts:76-84) and BR-13's "buyers see you only
  on the days you pick". Server gate is real (booking-gates.ts:81-91, called book/route.ts:212) → the tester's
  booking succeeding PROVES an active day existed; only writers pre-payment = schedules route or ListingForm.
  Tester: "I added the listing with vendor 1 so that i could find the market". Unproven without a DB read.
- W1.3 → required checks PASS (tester green); optional line links UNTESTED (can't confirm Amarillo lacks the
  conditions without a DB read) — stays open for those.
- W2.1 → UNTESTED (picker never opened; path = tick market to expand → Set/Manage Schedule, page.tsx:437-453) + D4.
- W2.7 → NOT pass: gate never shown (likely D6); season part UNTESTED (section renders only with open seasons,
  SeasonBookingSection.tsx:69-70; Market 2 Test's seasons not checked).
- W2.14 → PASS (tester saw the banner; confirmation #2 + manager #3 save green).
- W2.17 → UNTESTED (no season visible).
- Owner rulings 09-25: (a)(d) backlog [written] · (b) training note [memory feedback_test_protocol_preconditions]
  · (c) approved: home market not auto-open (badge/shading ok) · (e) approved: "Cancel this booking" ·
  (f) analysis requested — button sequence on the vendor Markets card.

## BUILD LOG
- 2026-09-25 Step 1 (D6) BUILT, uncommitted: market-stats sends isManaged (yes/no); ListingForm auto-declares only when isManaged === false (unknown = managed); flow-integrity pin (fails without the fix, passes with); map 11 line + stamp. Gates: tsc 0, vitest 100 files green, lint 0 errors (2 pre-existing warnings in MarketSelector). OB-030 + 30 registry rows written. Next: step 2 (D1 pending-payment) design read — booth checkout route is protected-path.

## STEP 2 DESIGN READ (D1 pending-payment) — 2026-09-25
- Committed step 1 = c0d81b25 (local, 2354 tests).
- book route: RPC insert pending → redeem credit → createBoothRentalCheckoutSession (payments.ts, PROTECTED; idempotencyKey `booth-rental-${rentalId}` payments.ts:314) → store session id; cancelUrl `?session=cancel` (book/route.ts ~:520) carries NO rental id.
- DUPLICATE 409 (book/route.ts:370-378) returns no pointer to the existing pending row.
- Webhook matches by rental id, flips ONLY pending→paid; paid-after-cancelled → ERR_WEBHOOK_014 human reconciliation (webhooks.ts:1508-1553). ⇒ reusing the SAME open session = at most one payment.
- Precedent: buyer checkout reuses an OPEN session via sessions.retrieve (checkout/session/route.ts:259-270). Helper lib/stripe/session-status.ts (not protected) retrieves status.
- Sweep: stale cohort cancels at booked_at+24h, daily, prod only (expire-orders :2908-2916) — staging never frees.
- BR-10 pin (flow-integrity.test.ts:2039-2055) forbids ANY vendor route writing weekly_booth_rentals status 'cancelled' (regex; paid or not) except booth-groups. Releasing an EXPIRED unpaid row from a vendor route trips it → owner ruling (spec is about PAID weeks, BR-10 text booth_model_design.md:37).
- Re-issuing a NEW session for the same rental needs payments.ts (idempotency key) + sweep keyed on session age → rejected as too wide.
- 2026-09-25 Step 2 (D1) BUILT, uncommitted: resume route + pure decision lib + session-status helper + ContinueBoothPaymentButton (book page cancel banner w/ rental id, DUPLICATE 409 pending_rental_id, /vendor/bookings pending rows); BR-10 pin allows only the resume route with guards pinned (proved: removing the pending guard fails it); 9 unit specs; map 12 + stamp; decisions row. Gates: tsc 0, eslint clean, vitest 101 files / 2363.
- 2026-09-25 Step 2 committed 7c118c36. Step 3 BUILT, uncommitted: lib/vendor/market-steps.ts (+10 specs), MarketStepButtons, API isManaged/rosterStatus/bookable/bookDone (+1 parallel paid-week read, service client, FM only), page note+row, home market not auto-expanded (badge+shading in the list). BLOCKED on 1 test: flow-integrity 'the API feeding the pill sends the selection fields' pins the EXACT market_vendors select string (flow-integrity.test.ts:3245); I appended approved, revoked_at. Asked owner: (a) loosen to 'contains the 4 fields' vs (b) separate parallel read. tsc 0; lint 0 errors (7 pre-existing warnings).
- Step 3 unblocked: owner 'Loosen the test' — pill test now requires the 4 fields PRESENT in the market_vendors select; + new contract pin for the card inputs. vitest 102 files / 2374 green; map 11 + stamp. Uncommitted.
- Steps 4-6 BUILT (uncommitted): 4 = option (a) collapse + print-sheet action, current week always in list (fixes Sunday-skip), parentheses in help map; 5 = not-visible card under Action Items FM+FT; 6 = picker greys, 'Manager approval needed' heading, 'Cancel this booking'. vitest 2374 green. Owner asked about week sheet semantics (one sheet/week, check-ins, after day passes) — answered from week-sheet/page.tsx.
- Week sheet (owner 2026-09-25: 1 yes, 2 no, 3 = reflect app check-ins): default week -> next week after this week's last market day; 'Market days: <dates>' line; per-day 'In <time>' from market_day_checkins (+ rows for checked-in vendors with no booking/hold); pen column kept; empty-card link label 'Print the week sheet'. Pin test added; map 12. Full suite green. Uncommitted with steps 4-6.
