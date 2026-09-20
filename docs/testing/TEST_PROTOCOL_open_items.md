STAGING TEST PROTOCOL — READY TO RUN
Regenerated 2026-09-19 from the Test Registry (docs/testing/TEST\_REGISTRY.md). Plain text: paste into Word as-is.
Only items with no recorded result from the owner. Tests you reported as passing are gone; tests reported as
failing return here when their fix ships.
Staging: https://inpersonmarketplace-git-staging-tsjr00s-projects.vercel.app
Replace \[vertical] in any path with farmers\_market or food\_trucks.

HOW TO USE

* Tests are GROUPED BY WORKFLOW, each group with its own colored dot. Run a group in one sitting: the tests in a
group share the same screens and the same setup, so you will often knock out several in one pass.
* Each block is one test. Quote the ID back: "TR-026 passed" is a complete result. If you notice you already
covered a test while running another, say so — the ID is what gets recorded, not the order you ran them in.
* Result line: Pass, Fail, or Couldn't run, plus the date. Anything unexpected goes in Notes, in your own words.
* Do not rate severity. Screenshots help. Hard-refresh after any new deploy.

==================================================
★ WHAT'S NEW — retest these first
===

Last update: 2026-09-19 (evening) · staging build PENDING PUSH (hard-refresh before testing).
Fixes shipped since your last results (2026-09-18, OB-026/OB-027; 2026-09-19 OB-028 booth conflict). Each line
points at its full block below. When this section is empty, there is nothing new to retest — go straight to the
regular groups.

BOOTH ROUND PART B (your 09-19 rulings: manager veto at every managed market, size at Apply, size + number at approval):
🔵 TR-083  Every managed market — free too — needs the manager's approval before picking days  (replaces TR-076/077)
🔵 TR-084  Apply asks which booth size you want; the manager sees the request
🔵 TR-085  Approve sets size + booth number + note in one step; the vendor is told
🟠 TR-086  Booking is locked to the assigned size; unapproved vendors see the apply door
🟠 TR-087  Booking needs at least one declared day — the day picker unlocks the form

BOOTH ROUND PART A (your 09-19 booth-conflict report; migration 256 on Dev + Staging):
🟠 TR-078  A pinned vendor can book their own booth (the bug you hit)         (your 09-19 report)
🟠 TR-079  A season purchase keeps ONE booth number for every week           (your 09-19 ruling)
🟠 TR-080  Manager can pin a vendor to the booth they already rent           (found in the review)
🟠 TR-081  Revoking a vendor frees their booth number                        (found in the review)
🟠 TR-082  Occupancy grid shows paid renters; pins listed as holds, not counted (found in the review)

EARLIER (2026-09-18 push, still to run):
🟢 TR-069  Market-limit refusal now names the 4 counted markets              (your 09-18 report, item 1)
🟢 TR-034  FM no longer mentions "Pickup Capacity"; FT half still to run       (your 09-18 report, item 4)
🔵 TR-071  Apply shows the market agreement + document-sharing box            (your 09-18 TR-036 question)
🔵 TR-036  Manager "View docs" page — now reachable via TR-071
   (TR-076 and TR-077 are withdrawn — your 09-19 ruling replaced the free-market rules they tested; see TR-083.)
🔵 TR-072  "No paid week yet" on the manager's roster                         (your 09-18 booth question)
🟠 TR-073  Fee-market items sell only for a paid booth week (migration 255)   (your 09-18 rulings)
🟠 TR-074  Week strip shows "payment due" until a week is paid
🟠 TR-075  Buyers see a fee market only once a vendor has paid; manager card says so
🟣 TR-025  Re-run with a vendor whose multi-location box is UNCHECKED          (your 09-18 attempt was by-design)

Still open from the 2026-09-17 events push (never reported): 🟣 TR-022, 064, 065, 066, 067, 068 — all on one fresh
self-service event, in that order.



