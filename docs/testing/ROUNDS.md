STAGING TEST ROUNDS
Written 2026-10-09 from the state of staging on that day (build fbf26467). Rounds 1–3 were reported on 2026-10-10
(OB-035/036/037) and are kept below for reference; Round 7 redoes the two steps a sheet mistake made impossible. One round = one sitting of about
20–30 minutes. Do the rounds in any order unless a round says "do this after Round N". Nothing needs setting
up: every step names the account to use. Ask the owner for passwords.

Staging site: https://inpersonmarketplace-git-staging-tsjr00s-projects.vercel.app
Before you start a round, hard-refresh the page once (Ctrl+F5 on Windows, Cmd+Shift+R on Mac).
Test card for any payment: 4242 4242 4242 4242, any future date, any CVC. No real money moves.

HOW TO REPORT
Send one message per round, in your own words, one line per step:
    Round 1 step 1: fine
    Round 1 step 2: the dropdown only said "Loading…" and never filled in   (what you actually saw)
    Round 1 step 3: couldn't — the Pay button was greyed out, so I stopped there
"Couldn't" is not a failure; write why and go on to the next step if the next step still makes sense.
Screenshots help. You never have to decide how serious something is.

WORDS
  Vendor / truck ..... someone who sells. A truck is a food-truck vendor.
  Manager / operator . the person who runs a market; at a food-truck park the app calls them the park operator.
  Markets page ....... the vendor's page titled "My Locations" (web address …/vendor/markets).
  Manager dashboard .. Market Manager → your market.
  Action Items ....... the first card on the manager dashboard.
  Hold ............... a spot or booth number reserved for a vendor who has not paid for it yet.


==================================================================================================
ROUND 1 — A FOOD TRUCK JOINS A PARK AND ASKS FOR A WEEKLY SPOT   (Sixth Street Food Park · ~25 min)
==================================================================================================
✅ DONE — reported 2026-10-10. Do not redo. Steps 1, 2, 3, 5 passed. Step 4 (the weekly hold) moved to Round 7.
   Fixes built from this round, waiting in the RETEST QUEUE at the bottom: the apply-dialog wording, "Spot spot 1".
You will use two trucks. Log out between them.
  Truck 4 Mojo ......... foodtrucknapp+truck4@gmail.com   (has never applied to Sixth Street)
  Smokestack BBQ ....... foodtrucknapp+truck2@gmail.com   (approved at Sixth Street, has never paid for a day there)

 1. Log in as Truck 4 Mojo. Open the Sixth Street Food Park page (Markets → Sixth Street Food Park).
    You should see: a red button "Apply now" next to the park's name (food-truck pages use red). Tap it.
    You should see: a form titled "Apply to Market" with a note box, the park's agreement and a tick box about
    sharing your documents. There is no "Booth size" question. Tick "I agree" and tap "Submit Application".
    You should see: the page reloads and the red button has become a small grey label "Applied".
    Then open your vendor dashboard and find the card "Locations & Schedule".
    You should see: the small button at the card's top-right says "Manage".

 2. Log in as Smokestack BBQ. Open the Sixth Street page and tap the red "Book now" button.
    You should see: the booking page, with two tabs: "Book a day" and "Weekly hold". Tap "Weekly hold" first.
    You should see: a dashed box saying "Weekly holds unlock after your first paid booking here. Book a day on the
    Book a day tab first…". That is correct — you have not paid for a day yet.
    Now tap "Book a day". Pick SPOT A (the only spot that allows weekly holds), choose "Single day", choose the FIRST
    Friday offered, tick the agreement
    and the compliance tick box, tap "Book & pay at Sixth Street Food Park", and pay with the test card.
    You should see: you land on a page titled "My park bookings". Under the intro, a red button "Book again at
    Sixth Street Food Park →" and a link "Find another park →". Under "Upcoming", the Friday you paid for marked
    "Paid" with the amount. If it still says "Pending payment", wait a minute and reload.
    Write down the spot you picked and the Friday's date — Round 2 uses them.

 3. Still as Smokestack BBQ: go back to the booking page, pick SPOT A again, and open the "Weekly hold" tab.
    You should see: the tab is now open — a box "Request a weekly hold" with "Day of week" and "Starting" dropdowns.
    Choose Friday, leave the start date as offered, tap "Request weekly hold".
    You should see: "✓ Requested — the park operator will review it."
    Open "My park bookings" again.
    You should see: a section "Your weekly holds" with one row "Sixth Street Food Park · <your spot> · every
    Friday" and a yellow "Pending review" pill.

 4. Still as Smokestack BBQ: try to request the same hold again (same spot, Friday, any start date).
    You should see: it is refused with a sentence beginning "You've already requested this spot on this day —
    it's pending the operator's review." That is correct.

 5. Still as Smokestack BBQ: open your Markets page and look at the strip at the top, "Your next two weeks".
    You should see: the Friday you paid for reads "Sixth Street Food Park · <hours> booked".

