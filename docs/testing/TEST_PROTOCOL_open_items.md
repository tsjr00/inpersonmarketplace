STAGING TEST WORKFLOWS — SELF-CONTAINED EDITION
Version 2 · 2026-09-22 · written for a tester who has ONLY this document and the app.
Nothing in here refers to any other document. If a step tells you to expect words on the screen, those are the
words the app is supposed to show. If the screen shows something different, that difference IS your finding.

Staging site: https://inpersonmarketplace-git-staging-tsjr00s-projects.vercel.app
The site has two "verticals" that share one code base: farmers_market and food_trucks. Web addresses below
start with one of those two words. Where you see [id], use the id from the page's own web address (for a
market, it is the long code after /market-manager/ or /markets/ in the address bar).

Before every session: hard-refresh the page (Ctrl+F5 on Windows, Cmd+Shift+R on Mac) so you get the newest build.


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
                              Bakery, #11 Valley Verde Farm · placeholder #1 "Market Manager Booth"        → W1
Market 2 Test                 farmers market · charges · sizes "small" 1–5 ($25/wk), "medium" 6–15 ($35/wk),
                              "large" 16–20 ($50/wk) · hold #7 Hill Country Herbals (medium) · placeholder #1
                              "Check-in / market manager booth" (small)                                     → W2, W3
Westgate mall Farmers Market  (lowercase "mall") · charges · "Small" 1–10, "Large" 11–15 · placeholders #1, #15  → spare
River Road Farmers Market     charges · "Small Tent" 4–13, "Medium Tent" 14–23, "Large Tent" numbered 1, Booth 2, 3,
                              24, 25 (an odd list on purpose)                                                → spare
Westgate Mall Farmers Market  (capital "Mall") · already fully tested — do not use
Space Camp Musicians Market   lettered numbers A1–A5, B1–B10, C1–C20                                        → spare
Sixth Street Food Park        food trucks — spots, not booths                                               → W4


==================================================
THE WORKFLOWS
===
  W1  Manager runs a charging market's dashboard, holds, roster and week sheet     Amarillo · ~40 min
  W2  Vendor applies, is approved, books and pays a week                            Market 2 Test · ~60 min
  W3  Manager cancels a market day and a paid week — credits and notices            Market 2 Test, after W2 · ~20 min
  W4  Food-truck park: operator to-dos, recurring holds, cancel a date              Sixth Street · ~30 min
  W5  Vendor sets up listings and markets — limits, double-booking, wording         ~25 min
  W6  Platform admin looks up a vendor                                              ~5 min
  W7  Events — one fresh self-service event, start to shop                          ~45 min
  W8  Market bundles — three fresh orders                                           ~30 min + a 1-hour wait
  W9  Market boxes — one purchase                                                   ~15 min
  W10 Survey email                                                                  ~2 min
  W11 Platform admin: sales-tax readiness — filter, tax card, Form 01-116 report      Amarillo · ~10 min



