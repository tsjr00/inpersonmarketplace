STAGING TEST WORKFLOWS — SELF-CONTAINED EDITION
Version 4.0 · 2026-09-27 · staging build ad29ed22 · written for a tester who has ONLY this document and the app.
Nothing in here refers to any other document. If a step tells you to expect words on the screen, those are the
words the app is supposed to show. If the screen shows something different, that difference IS your finding.

Staging site: https://inpersonmarketplace-git-staging-tsjr00s-projects.vercel.app
The site has two "verticals" that share one code base: farmers_market and food_trucks. Every page's web address
starts with one of those two words. When a step names a page, it names it the way the app does (the page title or
the card title you will see) and, in brackets, the web address — use whichever is easier. Where you see [id], use the
long code from the page's own address bar.

Before every session: hard-refresh the page (Ctrl+F5 on Windows, Cmd+Shift+R on Mac) so you get the newest build.

★ WHAT'S NEW IN 4.0
  Everything that passed on 2026-09-25/26/27 has been removed. Every workflow was re-sequenced so an earlier step
  never makes a later one impossible — read "Before you start" and run the steps IN ORDER. Eight fixes from the
  2026-09-27 report are on staging and folded into the workflows where they naturally fall:
  the market page's top button follows your application (Apply now → Applied → Book now); the park operator's
  Action Items no longer counts an invited truck as "pending your approval"; My Park Bookings offers "Book again",
  lists your weekly holds and lets you pay a held date; a paid day on a held weekday says "Your standing hold";
  "N pickup locations" is spelled right; the food-truck pickup time is step 3 of the order; a truck's profile shows
  the same "Closed" pill as the menu; survey emails come from the right brand.
  Run W1 (park) and W2 (buyer) first — they hold most of the new fixes.


==================================================
HOW TO REPORT
===
Run a workflow top to bottom in one sitting. Each numbered step ends with one or more "Expect" lines. When you
finish, send ONE of these per workflow, in your own words:

    "W2 pass"
    "W2 step 6: the second dropdown never loaded, it just said Loading…"   ← what you actually saw; then keep going if you can
    "W2 step 6 skipped: I don't have a second vendor account"                ← you couldn't do it; that is not a failure

Screenshots help a lot. You never have to rate how serious something is.
A line that says "(not a failure)" tells you in advance that the app is behaving as designed — write down what you
saw and move on.


==================================================
WORDS USED IN THIS DOCUMENT
===
Vendor ............ someone who sells (a farm, a bakery, a food truck). Has a vendor account.
Truck ............. a food-truck vendor.
Buyer ............. someone who orders. Has a buyer account.
Market manager .... the person who runs a market. For food trucks the same person is called the park OPERATOR.
Managed market .... a market that has a manager in the app. EVERY test market below is managed. At a managed
                    market a vendor must APPLY and be APPROVED by the manager before they can pick days or book.
Booth size ........ a category of booth at a farmers market, e.g. "10x10", "Small". Each size has a weekly price
                    and its own set of booth NUMBERS (e.g. 10x10 = booths 1–10).
Booth number ...... one specific booth, e.g. #5. A number always belongs to exactly one size.
Hold (or held) .... the manager reserved a booth number for a vendor who has NOT paid for a week yet.
Paid week ......... a vendor bought one week at a booth. Their number is LOCKED for that week.
Placeholder ....... a booth rented to someone OFF the app (paid in cash/check), recorded so the number is taken.
Roster ............ the manager's list of vendors: the card titled "Vendors at this market" (farmers markets) or
                    the "Your trucks" group (parks).
Declared day ...... a weekday the vendor has ticked as "I attend this market on this day" — done on the vendor's
                    My Locations page (web address …/vendor/markets), which this document calls "the Markets page".
Manager dashboard . the manager's main page: Market Manager → your market (…/market-manager/[id]/dashboard).
Action Items ...... the first card on the manager dashboard — things the manager needs to do.
Setup / Park setup  a collapsible section on the manager dashboard (Booth inventory, schedule, etc.).
Week .............. weeks start on SUNDAY everywhere in the app.
Park / spot ....... food-truck words for market / booth. A "weekly hold" (also "recurring hold") is a truck's
                    standing claim on one spot for one weekday, every week.
The daily job ..... a scheduled task that runs on the real site every day (creating the week's held dates, sending
                    surveys). Staging never runs it by itself — the OWNER triggers it when a step says so.


==================================================
THE TEST MARKETS (all on staging; ask the owner for the logins)
===
Sixth Street Food Park        food trucks · spots (Spot A, Spot 2, …) · taking paid bookings                  → W1, W2
Amarillo Community Market     farmers market · charges for booths · sizes "10x10" numbered 1–10 and "10x15"
                              numbered 11–20 · holds: #5 Sunrise Organic Farm, #6 Happy Hens Farm, #7 Texas
                              Honey Co., #8 Lone Star Succulents, #9 Sweet Rise Bakery, #11 Valley Verde Farm ·
                              placeholder #1 "Market Manager Booth"                                              → W6, W7, W13, W14
River Road Farmers Market     charges · "Small Tent" 4–13, "Medium Tent" 14–23, "Large Tent" 1, Booth 2, 3, 24, 25 → W3
Market 2 Test                 charges · "small" 1–5 ($25/wk), "medium" 6–15 ($35/wk), "large" 16–20 ($50/wk) ·
                              hold #7 Hill Country Herbals · placeholder #1                                       → W3 (end), W4, W5
Westgate Mall Farmers Market  (capital "Mall") · look only, in W4 step 1                                        → W4
Westgate mall Farmers Market  (lowercase "mall") · spare


==================================================
THE WORKFLOWS — run them in this order when you can
===
  W1  Food-truck park: three trucks and the operator, start to finish        Sixth Street · ~45 min
  W2  A buyer on the food-truck menu, a listing, a truck's profile           ~15 min
  W3  A fresh farmers-market vendor, start to paid week                      River Road, then Market 2 Test · ~60 min
  W4  Seasons: create one, open pre-sale, two vendors buy it                 Market 2 Test · ~30 min
  W5  Manager cancels a market day and a paid week                           Market 2 Test, after W3 and W4 · ~20 min
  W6  Manager dashboard: what is left to re-check                            Amarillo · ~20 min
  W7  Vendor listings and markets: limits, double-booking, held-number retry  ~20 min
  W8  Platform admin looks up a vendor: two items left                       ~5 min
  W9  Market boxes: dated pickup tile, "Manage Pickups", pickup progress     ~15 min
  W10 Market bundles: three fresh orders                                     ~30 min + a 1-hour wait
  W11 Events: one fresh self-service event, start to shop                    ~45 min
  W12 Survey email (the owner triggers it)                                   ~10 min
  W13 Platform admin: sales-tax preparation tools                            Amarillo · ~15 min
  W14 SALES-TAX REHEARSAL — one simulated month with tax ON (staging only)   Amarillo · ~2 hrs · ONLY when the owner says so



==================================================
W1 — FOOD-TRUCK PARK: THREE TRUCKS AND THE OPERATOR, START TO FINISH   (Sixth Street Food Park · ~45 min)
===
WHY THIS ORDER: a truck can only ask for a weekly hold after it has PAID for a day; the operator can only approve a
hold after it has been asked for; other trucks are only refused a Saturday once the hold is APPROVED; and the "not
available for weekly holds" message can only be shown by switching a spot's setting OFF, which would break every
earlier hold step — so that is the very last step, and it is switched back on afterwards.

Before you start (the OWNER prepares these — ask for the logins):
  • The Sixth Street OPERATOR login. The park's setup checklist is complete and the park takes paid bookings.
  • T1: an approved food-truck vendor who has NEVER applied to Sixth Street.
  • T2 and T3: two trucks already APPROVED at Sixth Street with their days picked there, neither has ever PAID for a
    day at Sixth Street, and neither has a weekly hold there.
  • T4: an approved food-truck vendor who is NOT on Sixth Street's roster (the operator will invite them in step 5).
  • Spot A exists, and its setting "Allow standing/recurring reservations" is ON (operator: Park setup → the card
    "Spot inventory" → Spot A's row → Edit → the tick box → Save). Nobody currently holds Spot A on Saturdays.
  • Test card: 4242 4242 4242 4242, any future date, any CVC.

 1. As T1: open Sixth Street's page (Markets → Sixth Street Food Park; …/food_trucks/markets/[Sixth Street id]).
    Expect: next to the park's name a blue button "Apply now". Tap it.
    Expect: a form titled "Apply to Market" with a note box, the park's agreement and a tick box about sharing your
    documents; there is NO "Booth size you'd like" question (parks have no booth sizes). Tick "I agree", tap
    "Submit Application".
    Expect: the page reloads and the blue button is replaced by a small label "Applied" — no button.
    Also open T1's Markets page (Locations → …/food_trucks/vendor/markets) and the vendor dashboard card titled
    "Locations & Schedule".
    Expect: the small button at the card's top-right reads "Manage" (it used to read "Edit").

 2. As T2: open Sixth Street's booking page (the park's page → the blue "Book now" button; …/food_trucks/markets/
    [Sixth Street id]/book-spot).
    Expect: two tabs, "Book a day" and "Weekly hold". Tap "Weekly hold" first, WITHOUT booking anything.
    Expect: a dashed box "Weekly holds unlock after your first paid booking here. Book a day on the Book a day tab
    first…" — that is the rule (not a failure). Now tap "Book a day": pick Spot A, "Single day", choose the FIRST
    Saturday offered, tick the park's agreement and the compliance acknowledgment, tap "Book & pay at Sixth Street
    Food Park", pay with the test card.
    Expect: after paying you land on the page titled "My park bookings" (…/food_trucks/vendor/park-bookings). Under
    the intro: a blue button "Book again at Sixth Street Food Park →" and a link "Find another park →". Under
    "Upcoming": the Saturday you paid for, marked "Paid", with the amount you paid (if it still reads "Pending payment",
    wait a minute and reload — the payment confirmation arrives a moment after Stripe). Write that Saturday's date
    down — later steps call it "T2's paid Saturday".

 3. As T2: back on the booking page, pick Spot A, open the "Weekly hold" tab.
    Expect: the tab is now open (a "Request a weekly hold" box with "Day of week" and "Starting" dropdowns).
    Choose Saturday, leave the start date as offered, tap "Request weekly hold".
    Expect: "✓ Requested — the park operator will review it." Then open "My park bookings" again.
    Expect: a section "Your weekly holds" with one row "Sixth Street Food Park · Spot A · every Saturday" and a
    yellow "Pending review" pill.

 4. As T2: try to request the SAME hold again (Spot A, Saturday, any start date).
    Expect: refused with the sentence beginning "You've already requested this spot on this day — it's pending the
    operator's review." (not a failure).

 5. As the OPERATOR: open the manager dashboard for Sixth Street. In the group "Your trucks", tap the "Invite" tab and
    invite T4 (T4 must NOT answer until step 9).
    Now read the FIRST card, "Action Items".
    Expect: exactly three lines, each with a link:
      "1 food truck pending your approval." — link "Review →"           (T1)
      "1 invited food truck hasn't answered yet." — link "See who →"      (T4)
      "1 recurring-hold request is waiting for your yes or no (Recurring holds tab)." — link "Decide →"   (T2)
    Tap any link: the page scrolls to the "Your trucks" group. On the "Your trucks & approvals" tab the small
    filters above the list read "Pending approval (1)" and "Invited (1)"; T1 is the pending one, T4 the invited one,
    T4's row reads "📤 Waiting on food truck response". Scroll to the bottom of the page.
    Expect: the LAST section is titled "Communication & insights".

 6. As the OPERATOR: on "Your trucks & approvals", find T1 and tap "Approve". Then open the "Recurring holds" tab
    (card "Recurring spot holds") and tap "Approve" on T2's Saturday request for Spot A.
    Expect: the "Action Items" card now shows ONE line only: "1 invited food truck hasn't answered yet." — no "pending
    your approval" line (before 2026-09-27 that line stayed until the invited truck answered; that was the bug).

 7. As T1: open Sixth Street's page again.
    Expect: the label "Applied" is gone; a blue button "Book now" sits next to the park's name. Tap it.
    Expect: Sixth Street's booking page opens ("Book a spot at Sixth Street Food Park").

 8. As T3: open Sixth Street's booking page, "Book a day".
    Expect: Spot A's card carries the line "Held on Saturdays — recurring truck". With Spot A picked, the day list
    greys every Saturday and adds "— held by a recurring truck" to it; under the list: "Held days open to other
    trucks only if the recurring truck doesn't pay by the Thursday before." Switch to "Prepay a week": every week
    that contains a Saturday is greyed with a note ending "is held by a recurring truck — pick another spot for this
    week". Now try to force it: pick a different spot, stay in week mode, select a week containing a Saturday, then
    change the spot back to Spot A and tap "Book & pay…".
    Expect: refused with "Spot A is held by a recurring truck on Saturdays. It opens to other trucks only if they
    don't pay by the <date> cutoff — check back after that, or pick another spot." Nothing is charged.

 9. As T4: open T4's Markets page (…/food_trucks/vendor/markets).
    Expect: near the top, an invitation card for Sixth Street Food Park with "Accept" and "Decline". Tap "Decline".
    As the OPERATOR: reload the dashboard.
    Expect: "Action Items" reads "Nothing needs you right now — truck approvals and recurring-hold requests show up
    here." In "Your trucks & approvals" tap the "All" filter: T4's row reads "❌ Declined the invitation" (not
    "Pending approval · declined"), and T4 is NOT counted under "Pending approval" or "Invited".

10. As T2: open the Markets page → the strip "Your next two weeks" at the top.
    Expect: T2's paid Saturday (step 2) reads "Sixth Street Food Park · <hours> booked" with the note "Your standing
    hold" (new 2026-09-27). Every LATER Saturday in the strip that is more than 7 days away shows the park with the
    note "Standing spot hold — the pay-by window opens within 7 days of the date".
    OWNER-TRIGGERED PART (optional — skip if the owner is not available): if there is a Saturday within the next 7
    days that T2 has NOT paid for, the owner runs the daily job on staging. Then reload.
    Expect: that Saturday now reads "Pay by <date> to keep your spot"; and on "My park bookings" the same date
    appears under "Upcoming" as "Pending payment" with "· weekly hold — you hold this spot" and a "Pay now" button.
    Tap "Pay now": the Stripe payment page opens (you may cancel it and come back).

11. As the OPERATOR: "Your trucks & approvals" → T1's row → "Revoke" → confirm. As T1: open Sixth Street's page.
    Expect: neither a button nor a label next to the park's name (a removed truck sees nothing). The operator may
    re-approve T1 afterwards (the row moved to the "Revoked" filter; the button there is "Reinstate").

12. LAST — the negative case, then put it back. As the OPERATOR: Park setup → "Spot inventory" → Spot A → Edit →
    UNTICK "Allow standing/recurring reservations" → Save. As T2: booking page → pick Spot A → "Weekly hold" tab.
    Expect: "This spot isn't available for weekly holds. Pick a different spot above." As the OPERATOR: tick the box
    back ON and Save (the next tester needs it on).



==================================================
W2 — A BUYER ON THE FOOD-TRUCK MENU, A LISTING, A TRUCK'S PROFILE   (~15 min)
===
Before you start (ask the owner to name them):
  • A buyer login.
  • Truck P: a truck whose listing is sold at TWO or more pickup places (the menu shows a count for it).
  • Truck Q: a truck that IS taking orders right now (its listing has a pickup location you can pick).
  • Truck R: a truck that is NOT taking orders right now (for example, today is not one of its operating days).
  • Truck S: a truck whose card on the "Food Trucks" page lists more places than fit (it shows "+N more …").
  (One truck can play more than one part.)

 1. As the BUYER: open the menu (Browse; …/food_trucks/browse) and find Truck P's listing card.
    Expect: under the price, "N pickup locations" — spelled exactly like that (a listing sold at ONE place shows that
    place's name instead — not a failure).

 2. Open Truck Q's listing (tap its card; …/food_trucks/listing/[id]) and look at the order section on the right.
    Expect: two boxes outlined in the truck's red: "1. Available Pickup Options" and "2." (choose the location). Pick
    a location.
    Expect: a THIRD red-outlined box appears, labelled "3. Select a Pickup Time:" with a dropdown "Choose a pickup
    time...", and the Add to Cart box below it is now labelled "4." (new 2026-09-27 — before, the pickup time had no
    box and no number).

 3. Open the "Food Trucks" page (…/food_trucks/vendors) and find Truck S's card.
    Expect: the places list ends with "+1 more location" when exactly one is hidden, or "+N more locations" when
    several are.

 4. Back on the menu: find Truck R's listing cards.
    Expect: a red "Closed" pill top-right on each card. Tap Truck R's NAME to open its profile and scroll to its
    listings.
    Expect: the SAME red "Closed" pill on the same cards, top-right over the picture (new 2026-09-27). Then open
    Truck Q's profile: no pill on its cards, and none on the menu either — correct.

 5. Open Settings (…/food_trucks/settings) and switch the language to Spanish. Reload the menu and the Food Trucks
    page.
    Expect: Truck P's card reads "N ubicaciones de recogida"; Truck S's card reads "+1 ubicación más" or
    "+N ubicaciones más". Switch the language back to English.



==================================================
W3 — A FRESH FARMERS-MARKET VENDOR, START TO PAID WEEK   (River Road Farmers Market, then Market 2 Test · ~60 min)
===
WHY THIS ORDER: the refusals ("apply first", "no days picked yet") can only be seen BEFORE you apply, before you are
approved and before any day is picked — so they come first; the payment checks come before the payment; and the two
checks marked [visibility] only mean something if River Road is not already visible to buyers.

Before you start (the OWNER prepares these — do not build them yourself):
  • V4 and V5: two farmers-market vendors who have NEVER been at River Road Farmers Market. Each has ONE published
    listing NOT attached to River Road, is at FEWER than 3 traditional markets, and has a home market set elsewhere.
  • The River Road MANAGER login. The Market 2 Test MANAGER login (steps 11–12). V2's login (step 11).
  • Test card: 4242 4242 4242 4242.
Look first (write the answers down):
  (i)  Open the public markets list logged out (…/farmers_market/markets). Is River Road Farmers Market listed? If
       YES, skip the two parts marked [visibility] — the market is already visible, so they cannot show the change.
  (ii) As V4, open River Road's booking page (…/farmers_market/markets/[River Road id]/book). If it says online
       booking is not available, STOP and tell the owner.

 1. As V4: open the Markets page (…/farmers_market/vendor/markets).
    Expect: V4's home market is NOT open on arrival; in the list it shows a small blue "🏠 Home Market" badge on a
    light-blue row. Tick River Road Farmers Market to open its card.
    Expect on River Road's card: an amber note "This market reviews vendors first: apply from its page (step 1),
    then set your schedule." and five numbered buttons, left to right: "1 NEXT: Apply" (the only filled one) ·
    "2 Set Schedule" · "3 Book a Booth Space" · "4 Manage Listings" · "5 📋 Prep Sheet".

 2. Still as V4, on River Road's card: tap "Set Schedule" and tick any day.
    Expect: refused in a RED box headed "Manager approval needed": "River Road Farmers Market reviews vendor
    applications. Apply from the market's page — the manager will be notified and you'll be able to set your schedule
    once approved."
    Then open River Road's booking page (address in "Look first (ii)").
    Expect: no booking form — a page headed "Apply to River Road Farmers Market first" with a button "Apply at River
    Road Farmers Market".

 3. Still as V4: open your listing (…/farmers_market/vendor/listings → the listing → Edit), tick River Road Farmers
    Market under "Available at", Save. Back on the Markets page, open River Road's card.
    Expect: the second button still reads "Set Schedule" (NOT "Manage Schedule") and the amber note still asks you
    to apply first. (Saving a listing must NOT pick market days for you at a market with a manager.)

 4. Tap "1 NEXT: Apply". On River Road's market page tap the blue "Apply now" button (it used to read "Apply to Sell
    Here").
    Expect: a form "Apply to Market" with a "Booth size you'd like" dropdown listing the tent sizes with weekly
    prices; "Submit Application" stays disabled until you pick a size AND tick "I agree". Pick a size, tick, submit.
    Expect: the button is replaced by a small label "Applied". Back on the Markets page, River Road's card now reads
    "Your application is with the manager — you'll pick your days here once they approve you."; the first button
    reads "Application sent" and NO button says NEXT. Open the booking page again.
    Expect: "Your application to River Road Farmers Market is with the manager" with a button "Back to River Road
    Farmers Market".

 5. As the River Road MANAGER: manager dashboard → "Vendors at this market" → V4's pending row.
    Expect: the row shows "Requested: <the size V4 picked>", a size dropdown pre-set to it, a booth-number dropdown
    and a note field beside "Approve". Leave the number blank, type a short note, Approve.
    As V4: reload the Markets page and River Road's card.
    Expect: the first button shows ✓ and reads "Apply"; the filled button is "2 NEXT: Set Schedule". On River Road's
    market page the label "Applied" has become a blue button "Book now". V4's bell / email: an approval message that
    names the booth size and carries the manager's note.

 6. As V4 (still no days picked): tap "Book now".
    Expect: an amber box "First, pick the days you attend River Road Farmers Market" with weekday toggles above the
    form, and "Continue to payment" is disabled. Tick a day, tap "Done — continue to booking".
    Expect: the form unlocks; the booth-size dropdown is locked to the size the manager approved, with a "set by the
    manager" note. (A season option appears only if River Road has a season on sale — none is not a failure.)
    [visibility] As the MANAGER: directly under "Action Items", an amber card "Your market isn't visible to buyers
    yet" whose explanation includes "…and a paid booth week (your market charges for booths, so a vendor counts only
    once they've paid for a current or upcoming week)". River Road is NOT in the public list.

 7. As V4 on the booking page: choose THIS week, tick the agreement, tap "Continue to payment". On the Stripe page do
    NOT pay — use the browser's Back button.
    Expect: a yellow box "You stepped away from payment" saying no charge was made and the payment page stays open
    for up to 24 hours, with a "Continue payment" button. Tap it.
    Expect: the SAME Stripe page (same amount). Use Back again.

 8. On the booking page, choose the SAME week again and tap "Continue to payment".
    Expect: a red box "You already started booking this week and it is waiting for payment. Continue the payment
    below." with a "Continue payment" button under it (not a dead end).

 9. As V4: open My Bookings (…/farmers_market/vendor/bookings).
    Expect: River Road's week shows "Pending payment" and a "Continue payment" button. Tap it and pay with the test
    card.
    Expect: the confirmation shows a booth number.

10. After paying:
    a. As V4, River Road's card on the Markets page: buttons 1–4 show ✓ and no button says NEXT.
    b. [visibility] As the MANAGER: the amber card under Action Items is gone; at the bottom of Setup, the green
       "✓ Your market is visible to buyers". River Road IS in the public list.
    c. As the MANAGER, "Vendors at this market" → V4's row: the size and number dropdowns look GREYED (grey
       background, pointer shows "not allowed"), with "Locked — paid week on file. The number changes only after a
       missed week, or if you cancel the paid week." under them; the amber "no paid week yet" note that other unpaid
       vendors' rows carry is GONE from V4's row.

11. At Market 2 Test, leftover from 2026-09-25: as V2, open My Bookings. If V2's Market 2 Test week still reads
    "Pending payment", tap "Continue payment".
    Expect (that payment page is more than 24 hours old): "That payment page had expired, so the unpaid booking was
    released. You can book the week again now." and a button "Book the week again". Tap it, book a SMALL week at
    Market 2 Test and pay.
    Expect (Market 2 Test MANAGER): the roster shows V2 with a small number; "Booth occupancy — this week" shows that
    number as "Paid this week" and the small size's "N of M occupied" count went up by one.
    (If V2's week no longer shows as pending, write down what it shows and skip to step 12.)

12. Market 2 Test, as the MANAGER: give every remaining FREE small number to other approved vendors as HOLDS (roster →
    the vendor's row → size "small" → a number → Save) so every small number is a placeholder (#1), paid, or held.
    Approve V5 at Market 2 Test on "small" with NO number (V5 applies first from the market's page with "Apply now").
    As V5: pick a day, book a small week and pay.
    Expect: V5's confirmation names the LOWEST held small number — a hold yields to someone who books and pays. The
    roster shows V5 with that number and the vendor who HELD it now has no number. That vendor's bell / email:
    "Booth #N at Market 2 Test is no longer held for you…". The MANAGER's own "paid for a booth" message ends
    "Booth #N was held for <name>; the hold moved to <V5> because <name> had no paid week and the other booths were
    taken. Re-pin <name> from the roster if…".



==================================================
W4 — SEASONS: CREATE ONE, OPEN PRE-SALE, TWO VENDORS BUY IT   (Market 2 Test · ~30 min)
===
BACKGROUND: a "season" lets a vendor pay once for a booth for every market week of a date range. The manager creates
the season and opens "pre-sales"; pre-sales can open at most 60 days before the season starts and close by
themselves 14 days after it starts.
Before you start (ask the owner): the Market 2 Test MANAGER login · the Westgate Mall (capital "Mall") MANAGER login
for step 1 only (look, change nothing) · two vendors APPROVED at Market 2 Test with at least one day picked there:
VA whose roster row shows a booth NUMBER, and VB whose roster row shows NO number · the test card.

 1. As the Westgate Mall MANAGER: manager dashboard → open "Setup" → the card "Season pre-sales".
    Expect: the season "summer 2 test" shows a grey pill "Pre-sales closed" and, in its details line, "· pre-sales
    closed Aug 16"; NO "Close pre-sales" button and NO "Open pre-sales" button. (Its window ended Aug 16.)

 2. As the Market 2 Test MANAGER: dashboard → "Setup" → "Season pre-sales" → the form at the bottom. Type a name
    (e.g. "W4 test season"), Start = the NEXT Sunday, End = about six weeks later, make-up buffer 0, tap "Create
    season".
    Expect: either the season is created, or a tick box appears "I confirm my market schedule (operating days &
    times) is accurate — the season's market-day count is derived from it." — tick it and tap "Create season" again.
    The new season appears in the list with its dates and "N market days". If a yellow warning about the dates not
    matching the admin's season appears, tick "I understand the season dates don't match…" under it before step 3.

 3. On the new season, tap "Open pre-sales".
    Expect: the pill turns to "Pre-sales open" with "· closes <date>" = 14 days after your Start date.

 4. As VA: open Market 2 Test's booking page (the market's page → "Book now").
    Expect: below the weekly form, a section "Reserve a whole season". Pick your season and VA's booth size, tick
    "I accept the market agreement and the season cancellation policy above.", tap "Reserve season — $…", pay.
    Expect: you land on My Bookings with no error.

 5. As VB: the same, with any booth size. Pay.

 6. As the Market 2 Test MANAGER: "Weekly booth bookings" → step through the season's weeks with the → arrow.
    Expect: VA appears in EVERY season week with the SAME number VA's roster row showed before step 4; VB appears in
    every season week with ONE number that stays the same every week. As VA and as VB, My Bookings lists the purchase
    under "Season bookings" as "Season · N weeks · <dates> · <size>" with the badge "Paid".
    If a purchase is refused, write down the exact message — especially one saying a season keeps one booth for the
    whole season.

 7. Leave the season OPEN for now — W5 step 4 needs a season week to exist. (W5 closes it at its end.)



==================================================
W5 — MANAGER CANCELS A MARKET DAY AND A PAID WEEK   (Market 2 Test · after W3 and W4 · ~20 min)
===
Before you start: V1 has a PAID one-off week at Market 2 Test (#16, since 2026-09-25) with at least one weekday
declared — ask the owner for V1's login. V2 or V5 has a paid one-off week from W3. W4 created a season with paid weeks.
The Market 2 Test MANAGER login.

 1. As the MANAGER: "Communication & insights" → the card "Cancel a market day". Pick a FUTURE date that falls inside
    V1's paid week AND is a weekday V1 has declared. Cancel it.
    Expect: V1's bell / email: "Market 2 Test is closed on <date>. Your paid booth week is credited $X for that day —
    applied automatically to your next booking at this market." where X = what V1 paid for the week ÷ the number of
    market days V1 declared that week (paid $50, declared 2 of 3 days → $25). On the manager's strip "Your next two
    weeks" that date is struck through and reads "Cancelled" (with a make-up date if you gave one). On V1's own
    "Your next two weeks" the same.

 2. Cancel the SAME date again.
    Expect: V1 does NOT get a second credit.

 3. As V1: book another week at Market 2 Test.
    Expect: at checkout the credit from step 1 is applied (the total is reduced by that amount).

 4. As the MANAGER: "Weekly booth bookings" → a PAID one-off row (V2's or V5's from W3) → "Cancel this booking".
    Expect: a box asking for a reason; the confirm button stays disabled until you type one. Type a reason, confirm.
    Expect: the row shows Cancelled and a green line stating the credit — the FULL amount the vendor paid if the week
    hasn't started, or only the remaining declared days if it is in progress. The vendor's bell / email: "The manager
    of Market 2 Test cancelled your booth #N for the week of <date>. … You have a $X credit…".
    Now step to a week of the W4 season and tap "Cancel this booking" on VA's or VB's row.
    Expect: refused with "This week is part of a season purchase. Season bookings settle at season end under the
    refund cap — cancel a market day instead, or settle the season."
    Finally, as the cancelled vendor, open My Bookings.
    Expect: a PAID week shows NO cancel button for the vendor (by design).

 5. Clean up: as the MANAGER, Setup → "Season pre-sales" → the W4 season → "Close pre-sales".
    Expect: the pill no longer says "Pre-sales open".



==================================================
W6 — MANAGER DASHBOARD: WHAT IS LEFT TO RE-CHECK   (Amarillo Community Market · manager login · ~20 min)
===
Most of this dashboard passed on 2026-09-25. These steps re-check only what changed or was not reachable then.
All steps happen on Amarillo's manager dashboard unless a step says otherwise.

 1. The "Action Items" card (the first card). Some lines appear ONLY when something needs fixing, for example
    "<size name> has no booth numbers yet…" with a link "Set numbers →". If you see any such line, tap its link.
    Expect: the page scrolls to the card the link names, and if that card is inside the collapsed "Setup" section,
    Setup opens by itself. If no extra line appears, write "none appeared" (not a failure).

 2. Read the paragraph beginning in bold "How booth numbers work here." on these three cards: "Booth inventory"
    (inside Setup), "Vendors at this market", "Off-platform booth placeholders".
    Expect: the same paragraph on all three, and the sizes read with their numbers in brackets:
    "10x10 (1–10) · 10x15 (11–20)".

 3. The card "Weekly booth bookings" (in "Booths & occupancy"). Look first: does it show a week header with arrows
    (← →)?
    Expect (no bookings): ONE line "No bookings yet. Once vendors book, each week's roster shows up here with the
    booth number each one was given. The week sheet already lists your holds and off-platform booths." followed by a
    link "🖨 Print the week sheet →".
    Expect (has bookings): the same "How booth numbers work here." paragraph as step 2, and in the week header a link
    "🖨 Print this week's sheet"; the week shown on opening is the CURRENT week.

 4. Tap the print link from step 3.
    Expect: a plain page titled "Amarillo Community Market — week sheet". Under the title "(this week)" — or "(next
    week)" if every Amarillo market day this week has already passed. Above the table, in bold, "Market day:" or
    "Market days:" listing each market day WITH its date. Columns: Booth # · Vendor · Size · Status · one column per
    market day (with its date) · "Checked in". Each held number reads "Held · no booking this week"; #1 reads
    "Off-platform"; a ✓ under a day means that vendor attends that day; "Checked in" is blank. "← Previous week" /
    "Next week →" change the week; "Print" shows a preview with only the table; "← Back to the dashboard" returns.

 5. ONLY on an Amarillo market day, with a vendor approved at Amarillo (skip otherwise): as that VENDOR, on the vendor
    dashboard tap "📍 Check in to Amarillo Community Market now" (allow or skip location). As the MANAGER, reload
    the week sheet.
    Expect: in that vendor's row, under today's column, "In <time>". A vendor who checked in but has no booking or
    hold this week still gets a row reading "Checked in · no booking this week".

 6. Open "Setup" → the card "Verification Documents" → the box "What we need from you".
    Expect: each line starts with a small dot (•) or a ✅ — status marks, not tick boxes — and reads "<document> ·
    Requested by the platform · not uploaded yet" (or "· uploaded"); the insurance line reads "Insurance
    self-certification · Requested by the platform · not done yet — the checkbox is below" (or "· done"). Under the
    list: "These are not part of the setup steps above." and "…is already approved — keep them current so the
    platform can verify you if asked." The words "before approving your market" do NOT appear.

 7. "Vendors at this market": pick a vendor with a HOLD (e.g. #7 Texas Honey Co.) who has no paid week → change the
    number dropdown to a free number in the same size → Save. As that VENDOR (ask the owner for the login), check the
    bell / inbox.
    Expect: "Your booth at Amarillo Community Market is now #<new> (was #7). The market manager moved you." Move it
    back to #7 afterwards. (Changing only the size, or approving with a first number, sends no extra message.)



==================================================
W7 — VENDOR LISTINGS AND MARKETS: LIMITS, DOUBLE-BOOKING, HELD-NUMBER RETRY   (~20 min)
===
Before you start (ask the owner): a FREE-tier farmers-market vendor already at 3 traditional markets · a farmers-market
vendor and a food-truck vendor who each have the box "I can staff more than one location at the same time" UNTICKED
on their profile edit page (…/vendor/edit) · a farmers-market vendor with the SAME day and time picked at two markets
(cottagevendor1 had Amarillo and River Road on Saturdays) · a farmers-market vendor with a booth NUMBER held at
Amarillo.

 1. As the 3-market vendor: edit any listing (…/farmers_market/vendor/listings → the listing → Edit) → the market
    list under "Available at".
    Expect: the grey box above the list reads "Your plan allows 3 unique traditional markets across ALL your listings
    (currently using 3 of 3: <the three market names>)." and each of those three markets carries a small grey
    "· counted" after its name.
    a. Tick a market that shows "· counted" and Save. Expect: it saves and the box still says 3 of 3 (already
       counted through another listing — no new slot).
    b. Try to tick a market WITHOUT "· counted". Expect: it cannot be ticked (faded) — a fourth market would exceed
       the plan.

 2. As the farmers-market vendor with the box UNTICKED: Markets page → open a SECOND market that meets on the same
    weekday and overlapping hours as one you already attend → "Set Schedule" → tick that day.
    Expect: refused with a message naming the market you are already at during that time. Tick the box on your
    profile edit page, save, try again. Expect: it succeeds. Repeat once as the food-truck vendor.

 3. As the vendor with the SAME day and time at two markets:
    a. Profile edit page, box UNTICKED. Expect: an amber note under the box "With this box off, you're scheduled in
       two places at the same time:" listing both markets with day and times, and a link "Change your days on your
       Markets page →".
    b. Open one of those two markets' booking page. Expect: under the form a line beginning "You're also scheduled at
       "<the other market>" on <day>s from <time>… You can't be at both." and "Continue to payment" is disabled.
    c. Remove that day at ONE of the two markets (Markets page → the market → Manage Schedule), reload both pages.
       Expect: the amber note is gone and the booking page lets you continue.

 4. As the vendor with a booth NUMBER held at Amarillo: Amarillo's booking page → choose a week → tick the agreement →
    "Continue to payment" → leave Stripe with the browser's Back button. Choose the SAME week again → "Continue to
    payment".
    Expect: a red box "You already started booking this week and it is waiting for payment. Continue the payment
    below." with a "Continue payment" button — NOT "Your assigned booth is already booked for that week…". Tap
    "Continue payment": the same Stripe page.



==================================================
W8 — PLATFORM ADMIN LOOKS UP A VENDOR: TWO ITEMS LEFT   (platform admin login · ~5 min)
===
Before you start (ask the owner): a vendor who sells MARKET BOXES (at least one active box offering) · a farmers-market
vendor who answered "Yes" to event experience and typed something in "Anything Else About Your Event Capabilities?"
under "Private Events Readiness" on their profile edit page.

 1. Vendors admin (…/farmers_market/admin/vendors) → the market-box vendor's row.
    Expect: "📦 N published" AND "🧺 N boxes" (the box count appears only for vendors with active boxes). Write the
    box number down. Open that vendor → Details → "Quick Stats".
    Expect: "Active market boxes" shows the SAME number.

 2. Open the farmers-market vendor → Details → the card "Event Readiness Application".
    Expect: it shows "Do You Have Event or Catering Experience?" reading "Yes — <what they typed>" and "Anything Else
    About Your Event Capabilities?" with their text. (A vendor who left "Anything Else" empty shows no line for it —
    not a failure.)



==================================================
W9 — MARKET BOXES: DATED PICKUP TILE, "MANAGE PICKUPS", PICKUP PROGRESS   (~15 min)
===
BACKGROUND: a "market box" is a subscription a vendor sells — the buyer pays for N pickups of a box.
Before you start: a vendor with a market-box offering whose NEXT pickup date is within 7 days (Look first: if it is
further away, step 1's Expect is the "Nothing to prep" line instead) · a buyer who has bought that box.

 1. As the VENDOR: vendor dashboard → the tile "My Upcoming Pickups".
    Expect: one line per pickup day and location, soonest first, each starting with the day in bold — "Today",
    "Tomorrow", or a date like "Wed, Oct 1" — then the market, then what is due, e.g. "Wed, Oct 1 · Amarillo Community
    Market · 1 market box" (listings read "N items"). At most three lines, then "+N more pickup days in the next 7
    days" if there are more. If nothing is due within 7 days: "Nothing to prep in the next 7 days — prep lists, pick
    tickets & order details show up here for each pickup day."
    Also check once in the EVENING (after 7 PM Central): a pickup due today still reads "Today".

 2. As the VENDOR: the market-box page (…/farmers_market/vendor/market-boxes/[offering id]).
    Expect: tabs "Overview", "Subscribers (N)", "Manage Pickups (N upcoming)". Open "Manage Pickups" — this is where
    a box is marked ready and a pickup completed.

 3. Complete pickup 1: the buyer confirms receipt, the vendor confirms within 30 seconds on "Manage Pickups". Then, as
    the buyer, open the subscription (…/buyer/subscriptions/[id]) and My Orders (…/buyer/orders).
    Expect: BOTH pages show the same progress — 1 of N pickups completed.



==================================================
W10 — MARKET BUNDLES: THREE FRESH ORDERS   (~30 min + a 1-hour wait)
===
BACKGROUND: a "bundle" is a set of items from several vendors that the MARKET MANAGER assembles. The buyer pays once;
each vendor prepares their item; the manager collects, assembles and hands off. The manager works from a "run sheet"
inside the dashboard card "Curated bundles" (Money & activity).
WHY THIS ORDER: order 2 must be cancelled INSIDE its first hour; order 3 needs a vendor to confirm BEFORE its first
hour ends and is cancelled AFTER — so buy order 3, confirm at once, then do order 2 while you wait.
Before you start: a market with an active bundle · a buyer · the bundle's vendors' logins · the manager.

 1. As the BUYER on a PHONE: the market's page → "Market Bundles".
    Expect: nothing spills past the card or screen edge; long text wraps. Screenshot either way.

 2. Order 1: buy the bundle. As each VENDOR, mark your item Ready. As the MANAGER, open the run sheet; for each vendor
    tap "🤝 Receiving now", and have that vendor tap Fulfill within 30 seconds. When all items are collected tap "Ready
    — notify buyer". When the buyer collects, tap "Mark handed off". As the BUYER, open the order (My Orders → the
    order) and tap the yellow acknowledge button.
    Expect: the buyer gets NO notification when vendors confirm or fulfil; a vendor who taps Fulfill BEFORE the
    manager's "Receiving now" sees "Wait for the market manager to tap Receiving now, then tap Fulfill within 30
    seconds." and nothing changes; after "Ready — notify buyer" the buyer gets exactly ONE "ready" notice and exactly
    ONE email naming the bundle, the market and the pickup spot; the order page shows ONLY the yellow bundle
    acknowledge (no green per-item buttons); no "confirm you received it" banner on the orders list; no review pop-up
    after acknowledging; the "order placed" email names the bundle, market and pickup spot.

 3. Order 3 first: buy a fresh bundle and have ONE vendor confirm their item right away. Note the time.
 4. Order 2: buy another fresh bundle and, within its first 60 minutes, open it in My Orders → "Cancel bundle".
    Expect: a full refund, to the cent, on the page and in Stripe.
 5. When more than an hour has passed since order 3: open it → "Cancel bundle".
    Expect: the dialog warns "Cancelling after the first hour or once a vendor has confirmed incurs a 25% cancellation
    fee." The refund is 75% of the item + margin total; the tip is refunded in full.



==================================================
W11 — EVENTS: ONE FRESH SELF-SERVICE EVENT, START TO SHOP   (~45 min)
===
BACKGROUND: an organizer requests a private event; the app invites suitable vendors; vendors ACCEPT with a menu; the
organizer then SELECTS which accepted vendors are in (the rest are backups). Only SELECTED vendors appear to
attendees or take pre-orders. "Accepted" is not "selected".
WHY THIS ORDER: D must accept AFTER the first selection (a "late responder"); a vendor must be dropped BEFORE it can be
re-selected; the booking refusal in step 9 needs a vendor who is accepted AND has the multi-location box unticked.
Before you start: an organizer account · four vendor accounts A, B, C (accept at step 1) and D (accepts ONLY at step
3) · a FREE self-service event (no vendor fee) · one of A/B/C has the multi-location box UNTICKED (step 9).

 1. Create the event and have A, B and C accept. Before selecting anyone, open the PUBLIC event page
    (…/[vertical]/events/[token]), the SHOP (…/events/[token]/shop), and one of A's items (…/listing/[id]).
    Expect: the public page's status reads "Upcoming Event" and says "Vendors Are Still Responding" with NO vendors
    listed; the shop shows no menus; A's item offers no pickup date for the event.

 2. Open the select page (…/events/[token]/select) → select A and B (not C) → remove one item from A's menu → confirm.
    Expect: the public page reads "2 Vendors Attending" and shows only A's and B's menus (A's without the removed
    item); the shop sells A's and B's items, not C's; C's items at C's REGULAR market can still be ordered.

 3. Have D accept now. Reload the public page and the shop.
    Expect: D appears NOWHERE until you select D.

 4. Select page → "Change selections".
    Expect: A and B are pre-ticked, each with "Menu set when you selected this vendor." and NO menu-trimming
    controls; D DOES have trimming controls; C shows a note that backup vendors bring their full menu. Select D,
    remove one of D's items, confirm.
    Expect: D's event page (…/vendor/events/[event market id]) shows "approved N of M" items; the removed item is not
    in the shop. "Change selections" again → D is now locked too.

 5. "Change selections" → untick B → confirm the removal → reload → "Change selections" again.
    Expect: B is NOT listed under "Your vendors are confirmed" and NOT pre-ticked. Select B again on purpose.
    Expect: B gets a NEW "you're selected" notification.

 6. On the confirmed view of the select page, find the backup box (it starts "Short on options?"). Follow it:
    organizer dashboard → Event Details → widen vendor types / preferences / number of vendors → Save → tap "Refresh
    matches".
    Expect: after saving, a "Refresh matches" prompt appears; tapping it reports new invitations sent, or that no new
    vendors qualified.

 7. Organizer dashboard (…/farmers_market/event-manager/[event id]/dashboard) → Event Details; compare with a
    food_trucks event.
    Expect (farmers market): "Product Preferences", "Total Budget", "Budget Per Person", "Expected Number of Buyers",
    "Dietary or Product Requirements", "Other Food or Products at Venue", "Other Vendors Present?", event type
    "Corporate / Workplace Event", examples mentioning produce / baked goods / crafts. Food trucks: unchanged wording.

 8. The menu (Browse) — find one of A's event-selected listings — compare with its listing page.
    Expect: the same Open/Closed pill on both.

 9. As the vendor with the multi-location box UNTICKED (accepted to this event): try to book a park spot or booth for
    the EVENT's date at another location.
    Expect: refused, with a message telling you to withdraw from the event first.

10. Side checks (any event that fits):
    a. Events admin (…/[vertical]/admin/events) → a self-service APPROVED event whose invitations have NOT been sent.
       Expect: "Open Pre-Orders — invitations held" is DISABLED with a tooltip; the Inviting card says invitations
       are held.
    b. (Optional) Force the event to "ready" while invitations are held. Expect: the organizer's progress view says
       nothing is orderable — not "pre-order now".
    c. Have a selected vendor withdraw → open the reconfirm page (…/[vertical]/reconfirm/[token]) as an attendee with
       an order. Expect: all items cancelled → withdrawal wording; some → partial; everything live → the order
       "stands".
    d. Sign up a brand-new vendor, leave them UNAPPROVED, have them submit "Private Events Readiness" → Events admin.
       Expect: that vendor carries a grey badge "not eligible — vendor not yet approved".
    e. On an event WITH a vendor fee: the fee card's "reuse" buttons. Expect: outlined, only as wide as their text,
       over the yellow box — side by side on a desktop, stacked on a phone.
    f. On an invitation-accept form, enter a number of orders LOWER than your profile's default. Expect: an amber
       advisory note under the field.



==================================================
W12 — SURVEY EMAIL   (~10 min + the owner's trigger)
===
There is NO button in the app that sends a survey — surveys are created by the daily job, and staging never runs it
by itself. The OWNER triggers it for this test; you prepare the accounts and read the inbox. (Owner note: the survey
pass inside the job runs only when it is called between 10:00 and 10:59 AM Central, daylight time.)
Before you start — an email goes ONLY to someone who qualifies AND has not already seen the survey in the app:
  · A TRUCK approved at Sixth Street, with days picked there, that was scheduled there during the most recent
    Monday-to-Sunday week — and has NOT opened its vendor dashboard since that Sunday 6:00 PM. (Opening the dashboard
    shows the survey in the app instead of emailing it — that is the rule, not a bug.)
  · A BUYER on their FIRST or SECOND ever purchase who picked up an order at Amarillo yesterday or today — and has NOT
    opened "My surveys" since.

 1. Tell the owner the accounts are ready; the owner runs the job. Then open each inbox.
    Expect (truck's inbox): sender "Food Truck'n", address ending @mail.foodtruckn.app, footer "Sent by Food Truck'n".
    (If the owner says the food-truck mail domain is not yet verified, expect the farmers-market sender instead and
    note it — a configuration finding, not an app bug.)
    Expect (buyer's inbox): sender "Farmers Marketing" from @mail.farmersmarketing.app; footer "Sent by Farmers
    Marketing for Amarillo Community Market".
    Expect (both): EVERY link — the survey button, "see all", unsubscribe — points at the STAGING site (the address
    at the top of this document), never at farmersmarketing.app or foodtruckn.app.
 2. Tap the survey button.
    Expect: the survey form opens on staging for that market and date; submit it. Open the same link again.
    Expect: it says the survey was already submitted (or shows your answers), not a blank form.



==================================================
W13 — PLATFORM ADMIN: SALES-TAX PREPARATION TOOLS   (platform admin login · Amarillo Community Market · ~15 min)
===
BACKGROUND: sales tax is NOT live. You are testing the admin's preparation tools — the list showing which markets still
need Texas tax codes, and the card where codes are entered. No buyer is charged. Use the codes ALREADY on the card —
do not add or remove jurisdiction rows. If the card shows only the TEXAS row, STOP and tell the owner before saving.
WHY THIS ORDER: step 4 deliberately makes the rate quarter stale and then restores it — do not leave it stale.

 1. Markets admin (…/farmers_market/admin/markets) → the dropdown right after "All Types" ("Tax codes: any").
    Expect: choices exactly "Tax codes: any", "Tax: needs attention", "Tax: no codes entered", "Tax: address changed,
    re-verify", "Tax: rate quarter stale", "Tax: ready". Choose "Tax: needs attention".
    Expect: every row carries a chip "tax: no codes", "tax: re-verify" or "tax: stale quarter". Choose "Tax: ready".
    Expect: no row carries a "tax:" chip. Set it back to "Tax codes: any".

 2. Open Amarillo Community Market → the card "Sales tax jurisdictions".
    Expect: a "Rate version" box whose grey placeholder is the current quarter written like "2026-Q3". Clear the box,
    change nothing else, Save.
    Expect: "Saved", and the box now reads the current quarter.

 3. Type   Sept rates   in the Rate version box → Save.
    Expect: REFUSED; the message begins "Rate version must look like" and names the current quarter. Nothing else
    changed.

 4. Type LAST quarter (current 2026-Q3 → type 2026-Q2) → Save.
    Expect: "Saved" AND a warning beginning "Rate version" containing "is not the current quarter". Back on the list,
    Amarillo's row carries "tax: stale quarter". Open the card, put the current quarter back, Save.
    Expect: the chip is gone.

 5. Optional (only if the owner agrees to a test-market address edit): edit a TEST market's zip code → Save.
    Expect: its "Sales tax jurisdictions" card says re-verify and the list shows "tax: re-verify" until the card is
    saved again.

 6. Platform reports (…/admin/reports — the Accounting group is only on the platform page) → "Accounting" → tick
    "Texas List Supplement (Form 01-116)" → any date range → Download.
    Expect: a CSV whose first line is the header "Local Code (Form 01-116 col 2)","Jurisdiction","Level","Rate %",
    "Sales Base","Sales Tax Collected","Refunded Base","Tax Refunded","Rate Correction (owed on old-rate sales; platform
    pays)","Amount Subject to Tax (net)","Tax Due (net)","Taxed Items","Reversal Rows","Rate Version(s) in Period",
    then a TOTAL row of $0.00 and a last row starting PERIOD naming your dates "…America/Chicago (Central)". (An
    empty file or an error IS a finding.)

 7. As the VENDOR Valley Verde Farm: new listing (…/farmers_market/vendor/listings/new) → category "Prepared Foods"
    (the sales-tax box locks to "Sales tax applies to this item") → under "Available at" tick Amarillo Community
    Market (which has no verified codes yet).
    Expect: an amber note under the market list beginning "Heads up — sales tax setup is pending at one of these
    locations." naming Amarillo. Change the category to "Produce" (the box flips to "This item is exempt from sales
    tax"). Expect: the note is gone.

 8. Put the category back to "Prepared Foods", keep Amarillo ticked, fill title / price / quantity, Save.
    Expect: saves normally. As the PLATFORM ADMIN → the bell.
    Expect: "Tax codes needed at Amarillo Community Market — a vendor is waiting". Tap it → the markets admin page
    with Amarillo's edit form open. Save the vendor's listing a second time within the hour.
    Expect: NO second notification (one per market per day).

 9. Platform reports → Accounting → tick "Taxability Anomalies (listing flags vs category)" → Download.
    Expect: a CSV with header "Vertical","Vendor","Listing ID","Listing","Category","Flag Now","Expected","Rule" whose
    last row starts TOTAL and reads "N listing(s) whose flag disagrees with the category rule…"; every listed row's
    Flag Now differs from Expected. Header + a "0 listing(s)…" TOTAL row is a PASS.



==================================================
W14 — SALES-TAX REHEARSAL: ONE SIMULATED MONTH WITH TAX ON   (staging ONLY · Amarillo · ~2 hrs, over a few days is fine)
===
BACKGROUND: the dress rehearsal before real buyers ever pay sales tax. Tax is switched on for STAGING ONLY (production
cannot read that setting). You place a handful of orders and refunds, keeping a tally, and at the end the monthly tax
report must add up to the cent against your tally. Every dollar is Stripe TEST money (card 4242 4242 4242 4242). On the
tally, for each order write the order #, the "Sales tax" line at checkout, and for each refund the amount shown. The
cents below assume Amarillo = TEXAS 6.25% + AMARILLO city 2.00% (8.25%); if the card shows different codes, tell the
owner before going on.

Before you start (the OWNER prepares ALL of these — do not start until each is ticked):
  □ The owner has said "tax is on for staging". Quick proof: as a buyer, a taxable item at Amarillo shows a "Sales tax"
    line at checkout.
  □ Amarillo's "Sales tax jurisdictions" card shows TEXAS AND a city row "AMARILLO", code 2188013, 2 %, Rate version =
    the current quarter (W13 step 4 restored it).
  □ Valley Verde Farm has two PUBLISHED listings at Amarillo: "Rehearsal salsa" — Prepared Foods, $10.00, quantity 10
    ("Sales tax applies to this item") and "Rehearsal tomatoes" — Produce, $10.00, quantity 10 ("This item is exempt
    from sales tax").
  □ Amarillo's next market day is at least 2 days away and the vendor is declared for it.
  □ Logins: buyer B1 · the vendor · the platform admin · a VERTICAL admin (step 9) · the Stripe TEST dashboard (owner).

 1. As B1: "Rehearsal salsa" ×1 → checkout.
    Expect: a "Sales tax" line of $0.88 above the total (the 6.5 % buyer fee is inside the taxed amount: $10.65 × 8.25 %).
    Total $11.68 (items $10.00 · fee $0.65 · Service Fee $0.15 · Sales tax $0.88). Pay.
    Expect: the success page shows $11.68 and "Includes $0.88 sales tax". Tally: order #, tax $0.88.
 2. As B1: "Rehearsal tomatoes" ×1 → checkout. Expect: NO "Sales tax" line; total $10.80. Pay. Tally: tax $0.00.
 3. As B1: BOTH items in one cart. Expect: "Sales tax" $0.88; total $22.48. Pay. Tally: tax $0.88. Open My Orders →
    this order. Expect: a "Sales tax" line of $0.88.
 4. As B1, WITHIN ONE HOUR of placing it: cancel the salsa on order 1.
    Expect: the message ends "Full refund will be processed." and the order page shows a refund of $11.68 for the item.
    Tally: refund $11.68, tax $0.88.
 5. Place a salsa-only order (order 4). As the VENDOR: confirm it. After at least 60 minutes, as B1 cancel the salsa.
    Expect: "A 25% cancellation fee was applied. You will be refunded $8.76." — 75 % of the $10.80 PLUS 75 % of its tax
    (66¢ of 88¢); the order page shows refund $8.76 and a fee of $2.70. Tally: refund $8.76, tax $0.66.
 6. Place a salsa-only order (order 5). As the VENDOR: reject it with any reason.
    Expect: the buyer's order page shows a refund of $11.68. Tally: refund $11.68, tax $0.88.
 7. Place a salsa-only order (order 6). OWNER, Stripe TEST dashboard: Payments → this payment → Refund → FULL. Wait a
    minute.
    Expect: the buyer's order page shows the order refunded. Platform admin → Money → "Tax Reversals": the "Owed" tab
    does NOT list order 6 (a full refund is handled automatically). Tally: refund $11.68, tax $0.88.
 8. Place an order with BOTH items (order 7, $22.48). OWNER, Stripe: Refund → PARTIAL $5.00. Wait a minute.
    Expect: "Tax Reversals" → "Owed" lists order 7 "Dashboard refund of $5.00" with the Stripe refund id, and the nav
    badge reads 1. Tap "Allocate".
    Expect: "Rehearsal salsa" shows "tax paid $0.88 … $0.88 left"; "Rehearsal tomatoes" shows "tax paid $0.00" and
    cannot be ticked. Tick the salsa, choose "50% of it", note "half the salsa returned", tap "Record reversal".
    Expect: "Recorded — $0.44 of tax reversed on the return."; "Owed" now reads "Nothing owed — every dashboard refund
    on a taxed order has been allocated."; the badge is gone; "Resolved" shows order 7 with "Reversed: Rehearsal salsa
    $0.44" and your note. Tally: refund $5.00, tax $0.44.
 9. Confirm order 7's row is under Resolved only (no Allocate button). As a VERTICAL admin (not platform), open
    …/admin/tax-reversals. Expect: "Platform admin access required".
10. Skip — not runnable on staging (the daily order-expiry refund refuses to run outside production; covered by an
    automated test). Write "step 10 skipped" on the tally.
11. Order 3 stays open: as the VENDOR fulfil it on market day, or leave it — it stays a taxed sale either way.
12. THE RECONCILIATION. Platform reports → Accounting → "Texas List Supplement (Form 01-116)" → the rehearsal's
    calendar month → Download.
    Expect: rows for 7000000 TEXAS and 2188013 AMARILLO (plus TOTAL and PERIOD). TOTAL row: "Sales Tax Collected" = the
    sum of every tax figure for orders on the tally; "Tax Refunded" = $0.88 + $0.66 + $0.88 + $0.88 + $0.44 = $3.74; "Tax
    Due (net)" = Collected − Refunded; "Taxed Items" = the number of salsa lines sold; "Reversal Rows" = the number of
    refunds that reversed tax; PERIOD names the month "America/Chicago (Central)". TEXAS row "Sales Base" = $10.65 ×
    salsa lines; AMARILLO row the same base at "Rate %" 2. Any cent of difference IS a finding — write both numbers.
13. (OWNER) The quarter-refresh job on staging. Expect: JSON with "fetchOk": true, "fileQuarter" = the Comptroller's
    current quarter, Amarillo counted under "markets".

When W14 passes end to end, tax goes to production ONLY on the registration effective date, by the owner's word, after
the production markets carry their real codes. To end the rehearsal the owner removes the staging setting and
redeploys; staging is dark again.



NOT RUNNABLE YET — nothing for you to do
===
• Event money on cancellation / de-selection — needs an event with a PAID vendor fee on staging.
• "Protocol v6 remainder" (buyer items + weekly survey · onboarding copy · manager new-email invite and resend ·
  farmers-market mirror · print chrome) — steps still being rewritten.
• Sales tax on refunds and the admin "Tax Reversals" page — dark until W14.
• Two production-only checks (stock decrement at checkout; payout timing) — wait for a real vendor with Stripe on
  production.





============================================================================================================
APPENDIX — FOR CLAUDE'S BOOKKEEPING ONLY. Testers: stop reading here.
============================================================================================================
Registry rows satisfied by each step (a step may cover several rows; a row may span steps):
W1  1→TR-133 TR-138 · 2→TR-136(unlock rule) TR-137 · 3→TR-137 · 4→TR-136 · 5→TR-107 TR-140 · 6→TR-107 TR-140
    · 7→TR-133 · 8→TR-109(regression only — passed 09-27) · 9→TR-140 · 10→TR-043 TR-137(Pay now) · 11→TR-133 · 12→TR-136
W2  1→TR-134 · 2→TR-135 · 3→TR-134 · 4→TR-139 · 5→TR-134
W3  1→TR-119 · 2→TR-083 TR-086 · 3→TR-117 · 4→TR-119 TR-084 TR-133(FM) TR-086 · 5→TR-119 TR-085 TR-133(FM)
    · 6→TR-087 TR-086 TR-121 TR-075 · 7→TR-118 · 8→TR-118 · 9→TR-118 · 10→TR-119 TR-121 TR-075 TR-089 TR-072
    · 11→TR-118 TR-088(part 1) TR-082 · 12→TR-088(part 2)
W4  1→TR-122 · 2→TR-079 (setup) · 3→TR-122 TR-079 · 4→TR-079 · 5→TR-079 · 6→TR-079 · 7→(W5 closes it)
W5  1→TR-091 TR-099 · 2→TR-091 · 3→TR-091 · 4→TR-092 · 5→TR-122
W6  1→TR-105 TR-106 · 2→TR-101 · 3→TR-101 TR-108 TR-120 · 4→TR-108 TR-120 · 5→TR-120 · 6→TR-124 · 7→TR-090
W7  1→TR-069 · 2→TR-044 · 3→TR-044 · 4→TR-123
W8  1→TR-096 (boxes half) · 2→TR-094 (two FM questions)
W9  1→TR-015 TR-125 · 2→TR-125 · 3→TR-014
W10 1→TR-010 · 2→TR-001 TR-005 · 3–5→TR-002 TR-003
W11 1→TR-022 TR-064 · 2→TR-022 TR-064 · 3→TR-022 · 4→TR-065 · 5→TR-066 · 6→TR-067 · 7→TR-068 · 8→TR-026
    · 9→TR-025 · 10a→TR-023 · 10b→TR-024 · 10c→TR-030 · 10d→TR-032 · 10e→TR-033 · 10f→TR-035
W12 1→TR-041 · 2→TR-041
W13 1→TR-112 · 2→TR-110 · 3→TR-110 · 4→TR-110 TR-112 · 5→TR-111 · 6→TR-113 · 7→TR-114 · 8→TR-115 · 9→TR-132
W14 1–3→TR-129 · 4→TR-126 · 5→TR-126 (Q1) · 6→TR-126 · 7→TR-126 (dashboard full) · 8→TR-127 · 9→TR-127
    · 10→skipped (cron never runs on non-production; route-tested) · 12→TR-113 TR-130 · 13→TR-116
    (cents: $10.00 taxable at 8.25 % on the fee-inclusive base $10.65 → 67¢ + 21¢ = 88¢; full refund $11.68; 25 %-fee
    refund $8.10 + 66¢ = $8.76)
Passed and removed in 4.0: TR-034 TR-040 TR-042 TR-048 TR-109 (OB-034) · TR-100 TR-121 TR-078 TR-097 TR-103 TR-081
TR-071 TR-073 TR-074 TR-093 TR-095 TR-016 TR-004 TR-006 TR-007 TR-008 TR-009 TR-011 TR-012 TR-013 TR-045 TR-046
TR-047 TR-063 (earlier rounds). Not runnable: TR-028 TR-029 TR-031 TR-060 TR-062; design question open: TR-070;
deferred: TR-049 TR-050.
Wording: every quoted string in W1, W2 and the 2026-09-27 additions was read from the code on 2026-09-27
(ApplyToMarketButton, page.tsx market header, BookParkSpotForm, park-bookings page, ManagerActionSummary,
VendorBoothList, PendingMarketInvitations, FtParkDashboardBody, StandingReservationsCard, ParkSpotsManager,
week-strip.ts, AddToCartButton, CutoffBadge, browse/page.tsx, VendorsWithLocation, en.ts/es.ts, surveys/email.ts).
Older workflows keep the strings verified on 2026-09-22/25. Phrased as meaning, not quotation: W3.5 approval
message, W5 result-line numbers, W7.2 conflict message, W11.4 backup note, W11.6 prompt text, W9.3 progress phrase.