That is the end of Round 1. Report, then Round 2 can run (same day or another day).


==================================================================================================
ROUND 2 — THE OPERATOR DEALS WITH THE TRUCKS   (Sixth Street Food Park · do this after Round 1 · ~20 min)
==================================================================================================
✅ DONE — reported 2026-10-10. Do not redo. Steps 1, 2, 3, 5 passed (after a reload). Step 4 (held weekday) moved to Round 7.
   Fixes built from this round, waiting in the RETEST QUEUE: Action Items updating by itself, the "has already booked" clause,
   the red "My Locations" heading.
Accounts:
  Park operator ........ foodtrucknapp+parkmgr1@gmail.com
  Drink Wagon .......... foodtrucknapp+truck9@gmail.com   (a truck the operator will invite)
  Truck 4 Mojo ......... foodtrucknapp+truck4@gmail.com   (applied in Round 1)
  Bao Down ............. foodtrucknapp+truck3@gmail.com   (another approved truck)

 1. Log in as the park operator. Open the manager dashboard for Sixth Street Food Park. Scroll to the group
    "Your trucks", open the "Invite" tab, and invite Drink Wagon. Do NOT answer the invitation as Drink Wagon yet.
    Now scroll back up to the first card, "Action Items".
    You should see (without reloading — the card updates by itself after the invitation): three lines, each with a link —
       "1 food truck pending your approval." with "Review →"                                  (Truck 4 Mojo)
       "1 invited food truck hasn't answered yet." with "See who →"                            (Drink Wagon)
       "1 recurring-hold request is waiting for your yes or no (Recurring holds tab)." with "Decide →" (Smokestack)
    Tap any of the links.
    You should see: the page scrolls to "Your trucks". On its "Your trucks & approvals" tab the small filters
    above the list say "Pending approval (1)" and "Invited (1)"; Drink Wagon's row says "📤 Waiting on food truck
    response". Scroll to the very bottom of the page.
    You should see: the last section is titled "Communication & insights".

 2. Still as the operator, on "Your trucks & approvals": find Truck 4 Mojo and tap "Approve". Then open the
    "Recurring holds" tab and tap "Approve" on Smokestack BBQ's Friday request.
    You should see: "Action Items" now shows ONE line only — "1 invited food truck hasn't answered yet." The
    "pending your approval" line is gone.

 3. Log in as Truck 4 Mojo. Open the Sixth Street page.
    You should see: the grey "Applied" label is gone; a red button "Book now" sits next to the park's name. Tap it.
    You should see: the booking page, titled "Book a spot at Sixth Street Food Park".

 4. Log in as Bao Down. Open the Sixth Street booking page, "Book a day", and pick the spot Smokestack BBQ chose
    in Round 1.
    You should see: that spot's card has the line "Held on Fridays — recurring truck"; in the day list every
    Friday is greyed with "— held by a recurring truck", and under the list: "Held days open to other trucks only
    if the recurring truck doesn't pay by the Thursday before."
    Now try to get round it: pick a different spot, switch to "Prepay a week", choose a week that contains a
    Friday, switch the spot back to Smokestack's spot, and tap "Book & pay…".
    You should see: it is refused — "<spot> is held by a recurring truck on Fridays. It opens to other trucks only
    if they don't pay by the <date> cutoff — check back after that, or pick another spot." Nothing is charged.

 5. Log in as Drink Wagon. Open your Markets page.
    You should see: near the top, an invitation card for Sixth Street Food Park with "Accept" and "Decline". Tap
    "Decline". Then log in as the operator again and reload the dashboard.
    You should see: "Action Items" says "Nothing needs you right now — truck approvals and recurring-hold requests
    show up here." On "Your trucks & approvals", tap the "All" filter: Drink Wagon's row says "❌ Declined the
    invitation" and Drink Wagon is not counted under "Pending approval" or "Invited".

