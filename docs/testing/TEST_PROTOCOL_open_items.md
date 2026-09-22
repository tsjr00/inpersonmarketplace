STAGING TEST WORKFLOWS — READY TO RUN
Regenerated 2026-09-21 from the Test Registry (docs/testing/TEST_REGISTRY.md) as WORKFLOWS (owner 2026-09-21:
"design a workflow test that would cover multiple items at once"). Plain text: paste into Word as-is.
Staging: https://inpersonmarketplace-git-staging-tsjr00s-projects.vercel.app  — build 2c507430 (2026-09-21).
Migrations 256 + 257 + 258 are on Staging. Hard-refresh after any new deploy.

HOW THIS WORKS
* Each workflow (W1, W2, …) is one role's real sequence of work. Run it top to bottom in one sitting. Each step has
  ONE "Expect" line. The small TR-tags after a step are for Claude's bookkeeping — ignore them.
* Report ONE of three things, per workflow, in your own words:
    "W2 pass"
    "W2 step 6: the picker showed no numbers"      ← what you saw; keep going if you can
    "W2 step 6 skipped: no pending applicant"      ← couldn't do it; not a failure
  Claude maps your report onto the registry (which tests passed, which failed, which are untested) and asks only
  where something is unclear. Screenshots help. Do not rate severity.
* SETUP lines at the top of a workflow list the test data it needs. Create that data once, then run the workflow.
* "Where" lines name the page, then the card or section title, then the widget. Replace [vertical] with
  farmers_market or food_trucks; replace [id] with the market's id from its dashboard URL.

STATE OF THE TEST MARKETS (2026-09-21)
  Amarillo Community Market   charging · numbered 1–10 (10x10) / 11–20 (10x15) · six pins + placeholder #1    ← W1
  Market 2 Test               charging · numbered 1–5 small / 6–15 medium / 16–20 large · pin #7, placeholder #1  ← W2, W3
  Westgate mall (lowercase)   charging · numbered 1–10 Small / 11–15 Large · placeholders #1, #15               ← spare
  River Road                  charging · Small Tent 4–13 / Medium Tent 14–23 / Large Tent list 1, Booth 2, 3, 24, 25
  Westgate Mall (capital M)   numbered by hand 2026-09-21 (TR-100 passed there)                                ← spare
  Space Camp Musicians        lettered A1–A5 / B1–B10 / C1–C20 · placeholder A1                                ← spare
  Sixth Street Food Park      food trucks — spots, not booths                                                  ← W4
  Every one of these is a MANAGED market: a vendor with no history there must Apply and be approved before
  picking days or booking (rule since 2026-09-19).

WORKFLOWS
  W1  Manager runs a charging market's dashboard, booth numbers, roster and week sheet   (Amarillo · ~40 min)
  W2  Vendor applies, is approved, books and pays a week; the number becomes theirs      (Market 2 Test · ~60 min)
  W3  Manager cancels a market day and a paid week — credits and notices                 (Market 2 Test · ~20 min)
  W4  Food-truck park: operator Action Items, recurring holds, cancel a date             (Sixth Street · ~30 min)
  W5  Vendor sets up listings and markets — limits, double-booking, copy                 (~25 min)
  W6  Admin looks up a vendor                                                             (~5 min)
  W7  Events — one fresh self-service event, start to shop                               (~45 min)
  W8  Market bundles — three fresh orders                                                (~30 min + a 1-hour wait)
  W9  Market boxes — one purchase                                                        (~15 min)
  W10 Survey email link                                                                  (~2 min)
  Not runnable yet — listed at the end; nothing for you to do.