==================================================
W1 — MANAGER RUNS A CHARGING MARKET   (Amarillo Community Market · manager login · ~40 min)
===
BEFORE YOU START: log in as any test VENDOR who is NOT yet at Amarillo, open
/farmers_market/markets/[Amarillo id], tap "Apply to Sell Here", tick "I agree", pick any booth size, submit.
That gives the manager one pending application to work with. Then log in as the Amarillo MANAGER.
All steps happen on /farmers_market/market-manager/[Amarillo id]/dashboard unless a step says otherwise.

 1. Read the dashboard top to bottom.
    Expect, in this order: a card titled "Action Items" · a collapsible section "Setup" · a section heading
    "Booths & occupancy" containing these cards in this order: "Booth occupancy — this week", "Weekly booth
    bookings", "Booth inventory", "Off-platform booth placeholders", "Booth map" · a section "Vendors" containing
    "Vendor attendance" and "Vendors at this market" (the latter has two tabs, Roster and Invite) · a section
    "Money & activity" containing "Your booth revenue", "Market activity", "Curated bundles" · a section
    "Communication & insights" containing "Send an announcement", "Survey results", "Cancel a market day",
    "Need help?". Near the top, a row of small "chips" (buttons) reading Setup · Booths & occupancy · Vendors ·
    Money & activity · Communication — tapping each one scrolls the page to that section.

 2. Directly under the market's name and address, above the chips: a block titled "Your next two weeks".
    Expect one line per upcoming market day (next 14 days) — a date, the hours, and counts like
    "3 vendors declared · 2 paid booth weeks (1 booked, unpaid) · 4 orders scheduled". Today's line looks
    highlighted. Pick ONE line and check its numbers against the pages that own them: "declared" = how many
    vendors on the roster have that weekday ticked; "paid booth weeks" = the paid rows in "Weekly booth bookings"
    for that week; "orders" = orders placed for pickup that day. Report if a number is wrong.

 3. The "Action Items" card.
    Expect: a line "1 vendor pending your approval." followed by a link "Review →". Tapping "Review →" scrolls to
    the "Vendors at this market" CARD (not just to the "Vendors" heading). There must be NO line about vendors
    needing a booth number (this market charges, so vendors get their number when they book). There must be NO
    "Next market day" line. Other lines MAY appear, and each one's link must scroll to the right place:
      "<size name> has no booth numbers yet…"                    → link "Set numbers →" → Setup section
      "N held or placeholder numbers have no size…"             → link "Re-pick →"     → Vendors at this market
      "<size name> is over capacity this week…"                 → link "Fix →"         → Booths & occupancy
      "Stripe needs more information before it can pay you…"    → link "Finish →"      → Setup section
      "N season vendors are owed a settlement…"                 → link "Settle →"      → a Seasons card in Setup

 4. Collapse the "Setup" section (tap its header). Now tap the "Setup" chip at the top.
    Expect: the page scrolls to Setup and Setup OPENS by itself. (If any Action Item link pointed into Setup in
    step 3, tap that too — same expectation: Setup opens and the page lands on the named card.)

 5. Scroll to the "Vendors" section.
    Expect: the word "Vendors" is a SECTION heading with a colored bar on its left edge. Below it, "Vendors at
    this market" is a plain bold CARD title with no colored bar. On the Roster tab, approved vendors who have
    not paid for any week show, in amber, "· no paid week yet" (hover over it: a tooltip beginning "Assigning a
    booth number reserves the spot…"). NOWHERE on this roster is there a chip reading "Needs booth #".

 6. Same card, Roster tab — the pending application's row (the vendor you applied with).
    Expect: if you picked a size when applying, the row says "Requested: <that size>". Beside the Approve
    button: a SIZE dropdown (pre-set to the requested size), then a NUMBER dropdown, a small "N free" count, and
    a text box "Note to vendor (optional)". Open the number dropdown.
    Expect: the numbers of that size listed; taken numbers are greyed out and say who holds them, e.g.
    "5 — held: Sunrise Organic Farm" or "1 — off-platform: Market Manager Booth". There is NO box where you can
    TYPE a number anywhere. Pick a free number, type a note, tap Approve.
    Expect: the row now shows that number and size. (If you can check the vendor's account: their notifications
    bell and email say "Your booth: #N · <size> size." and include your note.)

 7. Same card — the row for Texas Honey Co. (currently #7).
    a. Open the number dropdown, choose 10, tap Save.
       Expect: the row shows #10. The vendor is told "Your booth at Amarillo Community Market is now #10
       (was #7)…" (check their bell/email if you can).
    b. Open the dropdown again, choose the top option "— no booth # —", tap Save.
       Expect: the row shows no number. The vendor is told "Booth #10 at Amarillo Community Market is no longer
       held for you…".
    c. Put #7 back and Save.
       Expect: the row shows #7 again (the vendor gets a third "is now #7" message).
    d. On some OTHER vendor's row, change ONLY the size dropdown (leave the number), Save.
       Expect: it saves and NO message goes to that vendor (a size-only change is silent).

 8. Same card — the row for Lone Star Succulents (#8). Tap "Revoke" and confirm.
    Expect: the row shows no booth number and no size. Now open another vendor's number dropdown.
    Expect: #8 is offered as free; pick it and Save — it saves. (Lone Star can be re-invited afterwards if you
    want them back; not required.)

 9. The card "Booth occupancy — this week".
    Expect: under "10x10", ONE tile per number 1 through 10: #1 reads "Off platform" with "Market Manager
    Booth"; the numbers with holds read "Held (not paid)" with the vendor's name; every other number is a dashed
    tile reading "#N · free". Under "10x15", tiles 11 through 20 with #11 "Held (not paid)". Each size has a
    line "N of M occupied · K open" — this counts PAID bookings and placeholders only, NOT holds. So with no
    paid weeks it should read "1 of 10 occupied" for 10x10 (the placeholder) and "0 of 10 occupied" for 10x15.

10. The card "Off-platform booth placeholders". Tap Add.
    Expect: a SIZE dropdown, then a NUMBER dropdown — no text box for the number; taken numbers greyed with the
    holder's name. Choose 10x15 and number 20, type a note "test placeholder", save.
    Expect: it appears in the list. Tap Edit on it.
    Expect: the same two dropdowns. Cancel. Tap Delete on it and confirm.
    Expect: it disappears.

11. Read the small explanatory paragraph on each of these FOUR cards: "Booth inventory" (inside Setup),
    "Vendors at this market", "Off-platform booth placeholders", "Weekly booth bookings".
    Expect: the SAME paragraph on all four. It begins in bold "How booth numbers work here." and continues
    "Every booth has a number and a size — 10x10 1–10 · 10x15 11–20. When a vendor books, they get their held
    number if you gave them one, otherwise the lowest free number in the size they booked. Paying for a week
    makes that number theirs until they miss a week. You hold a number for a vendor from the roster; you record
    booths rented off the platform as placeholders; both take that number out of circulation. Numbers only
    change for unpaid weeks, or if you cancel a paid week." No card explains booth numbers in a different way.

12. The card "Weekly booth bookings" — in its week header, tap "🖨 Print this week's sheet".
    Expect: a new tab opens with a plain page titled "Amarillo Community Market — week sheet". A table with
    columns: Booth # · Vendor · Size · Status · one column per market day that week · "Checked in" (empty, for a
    pen). One row per booth in use: the holds (Status "Held · no booking this week"), the placeholder (Status
    "Off-platform"), any paid or unpaid bookings (Status "Paid" or "Booked · NOT paid"). A ✓ appears under a
    market day the vendor has declared. Links "← Previous week" / "Next week →" change the week. Tap the Print
    button.
    Expect: the browser's print preview shows just the table (no links or buttons). Tap "← Back to the
    dashboard".
    Expect: you land on the dashboard at the "Weekly booth bookings" card.



==================================================
W2 — VENDOR APPLIES, IS APPROVED, BOOKS AND PAYS A WEEK   (Market 2 Test · ~60 min)
===
YOU NEED: two vendor accounts with NO history at Market 2 Test — call them V1 and V2 — each with at least one
published listing (an item for sale). The Market 2 Test MANAGER account. A test card (4242 4242 4242 4242, any
future date, any CVC). Optional for step 17: a third vendor V3 and two or three more approved vendors.
Market 2 Test charges: small $25/week, medium $35/week, large $50/week.

 1. As V1: open /farmers_market/vendor/markets. Find Market 2 Test and open its day picker (the weekday
    toggles). Tick a day.
    Expect: it is refused with a RED message: "Market 2 Test reviews vendor applications. Apply from the
    market's page — the manager will be notified and you'll be able to set your schedule once approved." There
    is no agreement text inside the day picker.

 2. As V1: open /farmers_market/markets/[Market 2 Test id]. Tap "Apply to Sell Here".
    Expect: a form showing the market's agreement text with a tick box "I agree"; below it a tick box in bold
    "Share my onboarding documents with this market's manager." with a grey explanatory line under it; and a
    dropdown labelled "Booth size you'd like" listing small / medium / large with their weekly prices. The
    Submit button stays disabled until BOTH "I agree" is ticked AND a size is chosen. Tick "I agree", tick the
    document-sharing box, choose MEDIUM, submit.
    Expect: a confirmation that the application went in.

 3. As V2: same page, same form. Tick "I agree", do NOT tick document sharing, choose SMALL, submit.

 4. As the MANAGER: dashboard → "Vendors at this market" (Roster tab).
    Expect: two pending rows. V1's row reads "Requested: medium" and has a link "View docs". V2's row reads
    "Requested: small" and has NO "View docs" link. Tap V1's "View docs".
    Expect: a page listing the documents V1 shared (or saying none were uploaded). If instead you get an error
    page, write down exactly what it says — that is the finding.

 5. As the MANAGER: on V1's pending row, change the size dropdown to LARGE, open the number dropdown and choose
    16, type "moved you to large" in the note box, tap Approve.
    Expect: V1's row now shows #16 and large. On V2's row, leave the size as small, leave the number blank, no
    note, tap Approve.
    Expect: V2's row shows small, no number, and the text "gets a booth # when they book".
    (V1's bell/email should read "Your booth: #16 · large size." followed by your note.)

 6. As V1: /farmers_market/vendor/markets → Market 2 Test day picker → tick a day.
    Expect: it saves now (no red message). Now UNTICK it again and save, so V1 has no declared days for step 7.

 7. As V1 (no days declared): open /farmers_market/markets/[Market 2 Test id]/book.
    Expect: an amber box above the booking form reading "First, pick the days you attend Market 2 Test" with
    the weekday toggles inside it. The "Continue to payment" button is disabled and says why. There is no
    season option visible. Tick a day, then tap "Done — continue to booking".
    Expect: the booking form unlocks and the season option appears.

 8. Still on the book page as V1.
    Expect: a box reading "Your booth at Market 2 Test: #16 · large size — assigned by the manager." The booth
    size dropdown is fixed on "large" and its label reads "Booth size (set by the manager)". Also: the line
    listing the market's operating days sits BELOW the booth map picture and ABOVE the week/booth choice.

 9. BEFORE paying — three checks:
    a. Open one of V1's items: /farmers_market/listing/[item id].
       Expect: Market 2 Test offers NO pickup dates; the item cannot be added to a cart for that market.
    b. As V1: /farmers_market/vendor/markets → "Your next two weeks".
       Expect: Market 2 Test's day shows an amber note "No paid booth week — book this week to sell here".
    c. As the MANAGER: the dashboard's visibility card.
       Expect: it reads "Your market isn't visible to buyers yet" and, in its list of what a vendor needs,
       includes "…and a paid booth week (your market charges for booths, so a vendor counts only once they've
       paid for a current or upcoming week)". Open /farmers_market/markets (the public list, logged out or as a
       buyer).
       Expect: Market 2 Test is NOT in the list.

10. As V1: back on the book page. Choose THIS week, tick the agreement, tap "Continue to payment", pay with the
    test card.
    Expect: you reach the Stripe payment page with no error, and after paying the booking confirmation shows
    booth #16.

11. AFTER paying — the same three checks flip:
    a. V1's item now shows pickup dates at Market 2 Test for THAT WEEK ONLY.
    b. The week strip shows those days as a normal booth entry (no amber note).
    c. The manager's visibility card reads "✓ Your market is visible to buyers", and Market 2 Test appears in
       the public list.

12. As the MANAGER: roster → V1's row.
    Expect: the size and number controls are greyed out with a note under them beginning "Locked — paid week on
    file". Then the card "Weekly booth bookings": V1's PAID row reads "Booth #16 — locked, paid week. Changes
    only after a missed week, or cancel the week below." and has no dropdown.

13. As the MANAGER: roster → some OTHER approved vendor → size dropdown "large" → number dropdown.
    Expect: "16 — paid, locked: <V1's business name> through <a Saturday date>" greyed out. Choose 17, Save.
    Expect: it saves.

14. As V2 (approved, small, no number): /farmers_market/markets/[Market 2 Test id]/book. Tick a day if asked.
    Expect: the size dropdown is fixed on small. Under it: "You'll be given the lowest free booth number in
    this size when you book; paying for the week makes it yours." Choose THIS week and book — but STOP before
    paying (close the Stripe page).
    Expect: the confirmation names a SMALL number — #2 (because #1 is the placeholder).
    As the MANAGER: "Weekly booth bookings" shows V2's row as pending (unpaid) with a size/number dropdown (size
    fixed to small); "Booth occupancy — this week" shows #2 as "Pending payment". On V2's pending row change
    the number to 3 and Save.
    Expect: it saves; V2 is told about the change (bell/email).