That is the end of Round 2.


==================================================================================================
ROUND 3 — A SHOPPER ON THE FOOD-TRUCK MENU   (~15 min, any buyer login)
==================================================================================================
✅ DONE — reported 2026-10-10. Do not redo. All five steps passed. "Food Trucks" in the Spanish menu stays as it is (owner).
Account: any buyer login (ask the owner), or your own buyer account on staging.

 1. Open the food-truck menu (Browse; web address …/food_trucks/browse). Find a listing card from Fuego Street
    Tacos (that truck sells at three places).
    You should see: under the price, "N pickup locations", spelled exactly like that. (A listing sold at one
    place shows the place's name instead — that is fine.)

 2. Find any listing card that does NOT have a red "Closed" pill, tap it, and look at the order section.
    You should see: two boxes outlined in red, "1. Available Pickup Options" and "2." (choose the location).
    Pick a location.
    You should see: a third red-outlined box appears, "3. Select a Pickup Time:" with a dropdown "Choose a pickup
    time...", and the Add to Cart box under it is now labelled "4.".

 3. Open the "Food Trucks" page (…/food_trucks/vendors). Find a truck card whose list of places is cut short.
    You should see: the list ends with "+1 more location" when one is hidden, or "+N more locations" when several
    are. If no card is cut short, write "none were cut short" and move on.

 4. Back on the menu, find a listing card WITH a red "Closed" pill (top-right of the card) and note the truck's name.
    Open the "Food Trucks" page, open that truck's profile, and scroll down to its listings.
    You should see: the same red "Closed" pill on the same cards, top-right over the picture. Then open the
    profile of a truck whose cards had no pill: no pill there either.

 5. Open Settings (…/food_trucks/settings) and switch the language to Spanish. Reload the menu and the Food
    Trucks page.
    You should see: Fuego Street Tacos' card reads "N ubicaciones de recogida"; a cut-short card reads
    "+1 ubicación más" or "+N ubicaciones más". Switch the language back to English.

That is the end of Round 3.


==================================================================================================
ROUND 4 — A FARMERS-MARKET VENDOR JOINS A MARKET THAT HAS A MANAGER   (River Road Farmers Market · ~30 min)
==================================================================================================
✅ DONE — reported 2026-10-11. Do not redo. Steps 1–5 passed. Step 6: the sheet was wrong, not the app — at a farmers market
   the manager's approval declares your market day for you (River Road = Saturday), so there is no "pick your days" box
   and the card already reads "Manage Schedule ✓ · 3 NEXT: Book a Booth Space". Abuela's Kitchen is now approved at River
   Road with Saturday declared and nothing paid — Round 5 starts there. River Road stays off the public Markets list until
   a vendor there has paid for a week (by design); its page is …/farmers_market/markets/<River Road id>.
Accounts:
  Abuela's Kitchen ..... farmersmarketingapp+cottagevendor2@gmail.com   (has never been at River Road)
  River Road manager ... farmersmarketingapp+marketmng1@gmail.com

 1. Log in as Abuela's Kitchen. Open your Markets page (…/farmers_market/vendor/markets).
    You should see: your home market is not open on arrival; in the list it carries a small blue "🏠 Home Market"
    badge on a light-blue row. Tick River Road Farmers Market to open its card.
    You should see on River Road's card: an amber note "This market reviews vendors first: apply from its page
    (step 1), then set your schedule." and five numbered buttons, left to right: "1 NEXT: Apply" (the only filled
    one) · "2 Set Schedule" · "3 Book a Booth Space" · "4 Manage Listings" · "5 📋 Prep Sheet".

 2. On River Road's card tap "Set Schedule" and tick any day.
    You should see: a red box headed "Manager approval needed": "River Road Farmers Market reviews vendor
    applications. Apply from the market's page — the manager will be notified and you'll be able to set your
    schedule once approved."
    Then open River Road's booking page (the market's page → the top button; or …/farmers_market/markets/[River
    Road id]/book).
    You should see: no booking form — a page headed "Apply to River Road Farmers Market first" with a button
    "Apply at River Road Farmers Market".

 3. Open one of your listings (…/farmers_market/vendor/listings → a listing → Edit), tick River Road Farmers
    Market under "Available at", and Save. Back on the Markets page, open River Road's card.
    You should see: the second button still says "Set Schedule" (not "Manage Schedule") and the amber note still
    asks you to apply first. Saving a listing must not pick market days for you at a market that has a manager.

 4. Tap "1 NEXT: Apply". On River Road's market page tap the blue "Apply now" button.
    You should see: a form "Apply to Market" with a "Booth size you'd like" dropdown listing the tent sizes with
    weekly prices; "Submit Application" stays disabled until you pick a size AND tick "I agree". Pick a size, tick,
    submit.
    You should see: the button becomes a small label "Applied". Back on the Markets page, River Road's card reads
    "Your application is with the manager — you'll pick your days here once they approve you."; the first button
    reads "Application sent" and no button says NEXT. Open the booking page again.
    You should see: "Your application to River Road Farmers Market is with the manager" with a button "Back to
    River Road Farmers Market".

 5. Log in as the River Road manager. Manager dashboard → the card "Vendors at this market" → Abuela's Kitchen's
    pending row.
    You should see: "Requested: <the size you picked>", a size dropdown pre-set to it, a booth-number dropdown and
    a note field beside "Approve". Leave the number blank, type a short note, tap "Approve".
    You should see: "✓ Approved" on the row.
    Log in as Abuela's Kitchen again, open the Markets page and River Road's card.
    You should see: the first button shows ✓ and reads "Apply"; the filled button is now "2 NEXT: Set Schedule".
    On River Road's market page the "Applied" label has become a blue button "Book now". In your bell (or email):
    an approval message that names the booth size and carries the manager's note.

 6. Still as Abuela's Kitchen, with no days picked yet: tap "Book now".
    You should see: an amber box "First, pick the days you attend River Road Farmers Market" with weekday toggles
    above the form, and "Continue to payment" is disabled. Tick Saturday and tap "Done — continue to booking".
    You should see: the form unlocks; the booth-size dropdown is locked to the size the manager approved, with a
    "set by the manager" note. Stop here — do not pay. Round 5 continues from this point.

That is the end of Round 4.


==================================================================================================
ROUND 5 — THE SAME VENDOR PAYS FOR A WEEK   (River Road Farmers Market · do this after Round 4 · ~20 min)
==================================================================================================
Accounts: Abuela's Kitchen and the River Road manager (as in Round 4).
Desk-checked against the code 2026-10-16 (staging ff0cb0d8): step 1 week wording, step 3 where the booth number
shows, step 5 Setup is collapsed + the public list's 10-minute cache.
Look first, as anyone, logged out: open the public markets list (…/farmers_market/markets). Is River Road
Farmers Market listed? Write down yes or no — step 5 depends on it.

 1. Log in as Abuela's Kitchen. Open River Road's booking page (market page → "Book now"). In the "Week" dropdown
    keep the FIRST week offered — it starts on the coming Sunday. The dropdown never offers the week already under
    way, so this Saturday is not bookable; that is how the code works today, not something to report. Tick the
    agreement, tap "Continue to payment". On the Stripe page do NOT pay — use the browser's Back button.
    If instead a red box says "No <size> booth is available for the week of … — try another size or week, or
    contact the market manager": River Road's booth numbers are not set up for your size. Stop and report — the
    rest of this round cannot run.
    You should see: a yellow box "You stepped away from payment" saying no charge was made and the payment page
    stays open for up to 24 hours, with a "Continue payment" button. Tap it.
    You should see: the SAME Stripe page, same amount. Use Back again.

 2. On the booking page, choose the SAME week again and tap "Continue to payment".
    You should see: a red box "You already started booking this week and it is waiting for payment. Continue the
    payment below." with a "Continue payment" button under it.

 3. Open My Bookings (…/farmers_market/vendor/bookings).
    You should see: River Road's row reads "Week of <date> · <size> · Booth <number>" with a yellow "Pending
    payment" pill and a "Continue payment" button. Write the booth number down NOW — it is assigned when the
    booking is started, not when it is paid. Tap "Continue payment" and pay with the test card.
    You should see: you land back on the booking page with "✓ Payment received". Its text says the manager will
    reach out with a booth number — that sentence is out of date (you already have one); note it, it is not a
    failure. Open My Bookings again: the row's pill now reads "Paid" (if still "Pending payment", wait a minute
    and reload).

 4. Open the Markets page and River Road's card.
    You should see: buttons 1 to 4 show ✓ and no button says NEXT. (If "3 NEXT: Book a Booth Space" is still the
    filled button, the payment is still being confirmed — wait a minute and reload.)

 5. Log in as the River Road manager. "Vendors at this market" → Abuela's Kitchen's row.
    You should see: the size and number dropdowns look greyed (grey background; the pointer shows "not allowed")
    with "Locked — paid week on file. The number changes only after a missed week, or if you cancel the paid week."
    under them; the amber "no paid week yet" note that other unpaid vendors' rows carry is gone from this row.
    Only if River Road was NOT listed publicly before this round: directly under "Action Items" there should now
    be no amber "Your market isn't visible to buyers yet" card. Open the "Setup" section (it is collapsed once
    onboarding is complete) — at its bottom, a green "✓ Your market is visible to buyers". Log out and check the
    public markets list again: River Road is listed now. The public list is cached for 10 minutes — if it is not
    there yet, check once more after 10 minutes before reporting it.

That is the end of Round 5.


==================================================================================================
ROUND 6 — ONE VENDOR, TWO MARKETS ON THE SAME SATURDAY   (Canyon · Lubbock · River Road · ~25 min)
==================================================================================================
Accounts:
  Desert Bloom Art & Garden ... farmersmarketingapp+artgvendor@gmail.com
      (profile box "I can staff more than one location at the same time" is UNTICKED; sells at two markets)
  River Road manager .......... farmersmarketingapp+marketmng1@gmail.com
The two markets without a manager that both meet on Saturday morning are Canyon Farmers Market (8–1) and
Lubbock Saturday Market (7–12). Desert Bloom is already at one of them on Saturday; the steps say "the other one".
Desk-checked against the code 2026-10-16 (staging ff0cb0d8): the refusal wording in steps 2 and 5 is the app's,
not the database's; step 4 needs migration 262 on Staging.
Check first: migration 262 (approval skips a conflicting day) must be applied on Staging — step 4 fails without
it. If you are not sure, run step 4 anyway: a red error mentioning "Schedule conflict" on Approve means 262 is
not there (that is the known TR-145 bug, not a new finding) — stop and report.

 1. Log in as Desert Bloom. Open your profile edit page (…/farmers_market/vendor/edit) and find the box "I can
    staff more than one location at the same time".
    You should see: it is unticked. Leave it unticked. Open the Markets page and write down which market(s) show
    Saturday ticked for you.

 2. On the Markets page, open the OTHER Saturday market (Canyon or Lubbock, whichever you are not yet at on
    Saturday) → "Set Schedule" → tick Saturday.
    You should see: a red box headed "Schedule Conflict" that names the market you are already at during that
    time: "Schedule conflict: you're already at "<market>" on Saturdays from <hours>. Deactivate that schedule
    first to add this one." The Saturday tick does not stick.

 3. Create a new listing (…/farmers_market/vendor/listings/new): any title, price and quantity; under "Available
    at" tick that same OTHER Saturday market; Save.
    You should see: the listing saves and you land on its edit page with an amber note at the top beginning
    "Saved. This day was not added: Saturday at <that market> because you're already at <your market> then." Open
    the Markets page: the other market shows no Saturday for you. Edit the listing and Save again.
    You should see: the listings page opens with the same amber note, once.

 4. Open River Road Farmers Market's page and tap "Apply now"; pick any size, tick "I agree", submit.
    Log in as the River Road manager. "Vendors at this market" → Desert Bloom's pending row → tap "Approve".
    You should see: the approval SUCCEEDS — "✓ Approved" and, under it, a line beginning "Saturday (already at
    <market> that day) was not added: the vendor is scheduled at another market at that time…". No error.
    Log in as Desert Bloom. Check your bell (or email).
    You should see: "You're approved at River Road Farmers Market" ending with the same Saturday sentence and
    telling you to free the other schedule or tick the profile box. On the Markets page, River Road's card shows no
    Saturday for you.

 5. Still as Desert Bloom: Markets page → River Road → "Set Schedule" → tick Saturday.
    You should see: the same red "Schedule Conflict" box as step 2 ("Schedule conflict: you're already at
    "<market>" on Saturdays from <hours>. Deactivate that schedule first to add this one.") — the rule still
    holds; only the manager's approval no longer fails because of it.
    Finally: profile edit page → tick the box "I can staff more than one location at the same time" → Save → back
    to River Road → tick Saturday.
    You should see: it succeeds. Untick the box again afterwards and Save.

That is the end of Round 6.


==================================================================================================
ROUND 7 — THE WEEKLY HOLD, DONE RIGHT   (Sixth Street Food Park · ~20 min)
==================================================================================================
Round 1 sent Smokestack BBQ to a spot that does not allow weekly holds, so the hold was never requested. This round
redoes just that part on Spot A, then lets the operator approve it and another truck run into it.
Accounts: Smokestack BBQ (foodtrucknapp+truck2@gmail.com) · park operator (foodtrucknapp+parkmgr1@gmail.com) ·
Bao Down (foodtrucknapp+truck3@gmail.com).
Desk-checked against the code 2026-10-16 (staging ff0cb0d8): all five steps match; step 4 names the two tick
boxes, step 5 says what to do if Round 1's Friday has already passed.

 1. Log in as Smokestack BBQ. Open the Sixth Street booking page (market page → "Book now"). Pick SPOT A, open
    the "Weekly hold" tab.
    You should see: because you have already paid for a day at this park, the tab is open — a box "Request a weekly
    hold" with "Day of week" and "Starting" dropdowns. (If instead it says weekly holds unlock after your first paid
    booking, write that down and stop — that would be a real finding.)
    Choose Friday, leave the start date as offered, tap "Request weekly hold".
    You should see: "✓ Requested — the park operator will review it."

 2. Still as Smokestack BBQ: open "My park bookings".
    You should see: a section "Your weekly holds" with one row "Sixth Street Food Park · Spot A · every Friday" and
    a yellow "Pending review" pill. Go back and request the same hold again (Spot A, Friday).
    You should see: refused with a sentence beginning "You've already requested this spot on this day — it's pending
    the operator's review."

 3. Log in as the park operator. Manager dashboard → reload the page → "Action Items".
    You should see: a line "1 recurring-hold request is waiting for your yes or no (Recurring holds tab)." with
    "Decide →". Open the "Recurring holds" tab (card "Recurring spot holds") and tap "Approve" on Smokestack BBQ's
    Friday request. Reload the page.
    You should see: that line is gone from Action Items.

 4. Log in as Bao Down. Open the Sixth Street booking page, "Book a day", and pick Spot A.
    You should see: Spot A's card has the line "Held on Fridays — recurring truck"; in the day list every Friday is
    greyed with "— held by a recurring truck"; under the list: "Held days open to other trucks only if the recurring
    truck doesn't pay by the Thursday before." Now switch to "Prepay a week" and pick a DIFFERENT spot.
    You should see: the week rows are all selectable. Choose a week that contains a Friday, then switch the spot
    back to Spot A.
    You should see: that week's row goes grey with "· <Friday's date> is held by a recurring truck — pick another
    spot for this week", but it stays selected. Tick the agreement and the compliance tick box and tap "Book &
    pay…".
    You should see: a red message — "Spot A is held by a recurring truck on Fridays. It opens to other trucks only
    if they don't pay by the <date> cutoff — check back after that, or pick another spot." Nothing is charged.

 5. Log in as Smokestack BBQ. Open the Markets page → the strip "Your next two weeks".
    You should see: every Friday in the strip shows Sixth Street Food Park. A Friday more than 7 days away carries
    "Standing spot hold — the pay-by window opens within 7 days of the date". A Friday within 7 days carries either
    that same note or "Pay by <date> to keep your spot" — both are right (the pay-by version appears only after the
    nightly sweep has run, and on staging that sweep runs only when triggered by hand). The Friday you paid for in
    Round 1 shows "booked" with "Your standing hold" — skip this last check if that Friday has already passed.

That is the end of Round 7.


==================================================================================================
COMING ROUNDS (written once the rounds above are reported)
==================================================================================================
  Round 8  — Amarillo Community Market: the manager's dashboard, the week sheet, moving a held booth number.
  Round 9  — Market 2 Test: a season, two vendors buy it, the manager cancels a market day and a paid week.
  Round 10 — A shopper's market box (Sweet Rise Bakery's "wonk" box at Amarillo has one subscriber).
  Round 11 — Platform admin: the sales-tax preparation tools and the two reports.
  Round 12 — A fresh private event, start to shop.
  Round 13 — The dashboards' new icons (any login; a look-and-tell round).
  Round 14 — Market bundles (needs a fresh bundle with a future pickup date — the owner creates one).

==================================================================================================
RETEST QUEUE — fixes built after a round, to be folded into a later round (the owner says when to compile it)
==================================================================================================
Not a round yet. Each line becomes one step in a future round once the fix is on staging. Passed items are never retested.
  From Round 1 (2026-10-10):
    • Apply dialog wording — the note paragraph starts "Tell the food park manager why you want to set up & sell here…" and
      the tick-box line ends "…for the park manager to review your necessary documents." (Truck 4 Mojo is now approved,
      so use a truck that has never applied, e.g. Drink Wagon after declining, or any FM vendor for the market wording.)  [TR-149]
    • Booking a spot and day you already hold refuses with "SPOT 1 is already booked…" — one "spot", not "Spot spot".  [TR-150]
  From Round 2 (2026-10-10):
    • Action Items updates by itself after "Sent 1 invitation" and after approving a truck — no reload.  [TR-152]
    • The pending-approval line says "— N has already booked this week" only when a not-yet-approved truck really paid
      for a day this week; otherwise the line is just "1 food truck pending your approval."  [TR-153]
    • Vendor Markets page ("My Locations") heading is red on the food-truck site.  [TR-154]
  Tracked, nothing to retest: page speed after applying / before Stripe (~3 s) — measured only, no change made.  [TR-151]