GROUPS
🟢 Vendor sets up listings, schedules and markets
🔵 Vendor joins a market · manager's roster
🟠 Booth weeks and money at managed markets
🟣 Events (organizer, vendor, admin)
🟡 Market bundles
🟤 Market boxes
🔴 Orders
⚫ Not runnable yet



==================================================
🟢 GROUP 1 — VENDOR SETS UP LISTINGS, SCHEDULES AND MARKETS   (6 tests)
===

Screens: /\[vertical]/vendor/listings/\[id]/edit · /\[vertical]/vendor/edit · /\[vertical]/vendor/markets · booking pages.



🟢 TR-069  Market-limit refusal names the markets already counted  (fix shipped 2026-09-18)
Where: /farmers\_market/vendor/listings/\[id]/edit on the vendor who hit "Market limit reached (4/3)".
Steps: tick a traditional market and save.
Expect: the refusal says your free plan allows 3 traditional markets counted across ALL your listings and
market-box pickup markets, and LISTS the 4 markets already counted. (No grandfathering — the count stands.)
Result: \_\_\_\_\_\_\_\_\_\_\_\_   

Notes: >++> I think another fix forces this issue resolved and makes it so i cant test it - when a vendor has used up their markets available for their tier the other markets are not selectable - accessible markets have a line around them and a clickable - but only 3 of the 7 markets shown for this vendor. maybe its because ths markets have not accepted the vendors



🟢 TR-034  Capacity copy  (Private Events Readiness half PASSED 09-18; the other half is FOOD TRUCKS ONLY)
Where: /food\_trucks/vendor/edit — the Pickup Capacity section exists only for food trucks.
Expect: the new sentence under Pickup Capacity. Also on /farmers\_market/vendor/edit and the FM dashboard
pickup-line notice: no mention of "Pickup Capacity" anywhere (removed 09-18).
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟢 TR-044  Double-booking needs the multi-location declaration, on BOTH verticals  (fix shipped: Push C + migration 253)
Where: /\[vertical]/vendor/edit, the box "I can staff more than one location at the same time";
/\[vertical]/vendor/markets.
Steps: as a farmers\_market vendor with the box UNCHECKED, activate a second market on a weekday and time you
already occupy elsewhere. Then check the box and try again. Repeat once on food\_trucks.
Expect: unchecked → refused, with a message naming the market you are already at; checked → succeeds.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟢 TR-046  Booking page: operating-days line placement  (fix shipped: Push D)
Where: /\[vertical]/markets/\[id]/book on a market that shows a booth map.
Expect: the operating-days line sits BELOW the map and ABOVE the week / booth selection.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟢 TR-042  Day-of buyer copy
Where: /food\_trucks/listing/\[id] with 0-day advance ordering, on a non-operating day.
Expect: "Orders Open on Operating Days"; badge tooltip no longer claims prep time.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟢 TR-043  Week-strip standing hold
Where: /food\_trucks/vendor/markets "Your next two weeks".
Expect: an active standing reservation shows on its weekday more than 7 days out, with the pay-by note.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



==================================================
🔵 GROUP 2 — VENDOR JOINS A MARKET · MANAGER'S ROSTER   (6 tests)
===

Screens: /\[vertical]/markets/\[id] (Apply) · /\[vertical]/vendor/markets (day picker) · manager dashboard roster.
Setup that serves the group: one vendor with no history at a FREE managed market (no priced booth tier), one
vendor with no history at a CHARGING managed market, and the manager account for each.
The rule since 2026-09-19: EVERY managed market — free or charging — needs the manager's one-time approval
before a vendor can pick days or book. Apply is the front door; approval sets the vendor's booth size and number.



🔵 TR-071  Applying to a market shows its agreement and a document-sharing box  (fix shipped 2026-09-18)
Where: /\[vertical]/markets/\[id] for a MANAGED market → "Apply to Sell Here".
Expect: the form shows the market agreement with an "I agree" box, and below it "Share my onboarding documents
with this market's manager" with a small grey line explaining why managers review documents. Submit stays
disabled until "I agree" is ticked. After submitting, the manager's roster shows you; "View docs" appears on
your row only if you ticked the sharing box.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🔵 TR-083  Every managed market needs the manager's approval before a vendor can pick days  (your 09-19 ruling; replaces TR-076/077)
Where: as a vendor with NO history at a managed market with NO priced booth tier, /\[vertical]/vendor/markets →
open that market's day picker and tick a day.
Expect: refused with a red (blocking) message — "«Market» reviews vendor applications. Apply from the market's
page…". No agreement block appears in the picker any more (Apply carries it). Apply from the market page, then as
the manager approve the vendor → the toggle now saves. A vendor who already had days at this market before
today keeps editing them (grandfathered).
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🔵 TR-084  Apply asks which booth size you want; the manager sees the request  (your 09-19 ruling)
Where: /\[vertical]/markets/\[id] for a managed market WITH priced booth tiers → "Apply to Sell Here".
Expect: a "Booth size you'd like" select lists the tiers with weekly prices and Submit stays disabled until one is
chosen (plus the agreement, as before). A market with no priced tiers shows no size question. As the manager,
the pending row on the roster reads "Requested: <size>".
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🔵 TR-085  Approve sets size + booth number + note in one step; the vendor is told  (your 09-19 ruling)
Where: manager dashboard → vendor roster → the pending row from TR-084.
Expect: next to Approve there is a size select (pre-set to what they requested), a booth # field and a "Note to
vendor" field. Change the size, type a number and a note, Approve → the row shows the number and tier. The vendor's
notification (bell + email) reads "Your booth: #N · <size> size…" and includes your note. Approving with the
fields left blank still works (nothing set).
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🔵 TR-036  Manager vendor-docs page  (evidence only — the door shipped 2026-09-18)
Where: manager dashboard → vendor roster → "View docs" on a vendor who ticked the sharing box (TR-071).
Steps: open it. If it errors, capture the on-screen error or the Vercel log line.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🔵 TR-072  "No paid week yet" note on the manager's roster  (fix shipped 2026-09-18)
Where: /\[vertical]/market-manager/\[marketId] vendor roster, at an FM market that has a PRICED booth tier.
Expect: an approved vendor with no paid booth week shows an amber "· no paid week yet" (hover explains); after
that vendor pays a week it disappears. A market with no priced booth tier shows no note at all.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



==================================================
🟠 GROUP 3 — BOOTH WEEKS AND MONEY AT MANAGED MARKETS   (12 tests)
===

Screens: /\[vertical]/markets/\[id]/book · manager dashboard (vendor roster, booth occupancy) · /\[vertical]/listing/\[id] ·
/\[vertical]/vendor/markets "Your next two weeks" · manager visibility card · /\[vertical]/markets public list ·
manager cancel-date.
Setup that serves most of this group: ONE of the 21 vendors from the 255 pre-check (Amarillo Community, Market 2
Test, River Road or Westgate Mall — all four charge for booths). Check everything BEFORE they pay, then have them
book + pay one week, then check everything again.
Words used below — PIN: the booth number the manager types on the roster (a hold; the vendor may never pay).
BOOKING: a week the vendor booked and paid for. Migration 256 must be on Staging before the first five tests.