15. As V2: go back and pay for that week.
    Expect (manager): the roster now shows V2 with #3 and small. "Booth occupancy — this week" shows #3 as
    "Paid this week" and the small size's "N of M occupied" count went up by one.

16. As the MANAGER, on the small size: give every remaining small number (4 and 5) to other approved vendors as
    HOLDS (roster → size small → number → Save) so that every small number is now a placeholder (#1), paid (#3)
    or held (#2, #4, #5). Approve a third vendor V3 to small with NO number.
    As V3: book a small week.
    Expect: the confirmation names the LOWEST held number (#2) — a hold yields to someone who books. V3 pays.
    Expect: the roster now shows V3 with #2, and the vendor who HELD #2 now has NO number. That vendor's
    bell/email: "Booth #2 at Market 2 Test is no longer held for you…". The MANAGER's own "V3 paid for a booth"
    message ends "Booth #2 was held for <name>; the hold moved to V3 because <name> had no paid week and the
    other booths were taken. Re-pin <name> from the roster if…". (If V3 had never paid, nothing would have
    moved.)

17. ONLY IF a test market has a season on sale (a "season" or "pre-season" option on its book page): buy the
    season (or several weeks of it) as a vendor WITH a hold, then as a vendor WITHOUT one; then open
    /farmers_market/vendor/bookings.
    Expect: the vendor with a hold sees their held number on EVERY week; the vendor without a hold sees the
    SAME automatically assigned number on every week. If no single booth is free for all the weeks, the
    message says a season keeps one booth all season (it does not blame one particular week).



==================================================
W3 — MANAGER CANCELS A MARKET DAY AND A PAID WEEK   (Market 2 Test, right after W2 · ~20 min)
===
YOU NEED: W2 done — V1 has a PAID week (#16) with at least one weekday declared. Manager login.

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

 4. As the MANAGER: "Weekly booth bookings" → find a PAID row (V2's #3 or V1's #16) → tap "Cancel week".
    Expect: a box asking for a reason appears; the Confirm button stays disabled until you type one. Type a
    reason and confirm.
    Expect: the row now shows Cancelled and a green line stating the credit — the FULL amount the vendor paid if
    the week hasn't started, or only the remaining declared days if the week is in progress. The vendor's
    bell/email: "The manager of Market 2 Test cancelled your booth #N for the week of <date>. … You have a
    $X credit…". Try "Cancel week" on a row that is part of a SEASON purchase (if one exists).
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
W5 — VENDOR SETS UP LISTINGS AND MARKETS   (~25 min)
===
YOU NEED: a FREE-tier farmers-market vendor who is already at 3 traditional markets; a farmers-market vendor and
a food-truck vendor who each have the box "I can staff more than one location at the same time" UNTICKED on
/[vertical]/vendor/edit; a food-truck listing set to allow same-day ordering ("0 days advance"); a buyer.

 1. As the 3-market vendor: /farmers_market/vendor/listings/[any listing id]/edit → tick a FOURTH traditional
    market → save.
    Expect: refused; the message says "Your Free plan allows active listings at up to 3 traditional markets,
    counted across all your listings…" and LISTS the markets already counted. — OR — the extra markets cannot
    be ticked at all (they look disabled). Either way, tell me which of the two you saw.

 2. As the farmers-market vendor with the box UNTICKED: /farmers_market/vendor/markets → activate a SECOND
    market that meets on the same weekday and overlapping hours as one you already attend.
    Expect: refused, with a message that names the market you are already at during that time. Tick the box
    on /farmers_market/vendor/edit, save, try again.
    Expect: it succeeds. Repeat once as the food-truck vendor on /food_trucks/…

 3. As a BUYER: open the same-day food-truck listing (/food_trucks/listing/[id]) on a day the truck is NOT
    operating.
    Expect: the availability text reads "Orders Open on Operating Days". Hover the availability badge.
    Expect: the tooltip does not mention preparation time.

 4. As a BUYER: place an order with any vendor, then cancel it BEFORE the vendor confirms it. As that VENDOR:
    /[vertical]/vendor/orders.
    Expect: the count card at the top labelled cancelled includes this order, and the number matches how many
    cancelled/refunded orders appear in the list below.



==================================================
W6 — PLATFORM ADMIN LOOKS UP A VENDOR   (platform admin login · ~5 min)
===
 1. /farmers_market/admin/vendors → the "Tier" dropdown.
    Expect: exactly three choices: Free, Pro, Boss. Choose Free.
    Expect: the list includes vendors whose tier used to be called "standard", "premium" or "featured", and
    every one of their rows now reads "Free".

 2. In the list, find Valley Verde Farm.
    Expect: the row shows "📦 N published" (and "🧺 N boxes" if they sell market boxes). Write down N.

 3. Open Valley Verde Farm → Details → "Quick Stats".
    Expect: "Published listings" shows the SAME N as the list; "Active market boxes" is shown separately;
    "Tier" reads Free. (Draft and deleted listings are not counted on either page.) If there is a CSV export,
    its Tier column matches.

 4. Same page → the card "Markets" (under Business Information).
    Expect: one line per market the vendor is on: the market name (tap it → the admin's market page), a status
    pill APPROVED / PENDING / REVOKED, "Booth #N (size)" where the manager gave them a number, and
    "Days declared: Sat, Wed" or "No days declared". A vendor on no market reads "Not on any market roster yet."

 5. Same page → the card "Event Readiness Application" — for a FARMERS-MARKET vendor who has filled in
    "Private Events Readiness" on /farmers_market/vendor/edit (open both side by side).
    Expect: farmers-market questions only — Setup Type · Space Needed (feet wide) · Do You Need Access to
    Electrical Power? · Product Storage Needs · Product Display Setup · Can You Offer Product Samples · Outdoor
    Event Suitability · How Many Customers Can You Serve Per Hour? — and each value is exactly the option text
    the vendor picked on the form. NO "Vehicle Type", NO "Generator", NO "Max Runtime", and the word "undefined"
    appears nowhere. Then open a FOOD-TRUCK vendor's detail page.
    Expect: Vehicle Type / Generator / Max Runtime ARE shown there.



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
W9 — MARKET BOXES: ONE PURCHASE   (~15 min)
===
BACKGROUND: a "market box" is a subscription a vendor sells — the buyer pays for N pickups of a box.
YOU NEED: a vendor with a market-box offering whose next pickup date is within 7 days; a buyer.

 1. As the BUYER, buy the box. As the VENDOR: the vendor dashboard's card "My Upcoming Pickups", and
    /[vertical]/vendor/markets → "Your next two weeks".
    Expect: the pickup day appears on the dashboard tile (counted as an item at that market) AND on the week
    strip as a "market box" entry at the pickup market showing the offering's hours.

 2. As the VENDOR: /[vertical]/vendor/market-boxes/[offering id] → tabs "Subscribers" and "Pickups".
    Expect: each row shows an order number beginning "Order #FA-" next to the week.

 3. Complete pickup 1: the buyer confirms receipt, the vendor confirms within 30 seconds. Then open, as the
    buyer, /[vertical]/buyer/subscriptions/[id] and /[vertical]/buyer/orders.
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
    "Tax Refunded","Amount Subject to Tax (net)","Tax Due (net)","Taxed Items","Reversal Rows","Rate Version(s) in Period"
    and the only other line is a TOTAL row showing $0.00 — because no
    tax has been collected yet. (An empty file or an error message IS a finding.)



==================================================
NOT RUNNABLE YET — nothing for you to do
===
• Event money on cancellation / de-selection — needs an event with a PAID vendor fee on staging.
• "Protocol v6 remainder" (buyer items + weekly survey · onboarding copy · manager new-email invite and resend ·
  farmers-market mirror · print chrome) — steps still being rewritten.
• Two production-only checks (stock decrement at checkout; payout timing) — wait for a real vendor with Stripe
  on production.





============================================================================================================
APPENDIX — FOR CLAUDE'S BOOKKEEPING ONLY. Testers: stop reading here.
============================================================================================================
Registry rows satisfied by each step (a step may cover several rows; a row may span steps):
W1  1→TR-097 · 2→TR-099 (strike-through part → W3.1) · 3→TR-098 TR-105 · 4→TR-106 · 5→TR-106 TR-072 TR-103
    · 6→TR-085 TR-102 · 7→TR-090 · 8→TR-081 · 9→TR-104(manager half) TR-082 · 10→TR-102 · 11→TR-101 · 12→TR-108
W2  1→TR-083 · 2→TR-071 TR-084 · 3→TR-084 · 4→TR-084 TR-036 · 5→TR-085 · 6→TR-083 · 7→TR-087 · 8→TR-086 TR-046
    · 9→TR-073 TR-074 TR-075 (before) · 10→TR-078 · 11→TR-073 TR-074 TR-075 (after) · 12→TR-089 TR-103
    · 13→TR-102 TR-080 · 14→TR-104(vendor half) TR-089 TR-103 · 15→TR-088(part 1) TR-082 · 16→TR-088(part 2)
    · 17→TR-079
W3  1→TR-091 TR-099 · 2→TR-091 · 3→TR-091 · 4→TR-092
W4  1→TR-034 · 2→TR-107 · 3→TR-043 · 4→TR-109 · 5→TR-109 · 6→TR-040 · 7→TR-109
W5  1→TR-069 · 2→TR-044 · 3→TR-042 · 4→TR-048
W6  1→TR-095 · 2→TR-096 · 3→TR-095 TR-096 · 4→TR-093 · 5→TR-094
W7  1→TR-022 TR-064 · 2→TR-022 TR-064 · 3→TR-022 · 4→TR-065 · 5→TR-066 · 6→TR-067 · 7→TR-068 · 8→TR-026
    · 9→TR-025 · 10a→TR-023 · 10b→TR-024 · 10c→TR-030 · 10d→TR-032 · 10e→TR-033 · 10f→TR-035
W8  1→TR-010 · 2→TR-001 · 3→TR-005 · 4→TR-002 · 5→TR-003
W9  1→TR-015 · 2→TR-016 · 3→TR-014
W10 1→TR-041
W11 1→TR-112 · 2→TR-110 · 3→TR-110 · 4→TR-110 TR-112 · 5→TR-113   (TR-111 = W11.4-style address change, not scripted: needs an address edit)
Passed already (removed): TR-100. Not runnable: TR-028 TR-029 TR-031 TR-060 TR-062.
Wording quoted from code 2026-09-22 (BoothNumberingHelp, ManagerActionSummary, BoothNumberPicker, VendorBoothList,
BoothOccupancyGrid, WeeklyBookingsList, week-sheet page, notifications/types.ts 889/1026-1035/1002/1194/1054,
schedules route :81, ApplyToMarketButton, DeclareDaysGate, BookBoothForm :329-344, MarketVisibilityCard :40-79,
PickupCapacityForm :111, week-strip.ts :183, BookParkSpotForm :625/858/865/917, MarketCancelDateCard :133/162,
listings/[listingId]/markets route :198, en.ts :855, VendorDetailAdminPage :316/335, fulfill route :511,
CuratedBundlesCard :480-496, select page :595, events page :198/346, EventsAdminPage :993). Steps whose exact
words were NOT pulled from code are phrased as meaning, not quotation: W2.4 docs page, W4.6 result-line
numbers, W5.2 conflict message, W7.4 backup note, W7.6 prompt text, W9.3 progress phrase.
