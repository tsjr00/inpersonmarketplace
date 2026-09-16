STAGING TEST PROTOCOL — OPEN ITEMS
Generated 2026-09-14 from the Test Registry (docs/testing/TEST_REGISTRY.md). Plain text: paste into Word as-is.
Staging: https://inpersonmarketplace-git-staging-tsjr00s-projects.vercel.app
Replace [vertical] in any path with farmers_market or food_trucks.

HOW TO USE
- Each block is one test. The ID (TR-nnn) is what to quote back: "TR-026 passed" is a complete result.
- Result line: write Pass, Fail, or Couldn't run, plus the date. Anything unexpected goes in Notes, in your own words.
- Do not rate severity. If something looks wrong, write what you saw and what you wanted.
- Screenshots help. Hard-refresh the browser after any new deploy before testing.


==================================================
SECTION 1 — MARKET BUNDLES (buyer, vendor, market manager)
==================================================
Background: a market manager curates a bundle from several vendors' listings. The buyer pays once; the manager
collects the items from each vendor on market day (handoff 1) and hands the bundle to the buyer (handoff 2).
Money moves only on the second tap of each handoff. Vendors are paid at handoff 1; the manager's margin pays at
handoff 2. These tests finish proving the money-and-messaging story built 2026-09-05 to 09-07.

TR-001  Fresh bundle order: the quiet notification sequence
Why: a notification storm was triple-messaging buyers and has been suppressed. This proves the quiet version
works on a brand-new order, not a leftover one.
Where: buyer — market page /[vertical]/markets/[id], section "Market Bundles"; vendor — /[vertical]/vendor/orders;
manager — /[vertical]/market-manager/[marketId], the bundles run-sheet.
Steps:
  1. As a buyer, buy a bundle from the market page.
  2. As each vendor, mark your item Ready.
  3. As the manager, tap "Receiving now" for each vendor, then let the vendor tap Fulfill within 30 seconds.
  4. As the manager, tap "Ready — notify buyer".
  5. As the buyer, open the order page.
Expect: after step 2 the MANAGER gets "Ready to collect" and the buyer hears nothing. After step 3 the buyer still
hears nothing. After step 4 the buyer gets exactly ONE ready notice. The buyer's order page shows the yellow
status card and no blue "collecting" box.
Result: ____________   Notes:

TR-002  Cancel a bundle inside the first hour
Why: this is refund money that has never been run by a person. The route computes fees and reverses Stripe transfers.
Where: buyer — /[vertical]/buyer/orders/[id], the bundle card, "Cancel bundle" button.
Steps: buy a fresh bundle; within 60 minutes, cancel it from the order page.
Expect: full refund, to the cent, shown on the page and matching Stripe.
Result: ____________   Notes:

TR-003  Cancel a bundle after the hour, once a vendor has confirmed
Why: the 25% late-cancel fee path, tip handling, and the warning wording.
Where: same page as TR-002, on a different order.
Steps: buy a bundle; have one vendor confirm; wait past the first hour; cancel.
Expect: 75% refund (25% fee on items and margin), tip refunded in full, and the dialog shows the wording
"Cancelling after the first hour or once a vendor has confirmed…".
Result: ____________   Notes:

TR-004  Success screen shows the pickup spot
Why: the checkout success page should tell the buyer where at the market to collect. It was blank once, most
likely because the spot was empty at purchase time. Blank again means a real bug.
Where: /[vertical]/checkout/success right after a bundle purchase, the bundle bullets.
Steps: buy any bundle; read the success screen.
Expect: the pickup spot line is present and matches what the manager entered.
Result: ____________   Notes:

TR-005  The buyer's "bundle ready" email reads correctly
Why: the "stale" email seen earlier was probably one of the now-suppressed storm emails.
Where: the buyer's inbox after TR-001 step 4.
Steps: open the ready email.
Expect: current wording, correct market and bundle names, working link.
Result: ____________   Notes:

TR-006  Manager taps "handed off" before the buyer acknowledges (optional edge case)
Why: proves the margin HOLDS rather than pays until the buyer acknowledges.
Where: manager run-sheet, "Mark handed off"; buyer — /[vertical]/buyer/orders/[id], the bundle acknowledge card.
Steps: as the manager tap "Mark handed off" first; then as the buyer acknowledge.
Expect: the handoff is recorded and the margin waits; the buyer's later acknowledge releases the transfer
(check Stripe for the margin transfer time).
Result: ____________   Notes:

TR-007  Bundle-sold sweep (cron)
Why: managers must learn a bundle sold without watching the dashboard. Staging previews never run scheduled
jobs, so the cron must be called by hand.
Where: the surveys cron endpoint on staging, called with the cron secret (ask for the exact command).
Steps: after a bundle sale, call the cron once; then call it a second time.
Expect: the manager gets "Bundle sold" in-app and by email once; the second call produces no duplicate.
Result: ____________   Notes:

TR-010  Bundle card wraps on mobile
Why: a line in the "Market Bundles" section runs past its container on a phone; fine on desktop.
Where: /[vertical]/markets/[id], section "Market Bundles", on a phone.
Steps: open the market page on a phone and read every line of a bundle card.
Expect: every line wraps inside the card like the "made by" rows do.
Result: ____________   Notes:  (a screenshot and the exact text of the overflowing line are needed)


==================================================
SECTION 2 — MARKET BOXES (buyer, vendor)
==================================================
Background: a market box is a prepaid multi-week pickup (a CSA-style box), not a one-time listing. These four
failed on 2026-09-13 and are logged; they are here so the fixes can be re-verified when they ship.

TR-014  Pickup count agrees between two buyer pages  (currently FAIL)
Where: /[vertical]/buyer/subscriptions/[id] and /[vertical]/buyer/orders.
Expect after a fix: both pages show the same "N of M pickups completed".
Result: ____________   Notes:

TR-015  Market boxes appear in the vendor's schedule and upcoming pickups  (currently FAIL, ranked highest)
Why: the buyer has prepaid and cannot cancel; a vendor who never sees the box in their normal workflow may not
show up.
Where: /[vertical]/vendor/markets, "My markets & schedules"; the dashboard card "My upcoming pickups".
Expect after a fix: the box appears on its pickup date in both places.
Result: ____________   Notes:

TR-016  Vendor market-box page shows an order number  (currently FAIL, may be a test artefact)
Where: /[vertical]/vendor/market-boxes/[id].
Steps: run a NORMAL pickup (not forced early) and check the page.
Expect: an order reference the vendor can quote.
Result: ____________   Notes:


==================================================
SECTION 3 — EVENTS (organizer, vendor/truck, admin)
==================================================
Background: an organizer requests an event; trucks are invited and accept; the organizer selects a roster and
approves menus; the event opens for pre-orders; the shop sells; settlement follows. "Accepted" is not
"selected": a truck can say yes and still not be chosen.

TR-021  Host menu pare-down loop
Why: the organizer can now remove items from a truck's proposed menu in the first selection round (minimum
two items kept).
Where: organizer — /[vertical]/event-manager/[token]/select; the event shop; the public event page; the
truck's page /[vertical]/vendor/events/[marketId].
Steps: on the select page, tap items off a truck that has 3 or more items (try to go below 2: it should stop);
confirm; open the shop and the public page; open the truck's event page.
Expect: pared items are absent from the shop and the public page; the truck's page shows "approved N of M".
Result: ____________   Notes:

TR-022  Stage surfaces agree (accepted is not attending)
Why: a truck that accepted but was not selected used to read as "Attending" on some pages and not others.
Where: /[vertical]/vendor/markets (events section pill); /[vertical]/event-manager/[id]/dashboard (roster
badges); /[vertical]/admin/events (chips); /[vertical]/vendor/events/[marketId] ("Vendors who said yes: N of
M"); the vendor dashboard card "Locations & Schedule".
Steps: with one truck accepted-but-not-selected and one selected, read each surface.
Expect: every surface shows the same stage for the same truck; accepted reads as accepted, not attending.
Result: ____________   Notes:

TR-023  Invitations-held gate
Why: a self-serve event is approved at intake but invitations are HELD until the organizer decides; opening
pre-orders while held must be impossible.
Where: admin event detail on /[vertical]/admin/events for a self-serve approved event with invitations not sent.
Expect: "Open Pre-Orders — invitations held" is DISABLED with a tooltip; the Inviting card says invitations
are held.
Result: ____________   Notes:

TR-024  Forced ready while held (optional)
Where: same event; force the event to ready.
Expect: the organizer's progress view says nothing is orderable, not "pre-order now".
Result: ____________   Notes:

TR-025  Reverse event-conflict guard
Why: a truck that accepted an event on a date must not be able to book a park spot, booth, or season that
covers that date.
Where: /[vertical]/vendor/markets/[id]/book-park-spot (or the booth / season booking forms) on the event date.
Expect: refused with a message to withdraw from the event first.
Result: ____________   Notes:

TR-026  Browse "Closed" pill matches the detail page
Why: browse cards used to say Open while the detail page said Closed for event-selected listings; the pill lied.
Where: /[vertical]/browse card face vs /[vertical]/listing/[id] for an event-selected listing (e.g. Bao Down's).
Expect: the browse card wears the same Open/Closed pill as its detail page.
Result: ____________   Notes:

TR-028  Event cancellation money
TR-029  Event deselect and refund money
Why: the only open tests that move real money on events. Both need an event with a paid vendor fee.
Where: organizer dashboard and the truck's event page; Stripe for amounts.
Steps: to be re-issued once a paid-fee event exists on staging (owner to confirm one exists or needs creating).
Expect: fees and refunds match the published rules to the cent.
Result: ____________   Notes:

TR-030  Re-confirm page after a vendor withdraws
Where: the buyer's re-confirm page /[vertical]/reconfirm/[token].
Steps: have a vendor withdraw from an event after a buyer ordered; open the buyer's re-confirm link.
Expect: the page reflects live items (all cancelled → withdrawal copy; some → partial copy; live → "stands").
Result: ____________   Notes:

TR-032  "Not eligible" badge for an unapproved applicant
Why: needs a FRESH vendor signup that is left vendor-UNapproved and submits Private Events Readiness.
Where: /[vertical]/admin/events, the yellow applicants box.
Expect: the gray "not eligible — vendor not yet approved" badge on that applicant.
Result: ____________   Notes:

TR-033  Fee card reuse-button styling
Where: the truck's event page, the fee card.
Expect: outlined natural-width buttons over the yellow box; side by side on desktop, stacked on mobile.
Result: ____________   Notes:

TR-034  Capacity copy
Where: /[vertical]/vendor/edit.
Expect: a new sentence under Pickup Capacity and a new paragraph under Private Events Readiness.
Result: ____________   Notes:

TR-035  Below-claim note
Where: the invitation accept form, "Custom for this event".
Steps: enter a number below the profile default.
Expect: an amber advisory appears.
Result: ____________   Notes:

TR-036  Manager vendor-docs page crash (evidence only)
Where: /[vertical]/market-manager/[marketId]/vendor-docs/[vendorProfileId].
Steps: open the page for a vendor; if it errors, capture the Vercel log line or the error text on screen.
Result: ____________   Notes:


==================================================
SECTION 4 — PARKS, SCHEDULES, VENDOR PAGES (truck, manager)
==================================================

TR-040  Cancel-date result card
Why: the card used to report "0 spot renters" at a park and offered a meaningless credit/reschedule choice.
Where: manager — /[vertical]/market-manager/[marketId], cancel a park date.
Expect: the result line shows truthful counts (trucks credited with a $ total, roster vendors notified); on a
food-truck park the card shows an auto-credit note plus an optional make-up date instead of radio buttons.
Result: ____________   Notes:

TR-041  Survey email links to staging
Why: staging survey emails were linking to the production domain and 404ing.
Where: a survey email sent from staging.
Expect: the link opens the staging deployment. (Owner side: NEXT_PUBLIC_APP_URL scoped to Production only
in Vercel.)
Result: ____________   Notes:

TR-042  Day-of buyer copy
Why: day-of-only listings looked broken on off days; the copy now explains it.
Where: /food_trucks/listing/[id] for a listing with 0-day advance ordering, viewed on a non-operating day.
Expect: "Orders Open on Operating Days", and the badge tooltip no longer claims vendor prep time.
Result: ____________   Notes:

TR-043  Week-strip standing hold
Why: paid standing reservations more than 7 days out were invisible, looking like lost bookings.
Where: /food_trucks/vendor/markets, "Your next two weeks".
Expect: an active standing reservation shows on its weekday before the occurrence exists, with a note that the
pay-by window opens within 7 days.
Result: ____________   Notes:

TR-044  Double-booking is refused on both verticals  (currently FAIL — build pending)
Why: owner ruling 2026-09-13: the "I can staff more than one location at the same time" box gates schedule
conflicts on farmers markets too.
Where: /farmers_market/vendor/markets, join a second market on a weekday you already hold; /vendor/edit with the
box unchecked.
Expect after the build: refused, naming the conflicting market; checking the box allows it.
Result: ____________   Notes:

TR-048  Vendor orders count cards include cancelled orders  (currently FAIL)
Where: /[vertical]/vendor/orders after a buyer cancels.
Expect after a fix: the status count cards at the top agree with the list below.
Result: ____________   Notes:

TR-049  Admin stuck-orders card goes somewhere  (currently FAIL — no destination exists)
Where: /[vertical]/admin, "Needs you now", the card "N orders stuck in paid/confirmed 24+ h".
Expect after a build: tapping it opens the list of those orders.
Result: ____________   Notes:

TR-050  Browse filters are findable  (currently FAIL — discoverability)
Where: /[vertical]/browse, the Filters button.
Steps: without help, try to find "everything I can order right now" and then market boxes.
Expect: both are found without opening the filters popup, once redesigned. Note where you looked first.
Result: ____________   Notes:


==================================================
SECTION 5 — PRODUCTION SMOKE (owner only, needs a Stripe-enabled vendor)
==================================================

TR-060  A real checkout on production decrements stock.
TR-062  A real buyer acknowledge plus vendor fulfill within 30 seconds on production moves the payout.
Why: both passed on staging on 2026-09-13; production has the same code and database rules, but a live order is
the remaining proof.
Result: ____________   Notes:
