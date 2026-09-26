STAGING TEST WORKFLOWS — SELF-CONTAINED EDITION
Version 3.3 · 2026-09-26 · written for a tester who has ONLY this document and the app.
Nothing in here refers to any other document. If a step tells you to expect words on the screen, those are the
words the app is supposed to show. If the screen shows something different, that difference IS your finding.

Staging site: https://inpersonmarketplace-git-staging-tsjr00s-projects.vercel.app
The site has two "verticals" that share one code base: farmers_market and food_trucks. Web addresses below
start with one of those two words. Where you see [id], use the id from the page's own web address (for a
market, it is the long code after /market-manager/ or /markets/ in the address bar).

Before every session: hard-refresh the page (Ctrl+F5 on Windows, Cmd+Shift+R on Mac) so you get the newest build.

★ WHAT'S NEW (2026-09-25 build `3f71e947`): run W2 first, then W1, then W3, then W12, then W5.
  W2 is rewritten for a FRESH vendor at River Road (the owner prepares the accounts): the vendor Markets card now
  lists its buttons in the order the work happens, a vendor can get back to an unfinished payment, and saving a
  listing no longer picks market days by itself. W1 is now only the retests: the "not visible to buyers" warning
  moved under Action Items, and the week sheet can be printed before any booking exists and shows app check-ins.
  W3 step 4's button is now called "Cancel this booking".
  NEW W12: seasons end to end (no season was on sale anywhere — every pre-sale window had passed). Run it after W3.
  W9 (market boxes): the dashboard pickup tile now lists dated days (Today / Tomorrow / a date) in the pickup
  market's own time zone, and the market-box page's tab is called "Manage Pickups".
  W5 is rewritten after the latest report: the market-limit box now names the markets it counts; a vendor booked
  in two places at the same time is warned on the profile and refused at booking; retrying your own unpaid week
  with a held booth number offers "Continue payment". W1 gained a check of the documents card wording.


==================================================
HOW TO REPORT
===
Run a workflow top to bottom in one sitting. Each numbered step ends with an "Expect" line. When you finish,
send ONE of these per workflow, in your own words:

    "W2 pass"
    "W2 step 6: the second dropdown never loaded, it just said Loading…"   ← what you actually saw; then keep going if you can
    "W2 step 6 skipped: I don't have a second vendor account"                ← you couldn't do it; that is not a failure

Screenshots help a lot. You never have to rate how serious something is.


==================================================
WORDS USED IN THIS DOCUMENT
===
Vendor ............ someone who sells (a farm, a bakery, a food truck). Has a vendor account.
Buyer / attendee .. someone who orders. Has a buyer account.
Market manager .... the person who runs a market (or, for food trucks, a "park"). Has a manager account.
Managed market .... a market that has a manager in the app. EVERY test market below is managed. At a managed
                    market a vendor must APPLY and be APPROVED by the manager before they can pick days or book.
Charging market ... a managed market that charges vendors for booth space. All the farmers-market test markets
                    below charge. (A "free" market would have $0 booth prices.)
Booth size ........ a category of booth at a market, e.g. "10x10", "Small", "Large Tent". Each size has a weekly
                    price and its own set of booth NUMBERS (e.g. 10x10 = booths 1–10).
Booth number ...... one specific spot, e.g. #5 or A3. A number always belongs to exactly one size.
Hold (or held) .... the manager reserved a booth number for a vendor who has NOT paid for a week yet. A hold
                    can be moved or cleared by the manager.
Booked / paid week  a vendor bought one week at a booth. Their number is LOCKED for that week and the manager
                    cannot change it.
Placeholder ....... a booth rented to someone OFF the app (paid in cash/check). The manager records it so the
                    number is taken. Also called "off-platform".
Roster ............ the manager's list of vendors at the market. On the dashboard it is the card titled
                    "Vendors at this market".
Declared day ...... a weekday the vendor has ticked as "I attend this market on this day" (the "day picker" on
                    the vendor's My Locations page).
Dashboard ......... the manager's main page: /farmers_market/market-manager/[id]/dashboard
Action Items ...... the first card on the manager dashboard — things the manager needs to do.
Setup ............. a collapsible section on the manager dashboard containing Booth inventory, schedule, etc.
Week .............. weeks start on SUNDAY everywhere in the app.
Park / spot ....... food-truck words for market / booth. A "recurring hold" is a truck's standing claim on a
                    spot for one weekday every week.
Wave .............. at an event, a time slot attendees pick to collect their food.


==================================================
THE TEST MARKETS (all on staging; ask the owner for the logins)
===
Amarillo Community Market     farmers market · charges for booths · two sizes: "10x10" numbered 1–10 and
                              "10x15" numbered 11–20 · holds already in place: #5 Sunrise Organic Farm,
                              #6 Happy Hens Farm, #7 Texas Honey Co., #8 Lone Star Succulents, #9 Sweet Rise
                              Bakery, #11 Valley Verde Farm · placeholder #1 "Market Manager Booth"        → W1 (retests)
Market 2 Test                 farmers market · charges · sizes "small" 1–5 ($25/wk), "medium" 6–15 ($35/wk),
                              "large" 16–20 ($50/wk) · hold #7 Hill Country Herbals (medium) · placeholder #1
                              "Check-in / market manager booth" (small)                                     → W2 steps 11–12, W3
Westgate mall Farmers Market  (lowercase "mall") · charges · "Small" 1–10, "Large" 11–15 · placeholders #1, #15  → spare
River Road Farmers Market     charges · "Small Tent" 4–13, "Medium Tent" 14–23, "Large Tent" numbered 1, Booth 2, 3,
                              24, 25 (an odd list on purpose)                                                → W2
Westgate Mall Farmers Market  (capital "Mall") · already fully tested — do not use
Space Camp Musicians Market   lettered numbers A1–A5, B1–B10, C1–C20                                        → spare
Sixth Street Food Park        food trucks — spots, not booths                                               → W4


==================================================
THE WORKFLOWS
===
  W1  Manager dashboard retests: visibility warning, booth-number wording, week sheet  Amarillo · ~15 min
  W2  A fresh vendor, start to paid week, in the new order                           River Road · ~60 min
  W3  Manager cancels a market day and a paid week — credits and notices            Market 2 Test, after W2 · ~20 min
  W4  Food-truck park: operator to-dos, recurring holds, cancel a date              Sixth Street · ~30 min
  W5  Vendor sets up listings and markets — limits, double-booking, wording         ~30 min
  W6  Platform admin looks up a vendor — the two items left (boxes, two questions)  ~5 min
  W7  Events — one fresh self-service event, start to shop                          ~45 min
  W8  Market bundles — three fresh orders                                           ~30 min + a 1-hour wait
  W9  Market boxes — dated pickup tile, "Manage Pickups", pickup progress            ~15 min
  W10 Survey email                                                                  ~2 min
  W11 Platform admin: sales-tax readiness — filter, tax card, Form 01-116 report      Amarillo · ~10 min
  W12 Seasons — create one, open pre-sale, two vendors buy it                       Market 2 Test · ~30 min



==================================================
W1 — MANAGER DASHBOARD: RETESTS AFTER THE 2026-09-25 FIXES   (Amarillo Community Market · manager login · ~15 min)
===
Most of W1 passed on 2026-09-25. These steps re-check only what changed or was not reachable then.
(Passed 2026-09-25 and removed: the "not visible to buyers" card sitting under Action Items — checked at Westgate
Mall; and "1 vendor pending your approval" clearing after the approval.)
All steps happen on /farmers_market/market-manager/[Amarillo id]/dashboard unless a step says otherwise.

 1. The "Action Items" card (the first card).
    Some extra lines appear ONLY when something at the market needs fixing, for example
    "<size name> has no booth numbers yet…" with a link "Set numbers →". If you see any such line, tap its link.
    Expect: the page scrolls to the section the link names (Setup opens by itself if the link points into it).
    If no extra line appears, write "none appeared" — that is not a failure.

 2. Read the small paragraph that begins in bold "How booth numbers work here." on these three cards:
    "Booth inventory" (inside Setup), "Vendors at this market", "Off-platform booth placeholders".
    Expect: the same paragraph on all three, and the sizes now read with the numbers in brackets:
    "10x10 (1–10) · 10x15 (11–20)".

 3. The card "Weekly booth bookings" (in "Booths & occupancy").
    CHECK FIRST: does the card show a week header with arrows (← →)? If yes, Amarillo has bookings now — skip to
    step 3b.
    3a. (no bookings yet) Expect: the card is ONE line: "No bookings yet. Once vendors book, each week's roster
        shows up here with the booth number each one was given. The week sheet already lists your holds and
        off-platform booths." followed by a link "🖨 Print the week sheet →".
    3b. (has bookings) Expect: the same "How booth numbers work here." paragraph as step 2, and in the week header
        a link "🖨 Print this week's sheet". The week shown when the page opens is the CURRENT week.

 4. Tap the print link from step 3.
    Expect: a plain page titled "Amarillo Community Market — week sheet".
    - The line under the title says "(this week)" — or "(next week)" if every Amarillo market day this week has
      already passed (that lets a manager print the coming week early).
    - Above the table, a line in bold starting "Market day:" or "Market days:" listing each market day WITH its
      date (e.g. "Sat, Sep 27").
    - Table columns: Booth # · Vendor · Size · Status · one column per market day (with its date) · "Checked in".
    - Rows: each held number reads "Held · no booking this week"; #1 reads "Off-platform"; a ✓ under a day means
      that vendor said they attend that day. The "Checked in" column is blank (for a pen).
    - "← Previous week" / "Next week →" change the week; the Print button shows a print preview with just the
      page (no links or buttons); "← Back to the dashboard" returns you to the dashboard.

 5. ONLY on an Amarillo market day, with a vendor approved at Amarillo (skip otherwise):
    As that VENDOR, open the vendor dashboard and tap "📍 Check in to Amarillo Community Market now" (allow or
    skip location). As the MANAGER, reload the week sheet from step 4.
    Expect: in that vendor's row, under today's column, "In <time>" (e.g. "In 7:42 AM"). A vendor who checked in
    but has no booking or hold this week still gets a row, with the status "Checked in · no booking this week".

 6. Open "Setup" → the card "Verification Documents" → the box "What we need from you".
    Expect: each line starts with a small dot (•) or a ✅ — these are status marks, NOT boxes to tick — and reads
    "<document> · Requested by the platform · not uploaded yet" (or "· uploaded"). The insurance line reads
    "Insurance self-certification · Requested by the platform · not done yet — the checkbox is below" (or
    "· done"). Under the list: "These are not part of the setup steps above." and, because Amarillo is already
    approved, "…is already approved — keep them current so the platform can verify you if asked." The words
    "before approving your market" do NOT appear.



==================================================
W2 — A FRESH VENDOR, START TO PAID WEEK, IN THE NEW ORDER   (River Road Farmers Market · ~60 min)
===
PREPARED BY THE OWNER BEFORE YOU START (ask for these logins — do not build them yourself):
  • V4 and V5: two vendor accounts that have NEVER been at River Road Farmers Market. Each has ONE published
    listing that is NOT attached to River Road, uses FEWER than 3 traditional markets (so River Road can still be
    ticked), and has a home market set somewhere else.
  • The River Road MANAGER login.
  • A test card: 4242 4242 4242 4242, any future date, any CVC.
CHECK FIRST (write down the answers — some steps depend on them):
  (i)  /farmers_market/markets (logged out): is River Road Farmers Market in the list? If YES, skip the parts of
       steps 6 and 10 marked [visibility] — the market is already visible, so they cannot show the change.
  (ii) /farmers_market/markets/[River Road id]/book as V4: if it says online booking is not available, STOP and
       tell the owner (River Road must take bookings for this workflow).

 1. As V4: open /farmers_market/vendor/markets.
    Expect: V4's home market is NOT open on arrival. In the list of markets it shows a small blue
    "🏠 Home Market" badge and a light-blue row. Tick River Road Farmers Market to open its card.
    Expect on River Road's card: an amber note "This market reviews vendors first: apply from its page (step 1),
    then set your schedule." and the buttons, left to right, each with a number:
    "1 NEXT: Apply" (the only filled button) · "2 Set Schedule" · "3 Book a Booth Space" · "4 Manage Listings" ·
    "5 📋 Prep Sheet".

 2. Still as V4, on River Road's card: tap "Set Schedule" (doing step 2 before step 1 on purpose) and tick any
    day in the day picker that opens.
    Expect: refused in a RED box headed "Manager approval needed" with the text "River Road Farmers Market
    reviews vendor applications. Apply from the market's page — the manager will be notified and you'll be able
    to set your schedule once approved."

 3. Still as V4: open V4's listing (/farmers_market/vendor/listings → the listing → Edit), tick River Road Farmers
    Market under "Available at", Save. Go back to /farmers_market/vendor/markets and open River Road's card.
    Expect: the second button still reads "Set Schedule" (NOT "Manage Schedule") and the amber note still asks
    you to apply first. (Saving a listing must NOT pick market days for the vendor at a market with a manager.)

 4. Tap "1 NEXT: Apply" → on the market's page tap "Apply to Sell Here", tick "I agree", pick any booth size,
    submit. Go back to /farmers_market/vendor/markets and open River Road's card.
    Expect: the note now reads "Your application is with the manager — you'll pick your days here once they
    approve you." The first button reads "Application sent" and NO button says NEXT.

 5. As the River Road MANAGER: dashboard → "Vendors at this market" → V4's pending row → leave the number blank →
    Approve. As V4: reopen River Road's card.
    Expect: the first button shows ✓ and reads "Apply"; the filled button is "2 NEXT: Set Schedule".

 6. As V4 (still no days picked): open /farmers_market/markets/[River Road id]/book.
    Expect: an amber box "First, pick the days you attend River Road Farmers Market" with the weekday toggles, and
    "Continue to payment" is disabled. Tick a day, tap "Done — continue to booking".
    Expect: the booking form unlocks. (A season option appears ONLY if River Road has a season on sale — if you
    see none, that is not a failure.)
    [visibility] As the MANAGER: directly under "Action Items", the amber card "Your market isn't visible to
    buyers yet"; its explanation includes "…and a paid booth week (your market charges for booths, so a vendor
    counts only once they've paid for a current or upcoming week)". River Road is NOT in the public list.

 7. As V4 on the book page: choose THIS week, tick the agreement, tap "Continue to payment". On the Stripe page,
    do NOT pay — use the browser's Back button.
    Expect: a yellow box "You stepped away from payment" saying no charge was made and the payment page stays open
    for up to 24 hours, with a "Continue payment" button. Tap "Continue payment".
    Expect: you are back on the SAME Stripe payment page (same amount). Use Back again.

 8. On the book page, choose the SAME week again and tap "Continue to payment".
    Expect: a red box "You already started booking this week and it is waiting for payment. Continue the payment
    below." with a "Continue payment" button under it (not a dead end).

 9. As V4: open /farmers_market/vendor/bookings.
    Expect: River Road's week shows the badge "Pending payment" and a "Continue payment" button. Tap it and pay
    with the test card.
    Expect: the booking confirmation shows a booth number.

10. After paying:
    a. As V4, River Road's card on /farmers_market/vendor/markets: steps 1–4 show ✓ and no button says NEXT.
    b. [visibility] As the MANAGER: the amber card under Action Items is gone; at the bottom of Setup, the green
       "✓ Your market is visible to buyers". River Road IS in the public list.
    c. As the MANAGER, "Vendors at this market" → V4's row: the size and number dropdowns look GREYED (grey
       background, and the pointer shows "not allowed"), with the line "Locked — paid week on file. The number
       changes only after a missed week, or if you cancel the paid week." under them.

11. Leftover from the 2026-09-25 run, at Market 2 Test: as V2, open /farmers_market/vendor/bookings. If V2's
    Market 2 Test week still reads "Pending payment", tap "Continue payment".
    Expect (that payment page is more than 24 hours old): "That payment page had expired, so the unpaid booking
    was released. You can book the week again now." and a "Book the week again" button. Tap it, book a SMALL week
    at Market 2 Test and pay.
    Expect (manager, Market 2 Test): the roster shows V2 with a small number; "Booth occupancy — this week" shows
    that number as "Paid this week" and the small size's "N of M occupied" count went up by one.
    (If V2's week no longer shows as pending, write down what it shows and skip to step 12.)

12. Market 2 Test, as the MANAGER, on the small size: give every remaining free small number to other approved
    vendors as HOLDS (roster → size small → number → Save) so that every small number is a placeholder (#1), paid,
    or held. Approve V5 to Market 2 Test on small with NO number (V5 applies first from the market's page).
    As V5: pick a day, book a small week and pay.
    Expect: V5's confirmation names the LOWEST held number — a hold yields to someone who books and pays. The
    roster now shows V5 with that number, and the vendor who HELD it has no number. That vendor's bell/email:
    "Booth #N at Market 2 Test is no longer held for you…". The MANAGER's own "paid for a booth" message ends
    "Booth #N was held for <name>; the hold moved to <V5> because <name> had no paid week and the other booths
    were taken. Re-pin <name> from the roster if…".

13. Seasons are tested on their own now — see W12 (it creates a fresh season, so it always runs).



==================================================
W3 — MANAGER CANCELS A MARKET DAY AND A PAID WEEK   (Market 2 Test · ~20 min)
===
YOU NEED: V1 has a PAID week (#16) at Market 2 Test with at least one weekday declared (done on 2026-09-25 —
ask the owner for V1's login). Market 2 Test manager login.

 1. As the MANAGER: "Communication & insights" → "Cancel a market day". Pick a FUTURE date that falls inside
    V1's paid week AND is a weekday V1 has declared. Cancel it.
    Expect: V1 receives (bell/email) "Market 2 Test is closed on <date>. Your paid booth week is credited
    $X for that day — applied automatically to your next booking at this market." where X = what V1 paid for the
    week divided by the number of market days V1 declared that week (e.g. paid $50, declared 2 of the 3 days →
    $25). In "Your next two weeks" that date's line is now struck through and reads "Cancelled" (with a make-up
    date if you gave one).

 2. Cancel the SAME date again.
    Expect: V1 does NOT get a second credit.

 3. As V1: book another week at Market 2 Test.
    Expect: at checkout the credit from step 1 is applied (the total is reduced by that amount).

 4. As the MANAGER: "Weekly booth bookings" → find a PAID row (V2's or V1's #16) → tap "Cancel this booking".
    Expect: a box asking for a reason appears; the Confirm button stays disabled until you type one. Type a
    reason and confirm.
    Expect: the row now shows Cancelled and a green line stating the credit — the FULL amount the vendor paid if
    the week hasn't started, or only the remaining declared days if the week is in progress. The vendor's
    bell/email: "The manager of Market 2 Test cancelled your booth #N for the week of <date>. … You have a
    $X credit…". Try "Cancel this booking" on a row that is part of a SEASON purchase (if one exists).
    Expect: refused with "This week is part of a season purchase. Season bookings settle at season end under the
    refund cap — cancel a market day instead, or settle the season." Finally, as the vendor, open
    /farmers_market/vendor/bookings.
    Expect: a PAID week has NO cancel button for the vendor (by design — vendors cannot cancel a paid week).



==================================================
W4 — FOOD-TRUCK PARK   (Sixth Street Food Park · ~30 min)
===
YOU NEED: the Sixth Street OPERATOR login (the park's setup checklist must be complete). Three truck accounts:
T1 (not yet approved at Sixth Street), T2 and T3 (both approved). Before you start: as T1, book any spot for
THIS week (a spot booking, unpaid is fine). As T2, request a recurring hold for SATURDAYS on Spot A
(/food_trucks/markets/[Sixth Street id] → the recurring-hold request) and leave it un-decided.

 1. As any truck: /food_trucks/vendor/edit → the section "Pickup Capacity".
    Expect: under the heading, a paragraph beginning "Your Pickup Capacity is the amount of app pre-orders the
    system will let you accept in any 30-minute time slot. Setting a limit helps prevent you from getting too
    many app orders that want to pick up at the same time as a line of walk-up clients…". Then, as a
    FARMERS-MARKET vendor, open /farmers_market/vendor/edit and the farmers-market vendor dashboard.
    Expect: the words "Pickup Capacity" appear NOWHERE for farmers-market vendors.

 2. As the OPERATOR: /food_trucks/market-manager/[Sixth Street id]/dashboard.
    Expect: the FIRST card is titled "Action Items" and shows two lines:
      "1 truck pending your approval — 1 has already booked this week." with a link "Review →"
      "1 recurring-hold request is waiting for your yes or no (Recurring holds tab)." with a link "Decide →"
    Both links scroll to the "Your trucks" area. Scroll to the bottom of the page.
    Expect: the LAST section is titled "Communication & insights".
    Now approve T1 (Your trucks) and APPROVE T2's Saturday hold (Recurring holds tab).
    Expect: the Action Items card now reads "Nothing needs you right now — truck approvals and recurring-hold
    requests show up here."

 3. As T2: /food_trucks/vendor/markets → "Your next two weeks".
    Expect: the approved Saturday hold appears on its Saturday even when that Saturday is MORE than 7 days
    away, with a note "Pay by <date> to keep your spot".

 4. As T3: /food_trucks/markets/[Sixth Street id]/book-spot.
    Expect: Spot A's card carries the text "Held on Saturdays — recurring truck". In the list of days, every
    Saturday is greyed and reads "— held by a recurring truck". In the "Prepay a week" option, any week that
    contains a Saturday is greyed with a note ending "is held by a recurring truck — pick another spot for this
    week". Near the day list: "Held days open to other trucks only if the recurring truck doesn't pay by the
    Thursday before." Now try to force it: pick a different spot, switch to week mode, select a week with a
    Saturday, then change the spot back to Spot A and submit.
    Expect: the server refuses with "Spot A is held by a recurring truck on Saturdays. It opens to other trucks
    only if they don't pay by the <date> cutoff — check back after that, or pick another spot."

 5. As T2 (the recurring truck): book Spot A on a Saturday yourself, before the app has created that week's
    booking for you.
    Expect: it works — the truck that holds the spot may book it early.

 6. As the OPERATOR: "Cancel a market day" (or the park's equivalent card) → choose a FUTURE date → cancel.
    Expect: the card says "Paid trucks are automatically credited — the credit applies to their next booking at
    this park (including a make-up date, if you add one)." and offers an OPTIONAL "Make-up date" field. There
    are NO radio buttons asking you to choose between credit and reschedule. After cancelling, a result line
    reads "Date cancelled. N buyer item(s) refunded · N vendor(s) notified of cancelled orders · N truck(s)
    credited …" with real numbers.

 7. (Optional, later) Wait until T2's Saturday booking has expired unpaid (T2 didn't pay by the Thursday
    before). As T3, book that Saturday on Spot A.
    Expect: it is allowed now.



==================================================
W5 — VENDOR SETS UP LISTINGS AND MARKETS   (~30 min)
===
YOU NEED: a FREE-tier farmers-market vendor who is already at 3 traditional markets; a farmers-market vendor and
a food-truck vendor who each have the box "I can staff more than one location at the same time" UNTICKED on
/[vertical]/vendor/edit; a farmers-market vendor with a booth NUMBER held at Amarillo (the Amarillo roster shows
it); a food-truck listing set to allow same-day ordering ("0 days advance"); a buyer.

 1. As the 3-market vendor: /farmers_market/vendor/listings/[any listing id]/edit → the market list.
    Expect: the grey box above the list reads "Your plan allows 3 unique traditional markets across ALL your
    listings (currently using 3 of 3: <the three market names>)." — and each of those three markets carries a
    small grey "· counted" after its name.
    a. Tick a market that shows "· counted" and save.
       Expect: it saves with no error and the box still says 3 of 3 (that market was already counted through
       another listing, so it uses no new slot).
    b. Try to tick a market WITHOUT "· counted".
       Expect: it cannot be ticked (it looks faded), because a fourth market would go over the plan.

 2. As the farmers-market vendor with the box UNTICKED: /farmers_market/vendor/markets → open a SECOND market that
    meets on the same weekday and overlapping hours as one you already attend → "Set Schedule" → tick that day.
    Expect: refused, with a message that names the market you are already at during that time. Tick the box
    on /farmers_market/vendor/edit, save, try again.
    Expect: it succeeds. Repeat once as the food-truck vendor on /food_trucks/…

 3. Two places at once, already on the books — as a farmers-market vendor who has the SAME day and time picked at
    two markets (the owner can name one; farmersmarketingapp+cottagevendor1 had Amarillo and River Road on
    Saturdays on 2026-09-25):
    a. /farmers_market/vendor/edit with the box "I can staff more than one location at the same time" UNTICKED.
       Expect: an amber note under the box, "With this box off, you're scheduled in two places at the same
       time:" listing both markets with their times and the day, and a link "Change your days on your Markets
       page →".
    b. Open /farmers_market/markets/[one of those two markets' id]/book.
       Expect: under the form, a line beginning "You're also scheduled at "<the other market>" on <day>s from
       <time>… You can't be at both." and the "Continue to payment" button is disabled.
    c. Remove that day at ONE of the two markets (Markets page → the market → Manage Schedule), then reload both
       pages.
       Expect: the amber note is gone and the booking page lets you continue.

 4. As the vendor with a booth NUMBER held at Amarillo: open /farmers_market/markets/[Amarillo id]/book, choose a
    week, tick the agreement, "Continue to payment" — then leave the Stripe page with the browser's Back button.
    Choose the SAME week again and tap "Continue to payment".
    Expect: a red box "You already started booking this week and it is waiting for payment. Continue the payment
    below." with a "Continue payment" button — NOT "Your assigned booth is already booked for that week…".
    Tap "Continue payment" — you are back on the same Stripe page.

 5. As a BUYER: open the same-day food-truck listing (/food_trucks/listing/[id]) on a day the truck is NOT
    operating.
    Expect: the availability text reads "Orders Open on Operating Days". Hover the availability badge.
    Expect: the tooltip does not mention preparation time.

 6. As a BUYER: place an order with any vendor, then cancel it BEFORE the vendor confirms it. As that VENDOR:
    /[vertical]/vendor/orders.
    Expect: the count card at the top labelled cancelled includes this order, and the number matches how many
    cancelled/refunded orders appear in the list below.



==================================================
W6 — PLATFORM ADMIN LOOKS UP A VENDOR — what is left   (platform admin login · ~5 min)
===
Passed 2026-09-25 and removed: the Free/Pro/Boss tier filter; Valley Verde Farm's listing count agreeing on the list
and the details page; the Markets card; the farmers-market Event Readiness read-out and the food-truck one.
YOU NEED (ask the owner): a vendor who sells MARKET BOXES (at least one active box offering), and a farmers-market
vendor who answered "Yes" to event experience and typed something in "Anything Else About Your Event
Capabilities?" on /farmers_market/vendor/edit → "Private Events Readiness".

 1. /farmers_market/admin/vendors → find the vendor who sells market boxes.
    Expect: the row shows "📦 N published" AND "🧺 N boxes" (the box count appears only for vendors who have
    active boxes — a vendor with none shows no 🧺). Write down the box number.
    Open that vendor → Details → "Quick Stats".
    Expect: "Active market boxes" shows the SAME box number as the list. (For a vendor with no boxes this line
    reads 0 — that is correct.)

 2. Open the farmers-market vendor from "YOU NEED" → Details → the card "Event Readiness Application".
    Expect: besides the questions checked last time, the card also shows "Do You Have Event or Catering
    Experience?" reading "Yes — <what they typed>", and "Anything Else About Your Event Capabilities?" with the
    text they typed. (A vendor who left "Anything Else" empty shows no line for it — that is correct.)



==================================================
W7 — EVENTS: ONE FRESH SELF-SERVICE EVENT, START TO SHOP   (~45 min)
===
BACKGROUND: an organizer requests a private event; the app invites suitable vendors; vendors ACCEPT with a menu;
the organizer then SELECTS which accepted vendors are in (the rest are backups). Only SELECTED vendors appear
to attendees or can take pre-orders. "Accepted" is not "selected".
YOU NEED: an organizer account; four vendor accounts A, B, C (accept right away) and D (accepts LATE, at step
3); a FREE self-service event (no vendor fee). One of A/B/C must have the multi-location box UNTICKED (step 9).
Run steps 1–8 in order on the same event.

 1. Create the event and have A, B and C accept. Before selecting anyone, open the PUBLIC event page
    /[vertical]/events/[token] and the SHOP /[vertical]/events/[token]/shop, and one of A's items
    /[vertical]/listing/[id].
    Expect: the public page's status reads "Upcoming Event" and it says "Vendors Are Still Responding" with NO
    vendors listed. The shop shows no menus. A's item page offers no pickup date for the event.

 2. Open the SELECT page /[vertical]/events/[token]/select → select A and B (not C) → remove one item from A's
    menu → confirm.
    Expect: the public page now reads "2 Vendors Attending" and shows only A's and B's menus (A's without the
    removed item). The shop sells A's and B's items, not C's. C's items at C's REGULAR market can still be
    ordered the whole time.

 3. Have D accept now. Reload the public page and the shop.
    Expect: D appears NOWHERE until you select D.

 4. Select page → "Change selections".
    Expect: A and B are pre-ticked and each shows "Menu set when you selected this vendor." with NO menu-trimming
    controls; D DOES have trimming controls; C (not selected) shows a note that backup vendors bring their full
    menu. Select D, remove one of D's items, confirm.
    Expect: D's own event page (/[vertical]/vendor/events/[event market id]) shows "approved N of M" items,
    and the removed item is not in the shop. "Change selections" once more → D is now locked too.

 5. "Change selections" → untick B → confirm the removal → reload the page → "Change selections" again.
    Expect: B is NOT listed under "Your vendors are confirmed" and is NOT pre-ticked. Select B again on purpose.
    Expect: B receives a NEW "you're selected" notification.

 6. On the confirmed view of the select page, find the backup box (it appears when fewer vendors are on standby
    than recommended; it starts "Short on options?"). Follow its instruction: organizer dashboard → Event
    Details → widen the vendor types / preferences / number of vendors → Save → tap "Refresh matches".
    Expect: after saving, a "Refresh matches" prompt appears; tapping it reports new invitations sent, or that
    no new vendors qualified.

 7. /farmers_market/event-manager/[event id]/dashboard → Event Details; compare with a food_trucks event.
    Expect (farmers market): the labels read "Product Preferences", "Total Budget", "Budget Per Person",
    "Expected Number of Buyers", "Dietary or Product Requirements", "Other Food or Products at Venue", "Other
    Vendors Present?", the event type "Corporate / Workplace Event", and the examples mention produce / baked
    goods / crafts. Food trucks: the food-truck wording as before.

 8. /[vertical]/browse — find one of A's event-selected listings — compare with its detail page
    /[vertical]/listing/[id].
    Expect: the same Open/Closed pill on both pages.

 9. As the vendor with the multi-location box UNTICKED (and accepted to this event): try to book a park spot
    or booth for the EVENT's date at another location.
    Expect: refused, with a message telling you to withdraw from the event first.

10. Side checks (any event that fits):
    a. /[vertical]/admin/events → a self-service APPROVED event whose invitations have NOT been sent.
       Expect: the button "Open Pre-Orders — invitations held" is DISABLED with a tooltip; the Inviting card says
       invitations are held.
    b. (Optional) Force the event to "ready" while invitations are held.
       Expect: the organizer's progress view says nothing is orderable — it does not say "pre-order now".
    c. Have a selected vendor withdraw → open /[vertical]/reconfirm/[token] as an attendee with an order.
       Expect: the page reflects what is still live: all items cancelled → withdrawal wording; some → partial;
       everything live → the order "stands".
    d. Sign up a brand-new vendor, leave them UNAPPROVED, have them submit "Private Events Readiness" →
       /[vertical]/admin/events.
       Expect: that vendor carries a grey badge "not eligible — vendor not yet approved".
    e. On an event with a vendor fee: the fee card's "reuse" buttons.
       Expect: outlined buttons, only as wide as their text, placed over the yellow box — side by side on a
       desktop, stacked on a phone.
    f. On an invitation-accept form, enter a number of orders LOWER than your profile's default.
       Expect: an amber advisory note appears below the field.



==================================================
W8 — MARKET BUNDLES: THREE FRESH ORDERS   (~30 min + a 1-hour wait)
===
BACKGROUND: a "bundle" is a set of items from several vendors that the MARKET MANAGER assembles. The buyer
pays once; each vendor prepares their item; the manager collects the items from the vendors, assembles the
bundle, and hands it to the buyer. The manager works from a "run sheet" inside the dashboard card
"Curated bundles" (Money & activity section).
YOU NEED: a market with an active bundle; a buyer; logins for the bundle's vendors; the manager.

 1. As the BUYER on a PHONE: /[vertical]/markets/[id] → scroll to "Market Bundles".
    Expect: nothing spills past the edge of the card or the screen; long text wraps; the name/price row wraps
    if it must. Take a screenshot either way.

 2. Buy the bundle (order 1). Then, as each VENDOR, mark your item Ready. As the MANAGER, open the run sheet;
    for each vendor tap "🤝 Receiving now", and have that vendor tap Fulfill within 30 seconds. When all items
    are collected tap "Ready — notify buyer". When the buyer collects, tap "Mark handed off". As the BUYER, open
    the ORDER DETAIL page (/[vertical]/buyer/orders/[id]) and tap the yellow acknowledge button.
    Expect: the buyer receives NO notification when vendors confirm or fulfil; a vendor who taps Fulfill BEFORE
    the manager's "Receiving now" sees "Wait for the market manager to tap Receiving now, then tap Fulfill within
    30 seconds." and nothing changes; after "Ready — notify buyer" the buyer gets exactly ONE "ready" notice;
    the buyer's order detail shows ONLY the yellow bundle acknowledge (no green per-item acknowledge buttons);
    the buyer's orders list shows no "confirm you received it" banner; no review pop-up after acknowledging;
    the "order placed" email names the bundle, the market and the pickup spot.

 3. The BUYER's inbox after "Ready — notify buyer".
    Expect: exactly ONE email, naming the bundle and the market, with the pickup spot. (Emails the MANAGER
    receives about vendors being ready are the manager's, not the buyer's.)

 4. Order 2: buy a fresh bundle; within 60 minutes open /[vertical]/buyer/orders/[id] → "Cancel bundle".
    Expect: a full refund, to the cent, shown on the page and visible in Stripe.

 5. Order 3: buy a fresh bundle; have ONE vendor confirm their item; wait until more than an hour has passed
    since the order; cancel it.
    Expect: the cancel dialog warns "Cancelling after the first hour or once a vendor has confirmed incurs a 25%
    cancellation fee." The refund is 75% of the item + margin total, and the tip is refunded in full.



==================================================
W9 — MARKET BOXES: WHAT IS LEFT   (~15 min)
===
Passed 2026-09-26 and removed: the market box on the vendor's "Your next two weeks" strip (right market, right
day); "Order #FA-" beside each week on the Subscribers and Pickups tabs.
BACKGROUND: a "market box" is a subscription a vendor sells — the buyer pays for N pickups of a box.
YOU NEED: a vendor with a market-box offering whose next pickup date is within 7 days (CHECK FIRST: if the next
pickup is further away than 7 days, step 1's "Expect" is the "Nothing to prep" line instead); a buyer who has
bought that box.

 1. As the VENDOR: the vendor dashboard → the tile "My Upcoming Pickups".
    Expect: one line per pickup day and location, soonest first, each starting with the day in bold —
    "Today", "Tomorrow", or a date like "Wed, Oct 1" — then the market, then what is due, e.g.
    "Wed, Oct 1 · Amarillo Community Market · 1 market box" (listings read "N items"). At most three lines, then
    "+N more pickup days in the next 7 days" if there are more.
    If nothing is due in the next 7 days, the tile reads "Nothing to prep in the next 7 days — prep lists, pick
    tickets & order details show up here for each pickup day."
    Also check once in the EVENING (after 7 PM Central): a pickup due today still reads "Today" (not missing,
    and not shown as tomorrow's).

 2. As the VENDOR: /[vertical]/vendor/market-boxes/[offering id].
    Expect: the tabs read "Overview", "Subscribers (N)" and "Manage Pickups (N upcoming)". Open "Manage Pickups"
    — this is where a box is marked ready and a pickup is completed.

 3. Complete pickup 1: the buyer confirms receipt, the vendor confirms within 30 seconds (on "Manage Pickups").
    Then open, as the buyer, /[vertical]/buyer/subscriptions/[id] and /[vertical]/buyer/orders.
    Expect: BOTH pages show the same progress — 1 of N pickups completed.



==================================================
W10 — SURVEY EMAIL   (~2 min)
===
 1. Trigger a survey email from staging (manager dashboard → Communication & insights → Survey results, or wait
    for the weekly one).
    Expect: every link in the email points at the STAGING site (the address at the top of this document), not
    at farmersmarketing.app.



==================================================
W11 — PLATFORM ADMIN: SALES-TAX READINESS   (platform admin login · Amarillo Community Market · ~10 min)
===
Background for this workflow: sales tax is NOT live yet. What you are testing is the admin's preparation
tools — the list that shows which markets still need Texas tax codes, and the card where the codes are entered.
No buyer is charged anything in this workflow. Use the codes ALREADY on the card — do not add or remove
jurisdiction rows. If the card shows only the TEXAS row and nothing else, STOP and tell the owner before saving
(saving would mark the market ready with state tax only).

 1. /farmers_market/admin/markets → the dropdown right after "All Types" (it starts as "Tax codes: any").
    Expect: the choices are exactly: "Tax codes: any", "Tax: needs attention", "Tax: no codes entered",
    "Tax: address changed, re-verify", "Tax: rate quarter stale", "Tax: ready". Choose "Tax: needs attention".
    Expect: every row listed carries a small chip reading one of "tax: no codes", "tax: re-verify",
    "tax: stale quarter". Now choose "Tax: ready".
    Expect: no row shown carries any "tax:" chip. Set it back to "Tax codes: any".

 2. Open Amarillo Community Market (tap the row) → find the card "Sales tax jurisdictions".
    Expect: a box labelled "Rate version" whose grey placeholder is the current quarter written like "2026-Q3"
    (year, dash, Q, quarter number). Clear the box so it is EMPTY, leave everything else, tap Save.
    Expect: "Saved", and the Rate version box now reads the current quarter (same text as the placeholder was).

 3. Same card → type   Sept rates   in the Rate version box → Save.
    Expect: the save is REFUSED and the message begins "Rate version must look like" and names the current
    quarter. Nothing else on the card changed.

 4. Same card → type LAST quarter in the box (if the current quarter is 2026-Q3, type 2026-Q2) → Save.
    Expect: "Saved", AND a warning line appears that begins with "Rate version" and contains
    "is not the current quarter". Go back to the markets list.
    Expect: Amarillo's row now carries the chip "tax: stale quarter". Open the card again, put the current
    quarter back, Save.
    Expect: the chip is gone from Amarillo's row.

 5. /admin/reports (the PLATFORM admin page — the Accounting group is not shown on /farmers_market/admin/reports)
    → the "Accounting" group → tick "Texas List Supplement (Form 01-116)" →
    any date range → Download.
    Expect: a CSV file downloads. Its first line is the header
    "Local Code (Form 01-116 col 2)","Jurisdiction","Level","Rate %","Sales Base","Sales Tax Collected","Refunded Base",
    "Tax Refunded","Rate Correction (owed on old-rate sales; platform pays)","Amount Subject to Tax (net)",
    "Tax Due (net)","Taxed Items","Reversal Rows","Rate Version(s) in Period". Below it: a TOTAL row showing $0.00,
    and a last row starting PERIOD that names the dates you picked "…America/Chicago (Central)". Totals are $0.00 because no
    tax has been collected yet. (An empty file or an error message IS a finding.)

 6. Log in as a VENDOR (Valley Verde Farm) → /farmers_market/vendor/listings/new → choose category "Prepared Foods"
    (the sales-tax box locks to "Sales tax applies to this item") → under "Available at", tick Amarillo Community
    Market (which has no tax codes yet).
    Expect: an amber note appears right under the market list beginning "Heads up — sales tax setup is pending at
    one of these locations." and it names Amarillo Community Market. Now change the category to "Produce" (the box
    flips to "This item is exempt from sales tax").
    Expect: the amber note is gone. (Nothing is saved in this step — leave the form.)

 7. Still as the vendor: put the category back to "Prepared Foods" (taxable), keep Amarillo Community Market ticked,
    fill the required fields (title, price, quantity) and Save.
    Expect: the listing saves normally (no error). Now log in as the PLATFORM ADMIN → the bell / notifications.
    Expect: a notification titled "Tax codes needed at Amarillo Community Market — a vendor is waiting". Tap it.
    Expect: you land on the markets admin page with Amarillo's edit form open. Save the vendor's listing a second
    time within the hour.
    Expect: NO second notification (one per market per day).



==================================================
W12 — SEASONS: CREATE ONE, OPEN PRE-SALE, TWO VENDORS BUY IT   (Market 2 Test · ~30 min)
===
BACKGROUND: a "season" lets a vendor pay once for a booth for every market week of a date range. The manager
creates the season and opens "pre-sales"; pre-sales can open at most 60 days before the season starts and close by
themselves 14 days after it starts.
YOU NEED (ask the owner): the Market 2 Test MANAGER login · the Westgate Mall Farmers Market (capital "Mall")
MANAGER login, for step 1 only (look, do not change anything there) · two vendors APPROVED at Market 2 Test who
have at least one day picked there: VA whose roster row shows a booth NUMBER, and VB whose roster row shows NO
number · the test card 4242 4242 4242 4242.

 1. As the Westgate Mall MANAGER: dashboard → open "Setup" → the card "Season pre-sales".
    Expect: the season "summer 2 test" shows a grey pill "Pre-sales closed" and, in its details line,
    "· pre-sales closed Aug 16". It shows NO "Close pre-sales" button and NO "Open pre-sales" button.
    (Its pre-sale window ended on Aug 16; before this fix the card still said "Pre-sales open".)

 2. As the Market 2 Test MANAGER: dashboard → open "Setup" → "Season pre-sales" → the form at the bottom.
    Type a name (e.g. "W12 test season"), Start = the NEXT Sunday, End = about six weeks later, leave the make-up
    buffer at 0, tap "Create season".
    Expect: either the season is created, or a tick box appears "I confirm my market schedule (operating days &
    times) is accurate — the season's market-day count is derived from it." — tick it and tap "Create season"
    again. The new season appears in the list with its dates and "N market days".
    If a yellow warning about the dates not matching the admin's season appears on the new season, tick "I
    understand the season dates don't match…" under it (needed before step 3).

 3. On the new season, tap "Open pre-sales".
    Expect: the pill turns to "Pre-sales open" with "· closes <date>" = 14 days after your Start date.

 4. As VA: open /farmers_market/markets/[Market 2 Test id]/book.
    Expect: below the weekly booking form, a section "Reserve a whole season". Pick your season, pick VA's booth
    size, tick "I accept the market agreement and the season cancellation policy above.", tap
    "Reserve season — $…" and pay with the test card.
    Expect: after paying you land on /farmers_market/vendor/bookings with no error.

 5. As VB: the same, with any booth size. Pay.

 6. As the Market 2 Test MANAGER: "Weekly booth bookings" → use the → arrow to step through the season's weeks.
    Expect: VA appears in EVERY season week with the SAME booth number VA's roster row showed before step 4; VB
    appears in every season week with ONE number that stays the same every week. As VA and as VB,
    /farmers_market/vendor/bookings lists the purchase under "Season bookings" as "Season · N weeks · <dates> ·
    <size>" with the badge "Paid".
    If a purchase is refused, write down the exact message — especially one saying a season keeps one booth for
    the whole season.

 7. Clean up so the next tester starts fresh: as the MANAGER, on the new season tap "Close pre-sales".
    Expect: the pill no longer says "Pre-sales open".



==================================================
NOT RUNNABLE YET — nothing for you to do
===
• Event money on cancellation / de-selection — needs an event with a PAID vendor fee on staging.
• "Protocol v6 remainder" (buyer items + weekly survey · onboarding copy · manager new-email invite and resend ·
  farmers-market mirror · print chrome) — steps still being rewritten.
• The sales-tax rate-refresh job (runs on a schedule on production only; the owner triggers it on staging by hand).
• Two production-only checks (stock decrement at checkout; payout timing) — wait for a real vendor with Stripe
  on production.





============================================================================================================
APPENDIX — FOR CLAUDE'S BOOKKEEPING ONLY. Testers: stop reading here.
============================================================================================================
Registry rows satisfied by each step (a step may cover several rows; a row may span steps):
W1  (v3.1, retests) 1→TR-105 · 2→TR-101 · 3→TR-101 TR-108 TR-120 · 4→TR-108 TR-120 · 5→TR-120 · 6→TR-124   (old step 2 = TR-121 PASSED 2026-09-25, OB-031)
W2  (v3, fresh vendor at River Road) 1→TR-119 · 2→TR-083 · 3→TR-117 · 4→TR-119 TR-084 · 5→TR-119 TR-085 · 6→TR-087 TR-121 TR-075
    · 7→TR-118 · 8→TR-118 · 9→TR-118 TR-078 · 10→TR-119 TR-121 TR-075 TR-089 · 11→TR-118 TR-088(part 1) TR-082 · 12→TR-088(part 2)
    · 13→(see W12)   (v2 steps that PASSED 2026-09-25 were removed — see TEST_REGISTRY OB-030 rows)
W3  1→TR-091 TR-099 · 2→TR-091 · 3→TR-091 · 4→TR-092 (button now "Cancel this booking", OB-030 (e))
W12 1→TR-122 · 2→TR-079 (setup) · 3→TR-122 TR-079 · 4→TR-079 · 5→TR-079 · 6→TR-079 · 7→TR-122   (W2 v3 step 13 now points here)
W4  1→TR-034 · 2→TR-107 · 3→TR-043 · 4→TR-109 · 5→TR-109 · 6→TR-040 · 7→TR-109
W5  (v3.1) 1→TR-069 · 2→TR-044 · 3→TR-044 · 4→TR-123 · 5→TR-042 · 6→TR-048
W6  (v3.2) 1→TR-096 (boxes half) · 2→TR-094 (two FM questions)   (v3.1 steps 1–5 PASSED 2026-09-25, OB-032: TR-093 TR-095 pass)
W7  1→TR-022 TR-064 · 2→TR-022 TR-064 · 3→TR-022 · 4→TR-065 · 5→TR-066 · 6→TR-067 · 7→TR-068 · 8→TR-026
    · 9→TR-025 · 10a→TR-023 · 10b→TR-024 · 10c→TR-030 · 10d→TR-032 · 10e→TR-033 · 10f→TR-035
W8  1→TR-010 · 2→TR-001 · 3→TR-005 · 4→TR-002 · 5→TR-003
W9  (v3.3) 1→TR-015 (dashboard tile) TR-125 · 2→TR-125 · 3→TR-014   (v3.2 strip + "Order #FA-" PASSED 2026-09-26, OB-033)
W10 1→TR-041
W11 1→TR-112 · 2→TR-110 · 3→TR-110 · 4→TR-110 TR-112 · 5→TR-113 · 6→TR-114 · 7→TR-115   (TR-111 = W11.4-style address change, not scripted: needs an address edit)
Passed already (removed): TR-100. Not runnable: TR-028 TR-029 TR-031 TR-060 TR-062.
Wording quoted from code 2026-09-22 (BoothNumberingHelp, ManagerActionSummary, BoothNumberPicker, VendorBoothList,
BoothOccupancyGrid, WeeklyBookingsList, week-sheet page, notifications/types.ts 889/1026-1035/1002/1194/1054,
schedules route :81, ApplyToMarketButton, DeclareDaysGate, BookBoothForm :329-344, MarketVisibilityCard :40-79,
PickupCapacityForm :111, week-strip.ts :183, BookParkSpotForm :625/858/865/917, MarketCancelDateCard :133/162,
listings/[listingId]/markets route :198, en.ts :855, VendorDetailAdminPage :316/335, fulfill route :511,
CuratedBundlesCard :480-496, select page :595, events page :198/346, EventsAdminPage :993). Steps whose exact
words were NOT pulled from code are phrased as meaning, not quotation: W2.4 docs page, W4.6 result-line
numbers, W5.2 conflict message, W7.4 backup note, W7.6 prompt text, W9.3 progress phrase.
