STAGING TEST PROTOCOL — READY TO RUN
Regenerated 2026-09-17 from the Test Registry (docs/testing/TEST_REGISTRY.md). Plain text: paste into Word as-is.
Only items with no recorded result from the owner. Removed: every test reported as passing, and every test
reported as failing whose fix has not shipped yet (those are in the registry as "fail" / "partial" and return
to this list when their fix ships).
Staging: https://inpersonmarketplace-git-staging-tsjr00s-projects.vercel.app
Replace [vertical] in any path with farmers_market or food_trucks.

HOW TO USE
- Each block is one test. Quote the ID back: "TR-026 passed" is a complete result.
- Result line: Pass, Fail, or Couldn't run, plus the date. Anything unexpected goes in Notes, in your own words.
- Do not rate severity. Screenshots help. Hard-refresh after any new deploy.


==================================================
SECTION 0 — RETESTS OF SHIPPED FIXES (9 — run these first; they close the most rows)
==================================================

TR-001  Fresh bundle order: the quiet notification sequence  (fix shipped: Push A)
Where: buyer — market page /[vertical]/markets/[id], section "Market Bundles"; vendor — /[vertical]/vendor/orders;
manager — /[vertical]/market-manager/[marketId], the bundles run-sheet.
Steps: buy a bundle; each vendor marks Ready; as manager tap "Receiving now" per vendor and let the vendor tap
Fulfill within 30 seconds; tap "Ready — notify buyer"; tap "Mark handed off"; as buyer open the ORDER DETAIL
page and tap the yellow acknowledge.
Expect: the buyer receives NOTHING when vendors confirm or fulfil; if a vendor taps Fulfill before your
Receiving-now tap they see "Wait for the market manager to tap Receiving now…" and nothing changes; after
"Ready — notify buyer" the buyer gets exactly ONE ready notice; the order detail page shows ONLY the yellow
bundle acknowledge (no green per-item acknowledge); the orders list shows no "confirm you received it" banner;
after the acknowledge no review popup; the placed email names the bundle, the market and the pickup spot.
Result: ____________   Notes:

TR-005  The buyer's "bundle ready" email  (fix shipped: Push A)
Where: the buyer's inbox after the manager's "Ready — notify buyer" tap in TR-001.
Expect: one email, naming the bundle and the market, with the pickup spot. (The manager's own "Ready to
collect" emails are the manager's, not the buyer's.)
Result: ____________   Notes:

TR-015  Market box appears in the vendor's upcoming pickups and week strip  (fix shipped: Push B)
Where: vendor dashboard card "My Upcoming Pickups"; /[vertical]/vendor/markets "Your next two weeks".
Steps: buy a market box as a buyer with a pickup date inside the next 7 / 14 days.
Expect: the box's pickup day shows on the dashboard tile (counted as an item at that market) and on the week
strip as a "market box" entry at the pickup market with the offering's hours.
Result: ____________   Notes:

TR-014  Pickup count agrees between two buyer pages  (fix shipped: Push B + migration 252)
Where: /[vertical]/buyer/subscriptions/[id] and /[vertical]/buyer/orders.
Steps: complete pickup 1 of a box (buyer confirms, vendor confirms within 30 seconds).
Expect: both pages show "1 of N pickups completed". SQL check: the subscription's weeks_completed reads 1.
Result: ____________   Notes:

TR-016  Order number on the vendor's market-box page  (fix shipped: Push B)
Where: /[vertical]/vendor/market-boxes/[id], tabs Subscribers and Pickups.
Expect: each row shows "Order #FA-…" beside the week line.
Result: ____________   Notes:

TR-048  Vendor orders count cards include buyer-cancelled orders  (fix shipped: Push B)
Where: /[vertical]/vendor/orders after a buyer cancels an order pre-confirmation.
Expect: the "cancelled" count card at the top includes it, matching the list below.
Result: ____________   Notes:

TR-044  Double-booking needs the multi-location declaration, on BOTH verticals  (fix shipped: Push C + migration 253)
Where: /[vertical]/vendor/edit, the box "I can staff more than one location at the same time";
/[vertical]/vendor/markets.
Steps: as a farmers_market vendor with the box UNCHECKED, activate a second market on a weekday and time you
already occupy elsewhere. Then check the box and try again. Repeat once on food_trucks.
Expect: unchecked → refused, with a message naming the market you are already at; checked → succeeds.
Result: ____________   Notes:

TR-046  Booking page: operating-days line placement  (fix shipped: Push D)
Where: /[vertical]/markets/[id]/book on a market that shows a booth map.
Expect: the operating-days line sits BELOW the map and ABOVE the week / booth selection.
Result: ____________   Notes:

TR-010  Market Bundles cards fit a narrow phone  (fix shipped: Push D)
Where: /[vertical]/markets/[id], section "Market Bundles", on a phone.
Expect: nothing runs past the edge of the card or the screen; long lines (e.g. "created by this market") wrap;
the name / price row wraps if it has to. A screenshot either way helps — the cause was read from code only.
Result: ____________   Notes:


==================================================
SECTION 1 — MARKET BUNDLES, still open
==================================================

TR-002  Cancel a bundle inside the first hour
Why: refund money that has never been run by a person.
Where: buyer — /[vertical]/buyer/orders/[id], the bundle card, "Cancel bundle".
Steps: buy a fresh bundle; within 60 minutes, cancel it.
Expect: full refund, to the cent, on the page and in Stripe.
Result: ____________   Notes:

TR-003  Cancel a bundle after the hour, once a vendor has confirmed
Where: same page, a different order; a vendor confirms first; wait past the first hour; cancel.
Expect: 75% refund (25% fee on items and margin), tip refunded in full, dialog wording "Cancelling after the
first hour or once a vendor has confirmed…".
Result: ____________   Notes:


==================================================
SECTION 2 — EVENTS (organizer, vendor/truck, admin)
==================================================
Background: an organizer requests an event; trucks are invited and accept; the organizer selects a roster and
approves menus; the event opens for pre-orders; the shop sells; settlement follows. "Accepted" is not "selected".
(TR-021 and TR-022 were reported 2026-09-15 and are no longer here: TR-021 passed; TR-022 passed on the
dashboard and failed on the public event page — that fix is first in the events round and TR-022 returns to
Section 0 when it ships.)

TR-023  Invitations-held gate
Where: admin event detail on /[vertical]/admin/events for a self-serve approved event, invitations not sent.
Expect: "Open Pre-Orders — invitations held" DISABLED with a tooltip; Inviting card says held.
Result: ____________   Notes:

TR-024  Forced ready while held (optional)
Expect: the organizer's progress view says nothing is orderable, not "pre-order now".
Result: ____________   Notes:

TR-025  Reverse event-conflict guard
Where: /[vertical]/vendor/markets/[id]/book-park-spot (or booth / season forms) on the accepted event's date.
Expect: refused with a message to withdraw from the event first.
Result: ____________   Notes:

TR-026  Browse "Closed" pill matches the detail page
Where: /[vertical]/browse card vs /[vertical]/listing/[id] for an event-selected listing.
Expect: same Open/Closed pill on both.
Result: ____________   Notes:

TR-030  Re-confirm page after a vendor withdraws
Where: /[vertical]/reconfirm/[token].
Expect: reflects live items (all cancelled → withdrawal copy; some → partial; live → "stands").
Result: ____________   Notes:

TR-032  "Not eligible" badge for an unapproved applicant
Where: a FRESH vendor signup left unapproved submits Private Events Readiness → /[vertical]/admin/events.
Expect: the gray "not eligible — vendor not yet approved" badge.
Result: ____________   Notes:

TR-033  Fee card reuse-button styling
Expect: outlined natural-width buttons over the yellow box; side by side desktop, stacked mobile.
Result: ____________   Notes:

TR-034  Capacity copy on /[vertical]/vendor/edit
Expect: new sentence under Pickup Capacity and new paragraph under Private Events Readiness.
Result: ____________   Notes:

TR-035  Below-claim note on the invitation accept form
Expect: amber advisory when the number entered is below the profile default.
Result: ____________   Notes:

TR-036  Manager vendor-docs page crash (evidence only)
Where: /[vertical]/market-manager/[marketId]/vendor-docs/[vendorProfileId].
Steps: open it; if it errors, capture the Vercel log line or the on-screen error.
Result: ____________   Notes:


==================================================
SECTION 3 — PARKS, SCHEDULES, LISTINGS
==================================================

TR-040  Cancel-date result card
Where: manager — /[vertical]/market-manager/[marketId], cancel a park date.
Expect: truthful counts (trucks credited with a $ total, roster notified); FT card shows an auto-credit note plus
optional make-up date, no radio buttons.
Result: ____________   Notes:

TR-041  Survey email links to staging
Expect: a survey email sent from staging links to the staging deployment.
Result: ____________   Notes:

TR-042  Day-of buyer copy
Where: /food_trucks/listing/[id] with 0-day advance ordering, on a non-operating day.
Expect: "Orders Open on Operating Days"; badge tooltip no longer claims prep time.
Result: ____________   Notes:

TR-043  Week-strip standing hold
Where: /food_trucks/vendor/markets "Your next two weeks".
Expect: an active standing reservation shows on its weekday more than 7 days out, with the pay-by note.
Result: ____________   Notes:


==================================================
SECTION 4 — OPEN, BUT NOT RUNNABLE YET (nothing for you to do until the blocker clears)
==================================================

TR-028  Event cancellation money
TR-029  Event deselect and refund money
Why: the only open tests that move real money on events. Blocker: need an event with a PAID vendor fee on
staging. Steps will be issued once one exists.

TR-031  Protocol v6 remainder (buyer items + weekly survey · onboarding copy · manager new-email invite and
resend · farmers-market mirror · print chrome)
Blocker: the steps live in an old working note and must be re-issued in this format before they can be run.

TR-060  Normal checkout decrements stock — ON PROD
TR-062  Buyer acknowledge + vendor fulfil inside 30 seconds moves the payout — ON PROD
Both passed on staging 2026-09-13. Blocker on Prod: no real vendor with Stripe set up yet.