🟠 TR-078  A pinned vendor can book their own booth  (the bug from your 09-19 report; migration 256)
Where: as the manager, pin the test vendor to booth #5 on the roster. Then as that vendor, /\[vertical]/markets/\[id]/book:
pick any tier, agree, Continue to payment.
Expect: reaches Stripe — no "BOOTH_CONFLICT" message. After paying, the booking shows booth #5 (the pin, whatever the
tier). Pin a DIFFERENT vendor to #5 while the first still holds a paid week → refused with a plain-English message.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟠 TR-079  A season purchase keeps ONE booth number for every week  (your 09-19 ruling; migration 256)
Where: a market with an open pre-season window; buy the season (or a partial set of weeks) as the pinned vendor,
then as a vendor with no pin. /\[vertical]/vendor/bookings afterwards.
Expect: pinned vendor — every week shows the pinned number. Unpinned vendor — every week shows the SAME
auto-assigned number. If no single booth is free for all the weeks, the message says "a season keeps one booth all
season" rather than blaming one week.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟠 TR-080  Manager can pin a vendor to the booth they already rent  (found in the booth review)
Where: manager dashboard → vendor roster. A vendor holds a paid (or pending) week at auto-assigned booth #N.
Expect: typing N into THAT vendor's booth field and saving works. Typing N for a different vendor is still refused.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟠 TR-081  Revoking a vendor frees their booth number  (found in the booth review)
Where: manager dashboard → vendor roster. Pin an approved vendor to #N, then Revoke them.
Expect: the row shows no booth or tier; pinning another vendor to #N now works. (Any week the revoked vendor already
paid for is untouched — it is still theirs.)
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟠 TR-082  Occupancy grid shows paid renters; pins are listed as holds and not counted  (found in the booth review)
Where: manager dashboard → "Booth occupancy — this week", on a market with one paid booking THIS week and one pinned
vendor who has not booked.
Expect: the paying vendor appears under their tier as "Paid this week" (before this fix they never appeared); a
pending checkout appears as "Pending payment"; the pinned vendor appears as "Pinned (hold)". The tier's "N of M
occupied" counts the bookings only, not the hold.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟠 TR-086  Booking is locked to the assigned size; an unapproved vendor sees the apply door  (your 09-19 ruling)
Where: /\[vertical]/markets/\[id]/book.
Expect: as the vendor approved in TR-085 — a box "Your booth at «Market»: #N · <size> size — assigned by the
manager", the size picker disabled on that size ("set by the manager"), and "Continue to payment" works. As a
vendor with no approval at a managed market — "Apply to «Market» first" (or "Your application… is with the
manager") with a link, and no form.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟠 TR-087  Booking needs at least one declared day — the day picker unlocks the form  (your 09-19 ruling "C")
Where: /\[vertical]/markets/\[id]/book as an approved vendor who has NOT ticked any days at this market.
Expect: an amber "First, pick the days you attend «Market»" box with the day toggles sits above the form,
"Continue to payment" is disabled with the reason, and the season picker is hidden. Tick a day → "Done — continue
to booking" → the form unlocks and the season picker appears.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟠 TR-073  A vendor sells at a fee-charging managed FM market ONLY with a paid booth week  (migration 255 is on Staging)
Where: one of that vendor's items, /\[vertical]/listing/\[id].
Expect: before paying — no pickup dates at that market and the item cannot be carted there; after paying — dates
appear for that week only. A free managed market and an off-app market are unchanged.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟠 TR-074  Week strip shows "payment due" at a fee market until a week is paid  (fix shipped 2026-09-18)
Where: /\[vertical]/vendor/markets, "Your next two weeks", as that vendor.
Expect: the fee market's weekday renders amber "No paid booth week — book this week to sell here"; after paying a
week those dates render as a normal booth entry. Off-app markets still render normally.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟠 TR-075  Buyers see a fee market only when a vendor has paid a week; the manager's card says so  (fix shipped 2026-09-18)
Where: manager dashboard visibility card on that fee market; /\[vertical]/markets public list.
Expect: before paying — the card says the market isn't visible and names "a paid booth week" as the third
requirement; the public list omits the market. After paying — both flip.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟠 TR-040  Cancel-date result card
Where: manager — /\[vertical]/market-manager/\[marketId], cancel a park date.
Expect: truthful counts (trucks credited with a $ total, roster notified); FT card shows an auto-credit note plus
optional make-up date, no radio buttons.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟠 TR-041  Survey email links to staging
Expect: a survey email sent from staging links to the staging deployment.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



==================================================
🟣 GROUP 4 — EVENTS (organizer, vendor, admin)   (14 tests)
===

Background: an organizer requests an event; vendors are invited and accept; the organizer selects a roster and
trims menus; the event opens for pre-orders; the shop sells. "Accepted" is not "selected".
Setup that serves the first six: ONE fresh self-service event with 3 accepted vendors, then a 4th who accepts
after your first selection. Run TR-022 → 064 → 065 → 066 → 067 → 068 in that order on the same event.



🟣 TR-022  Public event page lists only the vendors you selected  (fix shipped 2026-09-17)
Where: /\[vertical]/events/\[token] for a SELF-SERVICE event.
Steps: before selecting anyone, open the page; then select 2 of 3 accepted vendors on
/\[vertical]/events/\[token]/select and reload; then have another vendor accept late and reload again.
Expect: before any selection — "Upcoming Event" and "Vendors Are Still Responding" (no vendor listed); after —
"2 Vendors Attending" with only those two menus; the late vendor does NOT appear until you select them.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟣 TR-064  Vendors take event pre-orders only once selected  (fix shipped 2026-09-17 + migration 254, ON STAGING)
Where: /\[vertical]/events/\[token]/shop and an accepted vendor's item page /\[vertical]/listing/\[id], on a FREE
self-service event with 3 accepted vendors.
Steps: before selecting anyone, open the shop and one accepted vendor's item page; select 2 vendors; check again;
then check the unselected vendor's items at their REGULAR market.
Expect: before selection — the shop shows no menus and the item page offers no pickup date for the event; after —
the two selected vendors' menus appear and can be ordered, the third vendor's do not; the third vendor's
regular-market items stay orderable the whole time (not being selected is never a penalty).
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟣 TR-065  Rolling selection: each menu can be trimmed once, when you first select that vendor  (fix shipped 2026-09-17)
Where: /\[vertical]/events/\[token]/select.
Steps: select 2 of 3 vendors, trim one menu, confirm. Have a 4th vendor accept late. Tap "Change selections".
Select the late vendor, trim one item, confirm. Tap "Change selections" once more.
Expect: in change mode the first two are pre-ticked, show "Menu set when you selected this vendor" and have NO
trim controls; the late vendor HAS trim controls; a benched vendor shows "Backup vendors bring their full menu".
After confirming, the late vendor's page /\[vertical]/vendor/events/\[marketId] shows "approved N of M" and the
removed item is absent from the shop. On the last visit the late vendor is locked too.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟣 TR-066  A dropped vendor no longer shows as confirmed  (fix shipped 2026-09-17)
Where: /\[vertical]/events/\[token]/select. Use a FRESH drop — vendors dropped before this push keep the old behaviour.
Steps: Change selections → untick a confirmed vendor → confirm the drop → reload the page → Change selections.
Expect: the dropped vendor is NOT under "Your vendors are confirmed" and is NOT pre-ticked. If you select them
again on purpose, they receive a new "you're selected" notification.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟣 TR-067  "Short on options?" now tells you how to reach more vendors  (fix shipped 2026-09-17)
Where: the confirmed view of /\[vertical]/events/\[token]/select, in the Backup box (it shows when fewer vendors are
on standby than recommended).
Steps: follow the sentence — event dashboard → Event Details → widen vendor types / preferences / number of
vendors → Save → tap "Refresh matches".
Expect: the Refresh matches prompt appears after the save, and tapping it reports new invitations (or that no new
vendors qualified).
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟣 TR-068  Farmers-market wording on the organizer's Event Details  (fix shipped 2026-09-17)
Where: /farmers\_market/event-manager/\[id]/dashboard → Event Details; compare /food\_trucks/event-manager/\[id]/dashboard.
Expect (farmers market): "Product Preferences", "Total Budget", "Budget Per Person", "Expected Number of Buyers",
"Dietary or Product Requirements", "Other Food or Products at Venue", "Other Vendors Present?", event type
"Corporate / Workplace Event", produce / baked goods / crafts example text. Food trucks: exactly as before.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟣 TR-023  Invitations-held gate
Where: admin event detail on /\[vertical]/admin/events for a self-serve approved event, invitations not sent.
Expect: "Open Pre-Orders — invitations held" DISABLED with a tooltip; Inviting card says held.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟣 TR-024  Forced ready while held (optional)
Expect: the organizer's progress view says nothing is orderable, not "pre-order now".
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟣 TR-025  Reverse event-conflict guard  (your 09-18 attempt used a vendor WITH the multi-location box — that vendor
is exempt by design, so it was not a result)
Where: /\[vertical]/vendor/markets/\[id]/book-park-spot (or booth / season forms) on the accepted event's date, as a
vendor whose multi-location box on /vendor/edit is UNCHECKED.
Expect: refused with a message to withdraw from the event first.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟣 TR-026  Browse "Closed" pill matches the detail page
Where: /\[vertical]/browse card vs /\[vertical]/listing/\[id] for an event-selected listing.
Expect: same Open/Closed pill on both.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟣 TR-030  Re-confirm page after a vendor withdraws
Where: /\[vertical]/reconfirm/\[token].
Expect: reflects live items (all cancelled → withdrawal copy; some → partial; live → "stands").
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟣 TR-032  "Not eligible" badge for an unapproved applicant
Where: a FRESH vendor signup left unapproved submits Private Events Readiness → /\[vertical]/admin/events.
Expect: the gray "not eligible — vendor not yet approved" badge.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟣 TR-033  Fee card reuse-button styling
Expect: outlined natural-width buttons over the yellow box; side by side desktop, stacked mobile.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟣 TR-035  Below-claim note on the invitation accept form
Expect: amber advisory when the number entered is below the profile default.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



==================================================
🟡 GROUP 5 — MARKET BUNDLES   (5 tests)
===

Screens: /\[vertical]/markets/\[id] "Market Bundles" · /\[vertical]/vendor/orders · manager bundles run-sheet ·
/\[vertical]/buyer/orders/\[id].
Setup: ONE fresh bundle order carries TR-001 and TR-005; TR-002 and TR-003 each need their own fresh order.



🟡 TR-001  Fresh bundle order: the quiet notification sequence  (fix shipped: Push A)
Where: buyer — market page /\[vertical]/markets/\[id], section "Market Bundles"; vendor — /\[vertical]/vendor/orders;
manager — /\[vertical]/market-manager/\[marketId], the bundles run-sheet.
Steps: buy a bundle; each vendor marks Ready; as manager tap "Receiving now" per vendor and let the vendor tap
Fulfill within 30 seconds; tap "Ready — notify buyer"; tap "Mark handed off"; as buyer open the ORDER DETAIL
page and tap the yellow acknowledge.
Expect: the buyer receives NOTHING when vendors confirm or fulfil; if a vendor taps Fulfill before your
Receiving-now tap they see "Wait for the market manager to tap Receiving now…" and nothing changes; after
"Ready — notify buyer" the buyer gets exactly ONE ready notice; the order detail page shows ONLY the yellow
bundle acknowledge (no green per-item acknowledge); the orders list shows no "confirm you received it" banner;
after the acknowledge no review popup; the placed email names the bundle, the market and the pickup spot.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟡 TR-005  The buyer's "bundle ready" email  (fix shipped: Push A)
Where: the buyer's inbox after the manager's "Ready — notify buyer" tap in TR-001.
Expect: one email, naming the bundle and the market, with the pickup spot. (The manager's own "Ready to
collect" emails are the manager's, not the buyer's.)
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟡 TR-010  Market Bundles cards fit a narrow phone  (fix shipped: Push D)
Where: /\[vertical]/markets/\[id], section "Market Bundles", on a phone.
Expect: nothing runs past the edge of the card or the screen; long lines (e.g. "created by this market") wrap;
the name / price row wraps if it has to. A screenshot either way helps — the cause was read from code only.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟡 TR-002  Cancel a bundle inside the first hour
Why: refund money that has never been run by a person.
Where: buyer — /\[vertical]/buyer/orders/\[id], the bundle card, "Cancel bundle".
Steps: buy a fresh bundle; within 60 minutes, cancel it.
Expect: full refund, to the cent, on the page and in Stripe.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟡 TR-003  Cancel a bundle after the hour, once a vendor has confirmed
Where: same page, a different order; a vendor confirms first; wait past the first hour; cancel.
Expect: 75% refund (25% fee on items and margin), tip refunded in full, dialog wording "Cancelling after the
first hour or once a vendor has confirmed…".
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



==================================================
🟤 GROUP 6 — MARKET BOXES   (3 tests)
===

Screens: vendor dashboard "My Upcoming Pickups" · /\[vertical]/vendor/markets · /\[vertical]/buyer/subscriptions/\[id]
· /\[vertical]/buyer/orders · /\[vertical]/vendor/market-boxes/\[id].
Setup: ONE market-box purchase carries all three.



🟤 TR-015  Market box appears in the vendor's upcoming pickups and week strip  (fix shipped: Push B)
Where: vendor dashboard card "My Upcoming Pickups"; /\[vertical]/vendor/markets "Your next two weeks".
Steps: buy a market box as a buyer with a pickup date inside the next 7 / 14 days.
Expect: the box's pickup day shows on the dashboard tile (counted as an item at that market) and on the week
strip as a "market box" entry at the pickup market with the offering's hours.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟤 TR-014  Pickup count agrees between two buyer pages  (fix shipped: Push B + migration 252)
Where: /\[vertical]/buyer/subscriptions/\[id] and /\[vertical]/buyer/orders.
Steps: complete pickup 1 of a box (buyer confirms, vendor confirms within 30 seconds).
Expect: both pages show "1 of N pickups completed". SQL check: the subscription's weeks\_completed reads 1.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



🟤 TR-016  Order number on the vendor's market-box page  (fix shipped: Push B)
Where: /\[vertical]/vendor/market-boxes/\[id], tabs Subscribers and Pickups.
Expect: each row shows "Order #FA-…" beside the week line.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



==================================================
🔴 GROUP 7 — ORDERS   (1 test)
===



🔴 TR-048  Vendor orders count cards include buyer-cancelled orders  (fix shipped: Push B)
Where: /\[vertical]/vendor/orders after a buyer cancels an order pre-confirmation.
Expect: the "cancelled" count card at the top includes it, matching the list below.
Result: \_\_\_\_\_\_\_\_\_\_\_\_   Notes:



==================================================
⚫ GROUP 8 — OPEN, BUT NOT RUNNABLE YET (nothing for you to do until the blocker clears)
===

⚫ TR-028  Event cancellation money
⚫ TR-029  Event deselect and refund money
Why: the only open tests that move real money on events. Blocker: need an event with a PAID vendor fee on
staging. Steps will be issued once one exists.

⚫ TR-031  Protocol v6 remainder (buyer items + weekly survey · onboarding copy · manager new-email invite and
resend · farmers-market mirror · print chrome)
Blocker: the steps live in an old working note and must be re-issued in this format before they can be run.

⚫ TR-060  Normal checkout decrements stock — ON PROD
⚫ TR-062  Buyer acknowledge + vendor fulfil inside 30 seconds moves the payout — ON PROD
Both passed on staging 2026-09-13. Blocker on Prod: no real vendor with Stripe set up yet.