==================================================
W1 — MANAGER RUNS A CHARGING MARKET  (Amarillo Community Market)
===
SETUP: you are the manager of Amarillo. It already has: 10x10 numbered 1–10 with pins #5 Sunrise Organic, #6 Happy
Hens, #7 Texas Honey, #8 Lone Star Succulents, #9 Sweet Rise and placeholder #1 (manager booth); 10x15 numbered
11–20 with pin #11 Valley Verde. Plus ONE vendor with an application pending (apply from the market page as any
test vendor with no history at Amarillo before you start — that also seeds W2's habit).
Page for the whole workflow: /farmers_market/market-manager/[id]/dashboard

 1. Open the dashboard and read it top to bottom.
    Expect this order: Action Items → Setup (collapsible) → "Booths & occupancy": Booth occupancy — this week ·
    Weekly booth bookings · Booth inventory · Off-platform booth placeholders · Booth map → "Vendors": Vendor
    attendance · Vendors at this market (Roster / Invite tabs) → "Money & activity": Your booth revenue · Market
    activity · Curated bundles → "Communication & insights": Send an announcement · Survey results · Cancel a market
    day · Need help?. Jump-nav chips: Setup · Booths & occupancy · Vendors · Money & activity · Communication; each
    scrolls to its heading. The occupancy card says it is the picture ("Is there room?"); the bookings card says it is
    where you act.                                                                                    TR-097

 2. "Your next two weeks" strip — directly under the market name/address, above the chips.
    Expect one line per market day in the next 14 days, e.g. "Sat, Sep 26  8a–12p · 3 vendors declared · 2 paid
    booth weeks (1 booked, unpaid) · 4 orders scheduled". Today's line highlighted. Check ONE line against the pages
    that own each number: declared = roster's declared days for that weekday; paid/unpaid = Weekly booth bookings for
    that week; orders = an order placed for pickup that day. (The "Cancelled — struck through" part is W3 step 1.)
                                                                                                      TR-099

 3. "Action Items" — the first card.
    Expect: titled "Action Items"; a line "1 vendor pending your approval. Review →" whose link lands on the ROSTER
    CARD (not the Vendors heading). NO "Needs a booth number" line (this market charges — vendors get their number
    when they book). NO "Next market day" line (the strip's job). Any of these may also appear and each link must
    work: "<size> has no booth numbers yet… Set numbers →" (Setup) · "N held or placeholder numbers have no size…
    Re-pick →" (roster) · "<size> is over capacity this week… Fix →" (Booths & occupancy) · "Stripe needs more
    information… Finish →" (Setup) · "N season vendors are owed a settlement… Settle →" (Seasons).
                                                                                             TR-098 TR-105

 4. Collapse Setup. Click any Action Item link that points INTO Setup (if none shows, use the jump-nav "Setup" chip
    and then a "#setup" link from the browser bar is not needed — just confirm the chip works).
    Expect: Setup opens by itself and the page scrolls to the target card.                          TR-106

 5. Vendors section → the "Vendors at this market" card.
    Expect: "Vendors" has the accent rail (a section); "Vendors at this market" below it is a plain bold CARD title,
    no rail. On approved vendors with no paid week: an amber "· no paid week yet" (hover explains). NO "Needs booth #"
    chip anywhere on this roster; an unnumbered approved vendor reads "gets a booth # when they book".
                                                                                     TR-106 TR-072 TR-103

 6. Same card — the pending applicant's row → the Approve controls.
    Expect: "Requested: <size>" if they chose one on Apply; next to Approve a SIZE dropdown (preset to what they
    requested), then a NUMBER dropdown (this size's numbers; taken ones greyed with who holds them, e.g. "5 — held:
    Sunrise Organic Farm"), a "N free" count, and a "Note to vendor" field. Nowhere can you TYPE a number. Pick a
    number, type a note, Approve → row shows the number and size; the vendor's bell + email read "Your booth: #N ·
    <size> size…" and include your note.                                                  TR-085 TR-102

 7. Same card — Texas Honey Co. (#7): change the number to #10 → Save.
    Expect: the vendor is told "Your booth at Amarillo… is now #10 (was #7). The market manager moved you." Now
    clear the number ("— no booth # —") → Save → they are told it is "no longer held for you". Put #7 back → Save
    → a third message (it is a move again). Change ONLY the size of some other vendor → NO message.  TR-090

 8. Same card — Lone Star Succulents (#8): Revoke.
    Expect: the row shows no booth or size. Pick #8 for another vendor → Save works. (Re-invite / re-approve Lone
    Star afterwards if you want them back — optional.)                                             TR-081

 9. "Booth occupancy — this week" card.
    Expect: under 10x10 one tile per number 1–10 — #1 "Off platform: Market Manager Booth", the pinned numbers
    "Held (not paid)", the rest dashed "#N · free"; under 10x15 tiles 11–20 with #11 held. The "N of M occupied ·
    K open" line counts BOOKINGS only — holds are listed but not counted, so with no paid weeks it reads 1 of 10 (the
    placeholder) and 0 of 10.                                                             TR-104 TR-082

10. "Off-platform booth placeholders" card → Add.
    Expect: size dropdown then number dropdown, no text field for the number; taken numbers greyed with the holder.
    Add one (e.g. 10x15 #20, note "test placeholder") → it appears; Edit it → same picker; Delete it.
                                                                                                      TR-102

11. The FOUR booth cards — Booth inventory · Vendors at this market · Off-platform booth placeholders · Weekly
    booth bookings.
    Expect: the SAME "How booth numbers work here." paragraph on each, ending with this market's map "10x10 1–10 ·
    10x15 11–20". No other card explains numbers differently.                                        TR-101

12. "Weekly booth bookings" card → week header → "🖨 Print this week's sheet" (new tab).
    Expect: a plain page "Amarillo Community Market — week sheet": one row per booth: booth # · vendor · size ·
    status (Paid / Booked · NOT paid / Held · no booking this week / Off-platform) · a ✓ under each market day the
    vendor declared · an empty "Checked in" column. Holds and the placeholder appear. Previous/Next week links work;
    Print → the browser preview shows only the table. "← Back to the dashboard" lands on the bookings card.
                                                                                                      TR-108



==================================================
W2 — VENDOR APPLIES, IS APPROVED, BOOKS AND PAYS  (Market 2 Test)
===
SETUP: two test vendor accounts with NO history at Market 2 Test — call them V1 and V2 — each with at least one
published listing. The manager account for Market 2 Test. Market 2 Test charges for booths (small $25 / medium $35 /
large $50) and has pin #7 (medium, Hill Country Herbals) and placeholder #1 (small). Stripe test card 4242….
The one FREE-market step (step 2) needs a managed FM market with a $0 booth tier — if you don't have one, skip it and
say so.

 1. As V1: /farmers_market/vendor/markets → open Market 2 Test's day picker → tick a day.
    Expect: refused with a RED (blocking) message "«Market 2 Test» reviews vendor applications. Apply from the
    market's page…". No agreement block in the picker any more.                                      TR-083

 2. (Free market, if you have one) As a vendor with no history there, same day-picker attempt.
    Expect: the same red refusal — free markets need approval too.                                    TR-083

 3. As V1: /farmers_market/markets/[Market 2 id] → "Apply to Sell Here".
    Expect: the market agreement with an "I agree" box; below it "Share my onboarding documents with this market's
    manager" with a grey line explaining why; a "Booth size you'd like" select listing the sizes with weekly prices.
    Submit stays disabled until BOTH "I agree" and a size are chosen. Tick sharing, pick MEDIUM, submit.
                                                                                             TR-071 TR-084

 4. As V2: same page, same steps — pick SMALL, do NOT tick document sharing.                       TR-084

 5. As manager: dashboard → Vendors at this market.
    Expect: two pending rows; V1 reads "Requested: medium" and shows "View docs"; V2 reads "Requested: small" and
    has NO "View docs". Open V1's "View docs".
    Expect: the documents page opens (if it errors, capture the on-screen error or Vercel log line).
                                                                                             TR-084 TR-036

 6. As manager: approve V1 — change the size to LARGE, pick number 16, note "moved you to large" → Approve.
    Expect: row shows #16 · large. V1's bell + email: "Your booth: #16 · large size…" with your note.
    Approve V2 with size SMALL and NO number, no note.
    Expect: works; V2's row shows small, no number, "gets a booth # when they book".                TR-085

 7. As V1: /farmers_market/vendor/markets → Market 2 Test day picker → tick a day → UNTICK it again (so V1 has no
    days for step 8).
    Expect: the toggle saves now.                                                                    TR-083

 8. As V1 (no days ticked): /farmers_market/markets/[Market 2 id]/book.
    Expect: an amber "First, pick the days you attend «Market 2 Test»" box with day toggles ABOVE the form;
    "Continue to payment" disabled with the reason; season picker hidden. Tick a day → "Done — continue to booking"
    → the form unlocks and the season picker appears.                                                TR-087

 9. Still on the book page as V1.
    Expect: a box "Your booth at «Market 2 Test»: #16 · large size — assigned by the manager"; the size picker is
    disabled on LARGE ("set by the manager"). Also: the operating-days line sits BELOW the booth map and ABOVE the
    week/booth selection.                                                                  TR-086 TR-046

10. BEFORE paying — three checks as V1 / as anyone:
    a. /farmers_market/listing/[one of V1's items] → no pickup dates at Market 2 Test; it cannot be carted there.
    b. /farmers_market/vendor/markets "Your next two weeks" → Market 2 Test's weekday renders amber "No paid booth
       week — book this week to sell here".
    c. As manager: the dashboard's visibility card says the market isn't visible and names "a paid booth week" as the
       third requirement; /farmers_market/markets (public list) omits Market 2 Test.
                                                                                     TR-073 TR-074 TR-075

11. As V1: back on the book page → pick this week → agree → "Continue to payment" → pay with the test card.
    Expect: reaches Stripe, NO "BOOTH_CONFLICT". After paying, the booking shows booth #16.          TR-078

12. AFTER paying — the same three checks flip:
    a. V1's listing shows pickup dates for THAT WEEK ONLY at Market 2 Test.
    b. The week strip shows those dates as a normal booth entry.
    c. The visibility card says visible; the public list includes Market 2 Test.
    A free managed market and an off-app market are unchanged throughout.                  TR-073 TR-074 TR-075

13. As manager: roster → V1's row.
    Expect: the size and number are greyed with "Locked — paid week on file…" under them. Weekly booth bookings →
    V1's PAID row reads "Booth #16 — locked, paid week. Changes only after a missed week, or cancel the week below."
    with no dropdown.                                                                       TR-089 TR-103

14. As manager: roster → some OTHER approved vendor → size large → number dropdown.
    Expect: "16 — paid, locked: <V1's name> through <Saturday>" greyed. Pick 17 → Save works. Roster → V1's own row
    is locked (step 13), which is the same rule from the other side.                        TR-102 TR-080

15. As V2 (approved small, no number): /farmers_market/markets/[Market 2 id]/book → tick a day if asked.
    Expect: the size picker allows small; under it: "You'll be given the lowest free booth number in this size when
    you book; paying for the week makes it yours." Book this week → the confirmation names a SMALL number (#2 — #1 is
    the placeholder). Do NOT pay yet.
    Expect (manager): Weekly booth bookings shows V2's row as PENDING with the size/number picker (size fixed to
    small); the occupancy grid shows #2 "Pending payment". Change V2's pending number to #3 → Save → V2 is told.
                                                                                     TR-104 TR-089 TR-103

16. As V2: pay the pending week.
    Expect: the roster now shows V2 pinned to #3 · small. Booth occupancy → #3 "Paid this week" under small; the
    "N of M occupied" line now counts it.                                                    TR-088 TR-082

17. The yield (a held number goes to whoever pays). As manager, on SMALL: pin three other approved vendors to #4, #5
    and, if you have a fourth, leave #4/#5 as the only holds — the point is that EVERY small number is now a
    placeholder (#1), paid (#3) or a hold. Then as a vendor V3 with no number (approve one to small without a number)
    book a small week.
    Expect: V3's confirmation names the LOWEST held number (#4). V3 pays.
    Expect: roster shows V3 pinned to #4 and the vendor who held #4 with NO number; that vendor's bell + email:
    "Booth #4 at «Market 2 Test» is no longer held for you. It went to a vendor who paid…"; your own "V3 paid for a
    booth" message ends "Booth #4 was held for <name>; the hold moved to V3…". If V3 never pays, nothing moves.
                                                                                                      TR-088

18. (Only if a market has an OPEN pre-season window.) Buy the season (or a partial set of weeks) as a pinned vendor,
    then as an unpinned one; then /farmers_market/vendor/bookings.
    Expect: pinned vendor — every week shows the pinned number; unpinned vendor — every week shows the SAME
    auto-assigned number. If no single booth is free for all the weeks: "a season keeps one booth all season" rather
    than blaming one week.                                                                            TR-079



==================================================
W3 — MANAGER CANCELS A MARKET DAY AND A PAID WEEK  (Market 2 Test, right after W2)
===
SETUP: W2 left V1 with a PAID one-off week (#16) and at least one weekday ticked. If a vendor holds a paid SEASON
week too, step 1 checks their notice as well; otherwise skip that sentence.

 1. As manager: Communication & insights → "Cancel a market day" → pick a FUTURE date inside V1's paid week that V1
    has ticked → cancel.
    Expect: V1's notice reads "Your paid booth week is credited $X for that day — applied automatically…" where X =
    what V1 paid for the week ÷ the days V1 ticked that week (2 ticked of 3 open → half). A season vendor's notice
    keeps the settlement wording and gets no credit. The strip's line for that date is struck through and reads
    "Cancelled — make-up day …" (or just "Cancelled").                                      TR-091 TR-099

 2. Cancel the SAME date again.
    Expect: no second credit.                                                                        TR-091

 3. As V1: book another week at Market 2 Test.
    Expect: the credit is applied at checkout.                                                       TR-091

 4. As manager: Weekly booth bookings → a PAID one-off row (V2's #3 from W2, or V1's) → "Cancel week".
    Expect: a reason box appears; Confirm stays disabled until you type one. Confirm → the row shows Cancelled and a
    green line states the credit — the FULL amount before the week starts, the remaining ticked days only mid-week.
    The vendor's bell + email: "…cancelled your booth #N for the week of … Reason: … You have a $X credit…". A
    SEASON week refuses ("settle at season end"). The vendor's own bookings page has NO cancel button for a paid week
    (by design — they bear the risk).                                                                TR-092



==================================================
W4 — FOOD-TRUCK PARK  (Sixth Street Food Park)
===
SETUP: you operate Sixth Street (setup checklist complete). Trucks: T1 (unapproved at Sixth Street) books a spot for
THIS week before you start; T2 (approved) submits a recurring-hold request for Saturdays on Spot A and leaves it at
"requested"; T3 (approved) is a second truck to try to take the spot. A paid park.

 1. As T1: /food_trucks/vendor/edit.
    Expect: the new sentence under "Pickup Capacity". Then /farmers_market/vendor/edit and the FM dashboard
    pickup-line notice: NO mention of "Pickup Capacity" anywhere.                                    TR-034

 2. As operator: /food_trucks/market-manager/[park id]/dashboard.
    Expect: the FIRST card is "Action Items" (it never showed on a park before) with "1 truck pending your approval —
    1 has already booked this week. Review →" and "1 recurring-hold request is waiting for your yes or no (Recurring
    holds tab). Decide →"; both links land on "Your trucks". The LAST section is titled "Communication & insights".
    Approve T1 and APPROVE T2's Saturday hold.
    Expect: the card collapses to "Nothing needs you right now — truck approvals and recurring-hold requests show up
    here."                                                                                            TR-107

 3. As T2: /food_trucks/vendor/markets "Your next two weeks".
    Expect: the standing reservation shows on its Saturday MORE than 7 days out, with the pay-by note.  TR-043

 4. As T3: /food_trucks/markets/[park id]/book-spot.
    Expect: Spot A's card says "Held on Saturdays — recurring truck"; in the day list Saturdays are greyed "— held by
    a recurring truck"; in Prepay-a-week a week containing a Saturday is greyed with the reason. Try to force it (pick
    Spot A, switch to a Saturday via week mode on another spot, then change spot) → the server refuses: "Spot A is
    held by a recurring truck on Saturdays. It opens to other trucks only if they don't pay by the … cutoff — check
    back after that, or pick another spot."                                                          TR-109

 5. As T2: book Spot A on a Saturday early (before the sweep creates it).
    Expect: works — the anchor may take their own spot.                                              TR-109

 6. As operator: Cancel a park date (a future date).
    Expect: the result card shows truthful counts (trucks credited with a $ total, roster notified), an auto-credit
    note plus an optional make-up date, and NO radio buttons.                                        TR-040

 7. (Later, optional) After T2's Saturday occurrence expires unpaid (didn't pay by Thursday), as T3 book that
    Saturday on Spot A.
    Expect: it is open now.                                                                          TR-109



==================================================
W5 — VENDOR SETS UP LISTINGS AND MARKETS
===
SETUP: a FREE-tier FM vendor already at 3 traditional markets (the one who hit "Market limit reached (4/3)"); an FM
vendor and an FT vendor with the multi-location box UNCHECKED on /[vertical]/vendor/edit; an FT listing with 0-day
advance ordering; a buyer account.

 1. As the 3-market vendor: /farmers_market/vendor/listings/[id]/edit → tick a 4th traditional market → save.
    Expect: refused; the message says your free plan allows 3 traditional markets counted across ALL listings and
    market-box pickup markets, and LISTS the 4 markets already counted. (Your 09-18 note: the extra markets may
    not be selectable at all — if that is what you see, say so; it is a different behaviour to rule on.)  TR-069

 2. As the FM vendor (box UNCHECKED): /farmers_market/vendor/markets → activate a second market on a weekday and
    time you already occupy elsewhere.
    Expect: refused, naming the market you are already at. Check the box on /vendor/edit → try again → succeeds.
    Repeat once as the FT vendor.                                                                     TR-044

 3. As a buyer: /food_trucks/listing/[the 0-day item] on a NON-operating day.
    Expect: "Orders Open on Operating Days"; the badge tooltip no longer claims prep time.            TR-042

 4. As a buyer: place an order with any vendor, then cancel it BEFORE the vendor confirms. As that vendor:
    /[vertical]/vendor/orders.
    Expect: the "cancelled" count card at the top includes it, matching the list below.              TR-048



==================================================
W6 — ADMIN LOOKS UP A VENDOR  (platform admin)
===
 1. /farmers_market/admin/vendors → Tier dropdown → Free.
    Expect: exactly three options (Free / Pro / Boss); vendors whose row used to say "standard", "premium" or
    "featured" are in the result and read "Free".                                                    TR-095

 2. Find Valley Verde Farm's row (the 10-vs-9 vendor).
    Expect: "📦 N published" (plus "🧺 N boxes" if they have active market boxes). Note N.           TR-096

 3. Details → Quick Stats.
    Expect: "Published listings" = the same N; "Active market boxes" shown separately; Tier says Free. Drafts and
    deleted listings are counted on NEITHER page. The CSV export's Tier column matches.     TR-095 TR-096

 4. Same page → "Markets" card (under Business Information).
    Expect: one line per market: market name (click → admin market page), status pill APPROVED / PENDING / REVOKED,
    "Booth #N (size)" where pinned, "Days declared: Sat, Wed" or "No days declared". A vendor on no market reads
    "Not on any market roster yet."                                                                  TR-093

 5. Same page → "Event Readiness Application" (an FM vendor who submitted it on /farmers_market/vendor/edit; open
    both side by side).
    Expect: the FM questions only — Setup Type, Space Needed (feet wide), Do You Need Access to Electrical Power?,
    Product Storage Needs, Product Display Setup, Can You Offer Product Samples, Outdoor Event Suitability, How Many
    Customers Can You Serve Per Hour? — every value is the exact option text picked. No Vehicle Type, Generator, Max
    Runtime, or "undefined". Then a FOOD TRUCK vendor's detail: Vehicle Type / Generator / Max Runtime still there.
                                                                                                      TR-094



==================================================
W7 — EVENTS: ONE FRESH SELF-SERVICE EVENT, START TO SHOP
===
SETUP: an organizer account; four vendor accounts (A, B, C accept at once; D accepts LATE, after step 3); a FREE
self-service event so no vendor fee is involved. One of A–C must have the multi-location box UNCHECKED (step 9).
Background: "accepted" is not "selected". Run steps 1–8 in order on the same event.

 1. Before selecting anyone: /[vertical]/events/[token] (public page) and /[vertical]/events/[token]/shop, plus one
    accepted vendor's item page /[vertical]/listing/[id].
    Expect: public page says "Upcoming Event" and "Vendors Are Still Responding" with no vendor listed; the shop shows
    no menus; the item page offers no pickup date for the event.                            TR-022 TR-064

 2. /[vertical]/events/[token]/select → select A and B (not C) → trim one item from A's menu → confirm.
    Expect: public page "2 Vendors Attending" with only A's and B's menus (A's trimmed); the shop sells A and B, not C;
    C's items at their REGULAR market stay orderable the whole time.                        TR-022 TR-064

 3. Have D accept now. Reload the public page and the shop.
    Expect: D does NOT appear anywhere until selected.                                               TR-022

 4. Select page → "Change selections".
    Expect: A and B pre-ticked, "Menu set when you selected this vendor", NO trim controls; D HAS trim controls; C
    (benched) shows "Backup vendors bring their full menu". Select D, trim one item, confirm.
    Expect: D's page /[vertical]/vendor/events/[marketId] shows "approved N of M"; the removed item is absent from the
    shop. "Change selections" once more → D is locked too.                                          TR-065

 5. "Change selections" → untick B → confirm the drop → reload → "Change selections".
    Expect: B is NOT under "Your vendors are confirmed" and NOT pre-ticked. Select B again on purpose → B gets a NEW
    "you're selected" notification.                                                                  TR-066

 6. Confirmed view → the Backup box ("Short on options?") → follow its sentence: event dashboard → Event Details →
    widen vendor types / preferences / number of vendors → Save → tap "Refresh matches".
    Expect: the Refresh-matches prompt appears after the save; tapping it reports new invitations or that no new
    vendors qualified.                                                                                TR-067

 7. /farmers_market/event-manager/[id]/dashboard → Event Details; compare a food_trucks event.
    Expect (farmers market): "Product Preferences", "Total Budget", "Budget Per Person", "Expected Number of Buyers",
    "Dietary or Product Requirements", "Other Food or Products at Venue", "Other Vendors Present?", event type
    "Corporate / Workplace Event", produce / baked goods / crafts examples. Food trucks: exactly as before.  TR-068

 8. /[vertical]/browse card vs /[vertical]/listing/[id] for one of A's event-selected listings.
    Expect: the same Open/Closed pill on both.                                                       TR-026

 9. As the vendor with the multi-location box UNCHECKED (accepted to this event): /[vertical]/vendor/markets/[id]/
    book-park-spot (or a booth / season form) on the EVENT's date.
    Expect: refused with a message to withdraw from the event first.                                 TR-025

10. Side checks (any event that fits):
    a. Admin event detail (/[vertical]/admin/events) on a self-serve APPROVED event with invitations NOT sent.
       Expect: "Open Pre-Orders — invitations held" DISABLED with a tooltip; the Inviting card says held.   TR-023
    b. (Optional) force ready while held → the organizer's progress view says nothing is orderable, not "pre-order
       now".                                                                                          TR-024
    c. A vendor withdraws → /[vertical]/reconfirm/[token] reflects live items (all cancelled → withdrawal copy; some →
       partial; live → "stands").                                                                    TR-030
    d. A FRESH vendor signup left UNAPPROVED submits Private Events Readiness → /[vertical]/admin/events shows the
       grey "not eligible — vendor not yet approved" badge.                                          TR-032
    e. Fee card: outlined natural-width reuse buttons over the yellow box; side by side desktop, stacked mobile.
                                                                                                      TR-033
    f. Invitation accept form: amber advisory when the number entered is below the profile default.  TR-035



==================================================
W8 — MARKET BUNDLES: THREE FRESH ORDERS
===
SETUP: a market with a bundle; a buyer; the bundle's vendors; the manager. Order 1 carries steps 1–3; order 2 is
step 4; order 3 is step 5 (needs a vendor confirm + a 1-hour wait).

 1. As buyer on a PHONE: /[vertical]/markets/[id] → "Market Bundles".
    Expect: nothing runs past the card or screen edge; long lines wrap; the name/price row wraps if it must. A
    screenshot either way.                                                                           TR-010

 2. Buy the bundle (order 1). Each vendor marks Ready. As manager tap "Receiving now" per vendor and let the vendor
    tap Fulfill within 30 seconds; tap "Ready — notify buyer"; tap "Mark handed off". As buyer open the ORDER DETAIL
    page and tap the yellow acknowledge.
    Expect: the buyer receives NOTHING when vendors confirm or fulfil; a vendor who taps Fulfill before your
    Receiving-now sees "Wait for the market manager to tap Receiving now…" and nothing changes; after "Ready — notify
    buyer" the buyer gets exactly ONE ready notice; the order detail shows ONLY the yellow bundle acknowledge (no green
    per-item one); the orders list shows no "confirm you received it" banner; no review popup after acknowledging;
    the placed email names the bundle, the market and the pickup spot.                              TR-001

 3. The buyer's inbox after "Ready — notify buyer".
    Expect: ONE email naming the bundle and the market, with the pickup spot (the manager's own "Ready to collect"
    emails don't count).                                                                              TR-005

 4. Order 2: buy a fresh bundle; within 60 minutes → /[vertical]/buyer/orders/[id] → "Cancel bundle".
    Expect: full refund, to the cent, on the page and in Stripe.                                     TR-002

 5. Order 3: buy a fresh bundle; a vendor confirms; wait past the first hour; cancel.
    Expect: 75% refund (25% fee on items and margin), tip refunded in full; dialog wording "Cancelling after the first
    hour or once a vendor has confirmed…".                                                           TR-003



==================================================
W9 — MARKET BOXES: ONE PURCHASE
===
SETUP: a vendor with a market-box offering; a buyer. Pickup date inside the next 7 days.

 1. Buy the box as the buyer. As the vendor: dashboard card "My Upcoming Pickups" and /[vertical]/vendor/markets
    "Your next two weeks".
    Expect: the pickup day shows on the dashboard tile (counted as an item at that market) and on the strip as a
    "market box" entry at the pickup market with the offering's hours.                               TR-015

 2. /[vertical]/vendor/market-boxes/[id] → Subscribers and Pickups tabs.
    Expect: each row shows "Order #FA-…" beside the week line.                                       TR-016

 3. Complete pickup 1 (buyer confirms, vendor confirms within 30 seconds). Then /[vertical]/buyer/subscriptions/[id]
    and /[vertical]/buyer/orders.
    Expect: BOTH pages read "1 of N pickups completed". (SQL check if you like: the subscription's weeks_completed
    reads 1.)                                                                                         TR-014



==================================================
W10 — SURVEY EMAIL
===
 1. Trigger a survey email from staging (Communication & insights → Survey results, or wait for the weekly one).
    Expect: its links point at the STAGING deployment, not production.                               TR-041



==================================================
NOT RUNNABLE YET — nothing for you to do until the blocker clears
===
  TR-028 Event cancellation money · TR-029 Event deselect and refund money — need an event with a PAID vendor fee on
         staging; steps will be issued once one exists.
  TR-031 Protocol v6 remainder (buyer items + weekly survey · onboarding copy · manager new-email invite and resend ·
         farmers-market mirror · print chrome) — steps must be re-issued in this format first.
  TR-060 Normal checkout decrements stock — ON PROD · TR-062 Acknowledge + fulfil inside 30 s moves the payout — ON
         PROD. Both passed on staging 2026-09-13; blocked until a real vendor has Stripe set up on Prod.



==================================================
FOR CLAUDE — TR → WORKFLOW INDEX (owner: ignore)
===
W1: 097 098 099 105 106 072 103 085 102 090 081 104 082 101 108
W2: 083 071 084 036 085 087 086 046 073 074 075 078 089 103 102 080 104 088 082 079
W3: 091 099 092
W4: 034 107 043 109 040
W5: 069 044 042 048
W6: 095 096 093 094
W7: 022 064 065 066 067 068 026 025 023 024 030 032 033 035
W8: 010 001 005 002 003
W9: 015 016 014
W10: 041
Passed 2026-09-21 (removed): TR-100 (Westgate Mall, capital M — Existing-numbers path incl. overlap + held refusals).
Not runnable: 028 029 031 060 062.
