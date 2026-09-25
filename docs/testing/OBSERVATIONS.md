# Observations — append-only intake log

One entry per report, in the tester's own words (verbatim or lightly trimmed for length, never reworded). Never edit
an entry after it is written; corrections go in a new entry. The **Triage** line beneath each entry is the project's:
registry match (`TR-nnn`) + the owner's ruling (fix now · backlog · by-design · duplicate · needs more info).

Format:
```
### OB-nnn · YYYY-MM-DD · tester · role · device
Where:  …
Did:    …
Saw:    …
Wanted: …
Triage: TR-nnn → ruling (date) — note
```
Free-text reports are fine: paste them under `Report:` and fill the triage line the same way.

---

### OB-001 · 2026-09-13 · owner · buyer + vendor · (device not stated) · staging `b4ce81aa`
Report (four-item smoke + market-box halves, condensed from the owner's message):
- Market box checkout: buying a box showed "Market Compatibility Issues: Unknown item is not available at any markets" (pre-fix); after the fix, the box alone reached payment and the vendor got "New subscription to {box} from {customer}".
- Regular listing from the same vendor: transaction completed with no errors.
- Single-item order, cancelled before vendor confirmation: cancellation confirmation, reason and refund amount shown; vendor notified of the sale then the cancellation. Vendor orders page shows the cancelled order at the bottom but not in the status count cards at the top.
- Normal pickup handoff on a regular listing item: passes.
- Market box pickup 1 of 2: `/buyer/subscriptions/[id]` shows 1 of 2 completed; `/buyer/orders` shows 0 of 2 but the correct next date (Oct 3). Vendor market-box page has no order number (may be because the pickup was forced early).
- Box + a listing from a different vendor at a different market: multi-pickup notice shown, payment worked, success page correct. The box did not appear in the vendor's "My markets & schedules" schedule nor in "My upcoming pickups".
- Suggestion: a dashboard reminder for market boxes due this week / next week.
Triage: TR-011/012/060/061/062 → pass · TR-014/015/016/048 → fail, backlog (2026-09-13) · reminder → backlog market-box #4

### OB-002 · 2026-09-13 · owner · vendor · staging `d704d3bb`
Report (the 09-07 fix round, items 11–17, condensed):
- 11: booked a second market for Saturday with the same time already obligated elsewhere; no "toggle attendance ON" control exists on `/vendor/markets`; the "I can staff more than one location at the same time" box on `/vendor/edit` was UNCHECKED and the app still allowed it. "Vendors should not be able to double book without confirming they can cover two places."
- 12: passes. 13: passes, but on markets with a map the message sits above the map; wants it below the map, above the week/booth selection. 14: passes. 17: passes.
- Skip-a-week on a market box: worked; next pickup date changed, weeks 1 of 4 → 1 of 5; buyer notified and their subscriptions page matched.
Triage: TR-044 → fail → owner ruling 2026-09-13: checkbox gates BOTH verticals (decisions.md), build pending · TR-045/046/047/027/013 → pass · 13 layout → backlog

### OB-003 · 2026-09-13 · owner · admin · staging `d704d3bb`
Report: "Admin event-blocking section — yes, passes test."
Triage: TR-027 → pass

### OB-004 · 2026-09-13 · owner · buyer · staging
Report: "After the market bundle purchase, buyer was asked to evaluate the vendor — will buyer eval all vendors in a bundle? Or just one? Should the market bundle as a product get the benefit of the star reviews or still go to the vendors?"
Triage: no registry row (design question) → backlog test-notes #3, needs a code read of the rating prompt's data source

### OB-005 · 2026-09-13 · owner · admin · staging
Report: "`/food_trucks/admin/events` — a ton of valuable information but we could do a better job of delineating one section from another and grouping more relevant sections together… section heading font about 2 points larger, and the empty space between sections could add the equivalent of ½ line."
Triage: no registry row (UX) → backlog test-notes #4

### OB-006 · 2026-09-13 · owner · buyer · mobile
Report: "On the market profile page in the new section for market bundles on mobile, the description goes beyond the row that it's on — look at the description that says 'created by this market' — no word wrap or parameter to keep it inside the container. On desktop it looks fine but on mobile it does not."
Triage: TR-010 → fail; screenshot / exact text owed before a fix is proposed

### OB-007 · 2026-09-13 · owner · buyer + admin · staging
Report (condensed):
- Share button only goes to Facebook and X; wants Instagram, TikTok, Snapchat and other socials.
- Market boxes on browse are lost under a filter; people don't think to look there. Options floated: keep the filter and add a section on the vendor profile like the market-bundles section on markets, or move it under the vendor. Also wants a filter for "all items available to order right now" because scrolling open/closed pills won't scale to 100 trucks.
- Admin panel yellow card "5 orders pending/confirmed > 24 h": tapping it does nothing.
- Idea: park ↔ truck matchmaking using the events matching criteria, possibly a paid-tier feature.
Triage: share → backlog test-notes #2 · browse → TR-050 fail (the "Available now" toggle already exists inside the filters popup; discoverability) + backlog #3/#4 · admin card → TR-049 fail (built as a non-clickable card; no destination exists) · matchmaking → backlog #6 (future)

### OB-008 · 2026-09-13 · owner · admin · prod `d704d3bb`
Report: "tests 1, 2, 3 confirmed [pages load · login · located browse with radius change]. Can't run test 4 & 5 right now, they are not real vendors with real Stripe set up."
Triage: TR-063 → pass (prod) · TR-060/062 → open on prod until a Stripe-enabled vendor exists

### OB-009 · 2026-09-14 · owner · market manager (cron) · cmd on Windows · staging `3432ae5c`
Report: called the surveys cron on staging twice with the cron secret after a bundle sale.
Run 1: {"bundleSold":{"ordersConsidered":1,"managersNotified":1,"errors":[]}} (survey generation itself "skipped: runs once daily 15:00 UTC")
Run 2: {"bundleSold":{"ordersConsidered":1,"managersNotified":0,"errors":[]}}
Triage: TR-007 → pass on the endpoint (one notice, dedup on repeat); manager-side receipt (in-app + email, once) still to be confirmed by the owner

### OB-010 · 2026-09-14 · owner · buyer + vendors + market manager · staging `3432ae5c`
Report (TR-001, verbatim-ish): "not right yet — buyer received notifications when each vendor confirmed their order (debatable if buyer needs this because they are expecting to deal directly with the mktmgr) ++ then buyer received 'Order Complete' notification (should not have because mktmgr did not yet click button to notify buyer on market dashboard page) ++ on buyer side order page /farmers_market/buyer/orders the system is prompting buyer to acknowledge the pickup (I think this is a regression because it didn't do this before — previously system knew the buyer was waiting for notice from mktmgr, now the signals have gotten crossed) — test fails. The buyer should not see the big green screen until notified by the manager, but buyer sees it already and is told to confirm receipt. When I clicked into order detail it still thinks part of the order needs to be picked up (1 of 2 items from one of the vendors) 'status = vendor handed off' — (3 total items — 2 showing picked up)."
Triage: TR-001 → FAIL. Three distinct symptoms to trace: (a) buyer got per-vendor "confirmed" notices; (b) buyer got "Order Complete" before the manager's notify tap; (c) buyer order page shows the green acknowledge hero + one item stuck at "vendor handed off" (2 of 3 picked up). Cause, traced 2026-09-14 (code read, no fix built):
  (a) vendor confirm route sends order_confirmed to the buyer with NO bundle gate (vendor/orders/[id]/confirm/route.ts:103) — the 09-06 fix covered ready + fulfill only. Not a regression; needs an owner ruling.
  (b) "Order Complete" = the in-app title of order_fulfilled (locale en.ts:575). fulfill/route.ts has FOUR buyer sends; three were bundle-gated 09-06 (:215 company-paid, :257, :443 payout-failed) but the main successful-payout path at :483 was NOT → every vendor item fulfilled after a Receiving-now tap notifies the buyer. Defect vs the 09-06 intent (~85%).
  (c) buyer orders LIST page (buyer/orders/page.tsx:660) renders the 🤝 "please confirm you received it" banner on order.status === 'handed_off'; grep finds no bundle reference in that file (the 09-06 bundle gating went on the DETAIL page). The item at "Vendor Handed Off" is one the vendor fulfilled without a matching Receiving-now tap (or outside the 30 s window) → fulfill's vendor-first edge branch → fulfilled-unacked → list page shows the banner (~75%; per-item SQL on the order would settle it).
  RULING 2026-09-14 (owner): items that worked = confirmed (handoff 1 normal path ×2); the three defects = OUTSTANDING, fix later in one larger bundles batch (backlog "BUNDLES NOTIFICATION + EDGE BATCH"). Owner also ruled: bundle buyers get NO vendor confirmation notices (decisions.md).

### OB-011 · 2026-09-14 · owner · buyer · staging
Report: TR-004 "passes test — pickup location shows on success screen."
Triage: TR-004 → pass

### OB-012 · 2026-09-14 · owner · buyer · staging
Report: TR-005 — quoted email: "Thank you for using Farmers Marketing! Your order #FA-2026-03444755 has been placed with 2 vendors. You have selected Amarillo Community Market at 1000 S Polk St, Amarillo, TX as your pickup location. You scheduled your items to be ready for pickup at your scheduled time on Thursday, September 24, 2026. We will notify you when your order has been confirmed by 2 vendors. Thanks again!"
Triage: this is the ORDER-PLACED email, not the bundle_ready email (that one only sends after the manager taps "Ready — notify buyer", which this run never reached) → TR-005 stays open. NEW finding: placed-email copy is generic ("placed with 2 vendors… confirmed by 2 vendors") on a BUNDLE order where the buyer deals with the manager → backlog (bundle-specific placed-email copy), owner to rule.

### OB-013 · 2026-09-14 · owner · market manager · staging
Report: TR-007 "cmd prompt test worked ++ mgr received in-app notice that bundle sold."
Triage: TR-007 → pass (endpoint + in-app). Email receipt not mentioned — unconfirmed, not failed.

### OB-014 · 2026-09-14 · owner · buyer · staging
Report: second email the buyer received on the TR-001 order: "Sweet Rise Bakery confirmed your order #FA-2026-03444755 for Sourdough Loaf. We'll notify you when it's ready for pickup. When you arrive, you'll show your order screen to the vendor and both of you will confirm the handoff."
Triage: TR-001 symptom (a) confirmed with the order number. The order_confirmed email carries per-item handoff instructions ("show your order screen to the vendor… both confirm") that are WRONG for a bundle order (the manager collects). Owner ruling pending on whether bundle buyers get vendor-confirm notices at all; recommendation: no.

### OB-015 · 2026-09-14 · owner · SQL on staging · order FA-2026-03444755
Report: per-item grid — Sourdough (Sweet Rise): buyer_confirmed 02:01:01, vendor_confirmed 02:01:06, fulfilled. Spinach (Valley Verde): buyer_confirmed 02:02:38, vendor_confirmed 02:02:49, fulfilled. Chard (Valley Verde): buyer_confirmed NULL, vendor_confirmed NULL, pickup_confirmed 02:02:57, status fulfilled. Order: paid, bundle, no handoff/ack stamps yet. Owner: "3 taps; on that item the vendor confirmed before the manager (different sequence from the other 2); not after the 30 s window."
Triage: settles TR-001 (c) at ~90%: Chard took fulfill's vendor-first edge path; the manager's later Receiving-now tap could not attach because collect-ack accepts READY items only → fulfilled-unacked → buyer prompted on the list page. Vendor gets paid at the buyer's bundle ack sweep (no money lost); the UX is wrong mid-way and the manager's tap silently misses.

### OB-016 · 2026-09-14 · owner · buyer + manager · staging · order FA-2026-03444755
Report: "after I acknowledged the order the system asks me to review the vendors — this is not the time or place for the review request, it is just distracting; this popup should not be here (previously reported)." On the chard: "all items were marked ready before any of them were fulfilled; the one that did not work (chard) was the last, but both the vendor and manager clicked receive / fulfil within 30 seconds — completely sure of it."
Triage: (1) review prompt at the bundle acknowledgment → owner RULING: no review prompt at that moment on a bundle order; who/when is reviewed stays open (backlog test-notes #3). Added to the bundles batch. (2) chard sequence CONFIRMED by owner = vendor Fulfil one moment before the manager's Receiving-now. collect-ack refuses non-ready items with "Already collected — the vendor marked this item fulfilled." (route :83-90) — the wording misdescribes this case. Batch item 3 updated with the two design options; recommendation = vendor Fulfil waits for the manager's tap on bundle items. (3) Owner: the manager saw NOTHING on screen when the chard tap was refused — the run-sheet swallows the collect-ack error. Added to batch item 3: surface the refusal.

### OB-017 · 2026-09-14 · owner · Stripe + SQL on staging · order FA-2026-03444755
Report: Stripe balance shows the $36.32 payment (fees $1.35) and exactly three transfers from that charge: $7.42, $9.28, $5.55 (View more shows nothing further; the -$10.74 payout is an unrelated platform payout). SQL: Sourdough $7.42 tr_…Pb3uq7O 02:01:09 · Spinach $9.28 tr_…zbcSR9A 02:02:50 · Chard $5.55 tr_…kP43k3i 02:48:08, all `processing`; bundle_handed_off_at / bundle_buyer_ack_at / bundle_margin_transfer_id all NULL.
Triage: handoff-1 money CONFIRMED for all three items. The chard was paid 46 min later by the buyer's PER-ITEM acknowledge (the list-page prompt) — not the bundle ack; the three bundle stamps are empty, so handoff 2 has not happened and no margin transfer is expected yet. The review popup (OB-016) came from that per-item path. Vendor total 22.25 of 36.32; margin + platform share remain in balance. TR-001 money side: pass for handoff 1 incl. the edge item; handoff 2 + TR-005/TR-006 still reachable on this order.

### OB-018 · 2026-09-14 · owner · buyer · staging · order FA-2026-03444755
Report: after the manager marked handed off, the buyer's order DETAIL page showed BOTH the green acknowledge (per-item) and the yellow bundle-card acknowledge. "I already tapped the green acknowledge item on the same page. We should not have 2 buttons advising on the same action with different actions behind the scene." Buyer then tapped the yellow bundle acknowledge.
Triage: defect. On a bundle order the green hero appears once every item is fulfilled (`buyer/orders/[id]/page.tsx:555-556, :584-585` — bundleAwaitingPickup drives isPickupReady) while the bundle card's own button shows on the same condition (`:632`). Two controls, same wording, different money mechanics (per-item vendor pay vs bundle margin release). Rule: on a bundle order ONLY the bundle acknowledgment exists. Added to the bundles batch as item 6. Outcome of the bundle tap (margin transfer, review popup) pending report.

### OB-019 · 2026-09-14 · owner · Stripe + SQL on staging · order FA-2026-03444755
Report: after the yellow bundle acknowledge, Stripe shows a fourth transfer from the same charge: -$9.00 tr_3UFlIeAUXdXt3w5T3WIIihUc. Orders row: bundle_handed_off_at 03:25:00.965, bundle_buyer_ack_at 03:33:34.522, bundle_margin_transfer_id = that transfer. Per-item grid unchanged (7.42 / 9.28 / 5.55, processing).
Triage: second handoff money PROVEN, manager-first edge (8.5 min between handed-off and buyer ack; margin HELD then paid on the ack) → TR-006 pass. Reconciliation: 7.42+9.28+5.55+9.00 = 31.25 to connected accounts; payment 36.32 − Stripe fee 1.35 − 31.25 = 3.72 platform. Margin 9.00 matches the 2026-09-07 Stripe verification. TR-001 money side fully proven (handoff 1 ×3 incl. the edge item, handoff 2); its notification defects stand (batch).

### OB-020 · 2026-09-14 · owner · buyer · staging · order FA-2026-03444755
Report: "no review popup" after the yellow bundle acknowledge. "Buyer received bundle ready email for each vendor (2) but not one for the combined bundle." TR-010 screenshot: "don't have it." Paid-fee event for TR-028/029: "not tested yet."
Triage: review-popup ruling holds on the bundle path (the earlier popup came from the per-item acknowledge → batch item 6). **TR-005 → FAIL, two halves:** (a) per-vendor ready emails reached the bundle buyer (the 09-06 ready-route gate was meant to stop buyer sends on bundle orders — email channel leak? UNTRACED); (b) no combined bundle_ready EMAIL after the notify tap, though the in-app notice arrived (channel config or send path — UNTRACED). Added to the bundles batch as item 7 with a trace-first note. TR-010 stays fail, screenshot pending.

### OB-021 · 2026-09-15 · Claude (build record) · staging push pending
Push A built from OB-010/014/015/016/018/020: confirm route gated on bundle_id · fulfil route :483 send gated + bundle items refused before the manager's Receiving-now tap (409, owner option (i)) · detail page: per-item acknowledge hidden on bundle orders · list API + page: bundle_id carried, handed-off banner hidden on bundle orders · collect-ack wording · bundle_ready channels = push + in_app + email (new optional `channels` override on the type config, honored in the service) · placed notice: bundle branch (route loads bundle name + pickup spot; template + en/es keys, owner wording). Also: integration-test fixture passwords updated to meet the Dev project's new policy (owner approved). Gates: tsc 0 · vitest 90 files / 2225.
Triage: TR-001 + TR-005 → fixed-unverified. Owner retest: fresh bundle order through both handoffs; expect NO vendor-level notices to the buyer, a 409 with the "wait for the manager" message if a vendor taps Fulfil early, ONE ready notice + ONE ready email after the manager's notify tap, only the yellow acknowledge on the order page, and the bundle wording in the placed email.

### OB-022 · 2026-09-15 · Claude (build record) · Push B — market-box visibility
Built: vendor dashboard "My Upcoming Pickups" + the markets-page week strip now read market_box_pickups (TR-015) · buyer orders list counts picked_up pickups instead of the stored counter (TR-014 app half) · mig 252 makes check_subscription_completion() SECURITY DEFINER so its counter write is no longer filtered by RLS (TR-014 root; applied Dev + Staging by owner, Prod pending) · vendor market-box page shows "Order #…" on both tabs (TR-016) · vendor orders count cards count 'refunded' as cancelled (TR-048). Gates: tsc 0 · vitest 90 / 2225.
Triage: TR-014/015/016/048 → fixed-unverified. Owner retest: buy a box → it appears in "My Upcoming Pickups" and on the week strip on its pickup day; complete pickup 1 → /buyer/orders and /buyer/subscriptions/[id] agree (1 of N) and the subscription's weeks_completed reads 1 in SQL; vendor box page shows the order number; cancel an order as buyer → the vendor's cancelled count card includes it.

### OB-023 · 2026-09-15 · Claude (build record) · Push C + D (one push, owner: no unnecessary separate pushes)
Push C (TR-044): schedules route PUT + PATCH conflict checks no longer gated on food_trucks; mig 253 replaces check_vendor_schedule_conflict() without the FM early return and with vertical-neutral refusal wording (byte-identical base on all 3 envs; applied Dev + Staging by owner; Prod pending); flow-integrity pin "schedule-conflict check applies to BOTH verticals" (route vertical-blind + newest trigger definer ≥ 253 without the FM return; verified it would fail on the 247 body). Push D (TR-046): booking page operating-days line moved below the booth map, above the form. TR-049 deferred (owner). TR-010 (owner: "look at the code, follow the pattern"): the bundle grid used minmax(280px, 1fr) — on a narrow phone the column minimum exceeded the screen minus padding, so the card and every line in it overflowed; now minmax(min(280px,100%),1fr) + overflowWrap on the card + a wrapping name/price row. Cause from code only (~70%); retest on a phone. Gates: tsc 0 · lint 0 · vitest 90 / 2225 (+1 pin).
Triage: TR-044, TR-046 → fixed-unverified. Owner retest: FM vendor, box unchecked, activate a second market on an occupied weekday → refused naming the market; check the box → succeeds. Booking page with a map → the operating-days line sits under the map.

### OB-024 · 2026-09-15 · owner · organizer + FM vendors · staging `b9a9709b` (event market-1-mgr-pYDZ28XTmAU1HJSnR6)
Report (TR-021 / TR-022, condensed, owner's words kept where they carry the decision):
1. FM event-manager dashboard: the sections the organizer must complete for "Send Invitations" lack the red required asterisks the FT vertical has; "look at the differences and see which changes were applied only to FT that are also appropriate for FM — most or all should carry over"; labels/descriptions use food/meal terms → FM needs 'products'/'items' wording.
2. As an FM vendor with a schedule conflict, checking the acknowledgment box let me accept the invitation "even though I had not yet said I can operate at more than one market — I just checked the box acknowledging the records said I could not." A second vendor who set the multi-market declaration first saw different (good) text.
3. Organizer flow: after selecting the first two vendors and paring their menus, a third invited vendor responded; the organizer could select them but could NOT change their menu, and saw no option to bench them. "Once the organizer selects the initial trucks that locks down some other options — we need to decide what should be locked and what not, to give the organizer flexibility to approve/select vendors as they respond without losing options for later responses." Also: can the organizer select more vendors after the first selection at all?
4. The select page's paragraph says "Invite more vendors from your event dashboard" — "I can't find a way to invite more."
5. Clicking a selection notification lands on the page without reloading it; the vendor doesn't see the organizer's approved items until refresh (owner: may be a testing-speed artefact).
6. TR-022: dashboard stages correct (accepted ≠ selected). Public event page /farmers_market/events/[token] says "3 Vendors attending" and describes the unselected vendor's products; the order page hides them (correct).
Triage: TR-021 → pass (loop) · TR-022 → partial (public page FAIL). Items 1–6 → backlog "EVENTS ROUND 2026-09-15" for a design pass; item 3 needs an owner ruling on what locks after the first selection (decisions.md 2026-09-03 P1: pare locks when the shop publishes, FIRST round only); item 2 needs a ruling on whether the acknowledgment box may substitute for the declaration.

### OB-025 · 2026-09-17 · Claude (build record) + owner rulings · events round from OB-024 · one staging push
Owner rulings this session (decisions.md 2026-09-17): item 3 → rolling selection, trim lock per vendor ("go with your recommendation"). Item 2 → after seeing the consequence, WITHDRAWN: "i want single location vendors to still be able to trade their regular market spot for an event… trading 1 event for 1 market is not the same as being at two places at the same time" — no code change; trade-box wording → backlog (future). Item 1 asterisk half → withdrawn ("i misspoke"); wording half built. Item 5 (stale page after a notification click) → owner: "ignore this, i misspoke" — not built. New ruling from the pre-build code read: on self-service events a vendor takes event pre-orders only once SELECTED, never a penalty on their regular locations.
Built: 1a public event page lists selected vendors only on self-service events (TR-022) · 1b mig 254 (`get_available_pickup_dates`: selection conjunct on self-service events; live body verified = mig 238 on all 3 envs first; Dev applied + post-check matched) + shop mirror + paired-rule text + 2 pins (TR-064) · change 3 per-vendor trim lock in the select route + page, one pin line replaced with the owner's explicit approval (TR-065) · dropped vendor's selection stamp cleared with the benching + 1 pin (TR-066) · change 4 "Short on options?" sentence gives the real steps (TR-067) · change 5 FM wording table on OrganizerEventDetails, FT unchanged (TR-068). Gates at the last commit: tsc 0 · eslint 0 errors · vitest 90 files / 2229.
Found, not built (backlog): wave capacity counts vendors who cannot sell · the event MARKET page has no attendance filter.
Triage: TR-022 → fixed-unverified · TR-064–068 → fixed-unverified (TR-064 needs mig 254 pasted on Staging first).

### OB-026 · 2026-09-18 · owner · vendor (FM) · staging `14b7c627` (after the transactional purge)
Report (owner's words, lightly trimmed):
1. "in the process of adding listing items to markets I exceeded the limit for my tier. I got this notice 'Market limit reached (4/3). Your standard plan allows up to 3 traditional markets. Remove this listing from another market first, or upgrade your plan.' on …/farmers_market/vendor/listings/fcbac749-…/edit. And then tried to uncheck certain markets from the product so I could add another market. After saving the error persisted and the new market association does not seem to be saved. I tried again and unchecked a certain market then saved the listing so only 1 of 3 allowed markets was selected and then I added the other 2 market associations for the product and resaved – same error – bug."
2. TR-025: "as a vendor with an event on 9/26/26 I selected a new market and tried to book a booth for the same week – I did not get the withdraw from the event first – probably because the vendor has the multiple-locations box checked in their profile."
3. "the 'Your next two weeks' schedule on top of the markets page shows markets the vendor is affiliated with even if they don't have anything scheduled at that market, which is not representative of their actual schedule & obligations."
4. TR-034: "where is pickup capacity?" · "yes, new text under Private Events Readiness."
5. TR-036: "I don't think there is a way for a market manager to get to these docs or this page – it can't be opened – advise on how to test."
Triage (code read 2026-09-18):
1. → NEW ROW TR-069, **defect in the MESSAGE + UI, not in the limit.** The limit counts DISTINCT traditional markets across ALL the vendor's OTHER listings + market-box pickup markets (`api/vendor/listings/[listingId]/markets/route.ts:164-187`, `lib/vendor-limits.ts` getTraditionalMarketUsageExcludingListing :239-270). This vendor already spans 4 traditional markets elsewhere → ANY save of this listing with a traditional market is refused, whatever is ticked here. The message tells them to fix it on THIS listing, which cannot work; the selector never shows WHICH markets are counted. `standard` is a legacy tier name → free → limit 3 (`vendor-limits.ts:27-34, :60`). Fix candidates: message names the counted markets + says other listings count; MarketSelector shows the vendor-wide set; and/or the owner decides whether this grandfathered vendor should be over-limit at all.
2. → TR-025 stays OPEN, **by design, not a fail:** the booking guard exempts vendors with the multi-location declaration (`lib/events/booking-event-guard.ts:14, :45`) — the same rule as the schedule gate. Retest with a vendor whose box is UNCHECKED.
3. → NEW ROW TR-070 (design question, needs the owner's definition): the strip lists every market where the vendor has an ACTIVE attendance row (`lib/vendor/week-strip.ts:301-308`, `vendor_market_schedules.is_active`). In the app's model that IS the obligation. Owner's "nothing scheduled" may mean no listing linked / no orders / no booking that week — ask which before designing.
4. → TR-034: Private Events Readiness half PASS (FM). "Pickup Capacity" is FOOD-TRUCK ONLY (`vendor/edit/page.tsx:157` "FT only, mig 216") — retest that half on a food-truck vendor's /vendor/edit; registry row corrected.
5. → TR-036: the door is the manager dashboard's vendor list (superseded same day by option A — see the registry row)

### OB-029 · 2026-09-19 · owner (user-feedback review) · platform admin + market manager (FM) · staging `a52cd6f0`
Report (four parts): (1) `/farmers_market/admin/vendors/[id]` — "the admin cannot see which markets a vendor is associated with"; FM vendors show FT questions ("vehicle type, vehicle length") in the Event Readiness Application. (2) `/farmers_market/admin/vendors` — "still using old tier labels (and perhaps old tier calculations)"; Valley Verde Farm shows 10 listings on the list, 9 on the detail. (3) Manager dashboard `/market-manager/[id]/dashboard` — reorder by how managers work; a schedule strip like the other dashboards under the market name; "What's on your plate" → "Action Items"; section renames + sub-section order (Setup · Booths & Occupancy · Vendors · Money & Activity · Communication & insights). (4) "Weekly booth bookings vs Booth occupancy — duplication?"
Triage (code read 2026-09-19): (1a) confirmed — the detail page never queried `market_vendors` (`VendorDetailAdminPage.tsx:44-83`); only the list did. (1b) confirmed and worse than labels — the vendor form IS vertical-specific (`EventReadinessForm.tsx:345-568`) but the admin read-out rendered every answer through FT labels AND FT value maps (`VendorDetailAdminPage.tsx:259-274`): FM "Tent / Booth" displayed as "Food Trailer (truck + trailer)", "Requires refrigeration" as "Can sit 30+ min", "Max Runtime: undefined hours", per-hour headcount labelled per 30-min wave. (2a) confirmed — filter offered `free/standard/premium/featured` (`VendorsAdminTable.tsx:97`) while the unified tiers are free/pro/boss and legacy names normalize to free (`vendor-limits.ts:27-35`); rows printed the raw stored value (`:329`), detail too (`:347`). (2b) mechanism confirmed — the list counted every `listings` row incl. soft-deleted (`VendorsAdminPage.tsx:60,101`, no `deleted_at` filter); the detail excluded deleted (`VendorDetailAdminPage.tsx:77`). Neither counted market boxes (own table `market_box_offerings`). (3) all cards are components in `FmDashboardBody.tsx`; presentation-only regroup. (4) not a duplicate: the grid is this week's per-tier capacity picture (placeholders, holds, paid/pending, room left — `BoothOccupancyGrid.tsx:54-67`); the list pages week-by-week and holds the booth-number editor + Cancel-week (`WeeklyBookingsCard.tsx:110-111`). Owner rulings: listings = published + not deleted, boxes shown separately; Action Items = pending approvals + booth assignments only.
Fix part A (2026-09-19): Markets card on the admin vendor detail (name → admin market page, roster status, booth # + size, declared days); shared per-vertical label map `lib/vendor/event-readiness-labels.ts` used by BOTH the vendor form and the admin read-out (+ unit test); tier filter Free/Pro/Boss ("Free" also matches legacy names + NULL) and normalized tier on list + detail; listing count = published & not deleted on both pages; active market boxes counted separately on both. → TR-093–096. Parts B (dashboard regroup) · C (Action Items) · D (manager schedule strip) follow.

### OB-028 · 2026-09-19 · owner · vendor (FM) · staging `041fd629`
Report: "as a vendor, when booking a booth on …/farmers_market/markets/d6cbe856-…/book I selected a tier and agreed to the market rule > when I clicked continue to payment I was given an error saying 'BOOTH_CONFLICT: booth number 5 is already assigned to an on-platform vendor at this market'. I went back to the top and changed the booth tier from small to medium and I got the same error. We have a conflict between the auto assignment of booth #'s and the manual assignment from market manager is my guess – investigate and let me know."
Triage (code read 2026-09-19, ~90%): the owner's guess is right, and it is a self-conflict. Mig 186 (2026-07-11) made the booking RPC HONOR the vendor's manager-pinned booth — it inserts the rental with `booth_number` = the vendor's own `market_vendors.booth_number` (`applied/…_186_…sql:60-78`). Mig 146's uniqueness trigger then rejects that insert: check (a) fails when ANY `market_vendors` row at the market holds that number, and its self-exclusion only covers the SAME table (`v_table <> 'market_vendors' OR id <> NEW.id`, `…_146_…sql:84-92`) — so a rental firing the trigger collides with the booking vendor's OWN pin. Tier is irrelevant (the pin drives the number), which is why small → medium changed nothing. Net effect: **no vendor the manager has pinned can book a week at all** — the exact case the 2026-09-18 "no paid week yet" / paid-week rule now asks vendors to do. Fix = mig 256: replace `check_booth_number_uniqueness()` so a booth is "taken" only by a DIFFERENT vendor (exclude rows with the same `vendor_profile_id` in checks (a) and (c); placeholders have no vendor and keep the current logic). App-side twin `lib/markets/booth-conflict-checks.ts:98-102` (manager pinning a booth the same vendor already rents) gets the same self-exclusion. → TR-078 fail, fix proposed.
Also (TR-069 note written into the printable list by the owner): "when a vendor has used up their markets available for their tier the other markets are not selectable… only 3 of the 7 markets shown for this vendor". Triage: that is the market picker's own tier gate (`MarketSelector.tsx:238-258` greys markets beyond the vendor-wide limit) — the greying is the tier limit, not acceptance. The server message fixed on 09-18 is only reachable when the picker is bypassed; the picker already says "Your plan allows N unique traditional markets across ALL your listings (currently using 4 of 3)". → TR-069: owner to rule pass-as-covered or keep open.

Fix (2026-09-19, booth round part A): full model read → `apps/web/.claude/booth_model_review.md` (12 conflicts); owner rulings → `booth_model_design.md` (BR-1…13). Part A shipped: mig 256 (uniqueness trigger never counts a vendor's OWN pin as a conflict; a pin is a SOFT HOLD that yields when unpinned booths run out; a season gets ONE booth number for all weeks; booth-size request column), `booth-conflict-checks.ts` same-vendor exclusion + pins not counted as capacity, revoke clears the pin, occupancy grid keyed on Sunday (it never showed paid renters), booking routes translate BOOTH_CONFLICT. Retests: TR-078 (this bug), TR-079–082. Parts B–D (approve-once, payment writes the assignment, credits) follow.

### OB-027 · 2026-09-18 · owner · market manager (FM) · staging `0ff23581`
Report: "As market mgr I received applications from vendors and accepted them – then the system prompted me to assign a booth number. I did but the vendor did not request a certain booth or pay for a booth yet – should the system alert the market mgr when they are assigning booth numbers for on-app vendors that the vendor has not purchased a booth yet? Did we allow a grace period or something that would support the assignment of a booth without payment?"
Triage (code read): the booth number is the manager's STANDING pin (`market-manager/[marketId]/vendor-booth/route.ts` header — the booking RPC treats the pinned booth as the vendor's); paying is a separate per-week act by the vendor (`weekly_booth_rentals`, Codebase_Map 12 items 6 + 8). No grace period exists because nothing was ever timed against payment. Nothing warned the manager at assignment, and the FM sell gate only requires an active attendance row (mig 238 `:162`), so an unpaid vendor can sell a week at a fee-charging FM market. Owner ruling: **part 1** (alert at assignment) → BUILT 2026-09-18, TR-072: the roster row shows "· no paid week yet" for approved FM vendors at markets with a priced booth tier who hold no paid current/upcoming rental. **Part 2** (should an unpaid vendor be able to sell a week at a fee-charging managed market?) → folded into the managed-market design stage (backlog, TR-070); owner: begin the planning process so the decisions are tied together. → "View docs" link, rendered ONLY for vendors who ticked info-sharing consent at signup (`components/market-manager/VendorBoothList.tsx:35-38, :510`; consent captured on `vendor-signup/page.tsx`). Test path: a vendor signed up WITH the consent box ticked and on that market's roster → manager opens the roster → View docs. Row updated with the path.

### OB-030 · 2026-09-25 · tester (via owner) · manager + vendors (FM) · W1 + W2 of the self-contained workflows · staging build not stated
Report (tester's words, verbatim as pasted by the owner):

Test responses:
++Group W1 tests:++
• All W1  tests not mentioned = passed.
• W1 tests that did not completely pass =  3, 11, 12
• Tester reported that this portion of the item 3 test failed or was not able to be done:
“Other lines MAY appear, and each one's link must scroll to the right place: "has no booth numbers yet…" → link "Set numbers →" → Setup section "N held or placeholder numbers have no size…" → link "Re-pick →" → Vendors at this market " is over capacity this week…" → link "Fix →" → Booths & occupancy "Stripe needs more information before it can pay you…" → link "Finish →" → Setup section "N season vendors are owed a settlement…" → link "Settle →" → a Seasons card in Setup”    >> Notes :  This info doesn’t seem to apply to this section.
• Tester reported that this portion of the item 11 test failed or had a problem:
problem with “Weekly booth bookings”, “10x10 1–10 · 10x15 11–20.”,  >> Notes:  I would add a parenthesis around the booth numbers, the size and booth numbers need to have some kind of separation. No weekly bookings, so there is no statement here.
• Tester reported that this portion of the item 12 test failed or had a problem:
Notes : I cant find a “weekly booth bookings” card, so I can’t test this one. Where is it?

++Group W2 tests:++
• All W2  tests not mentioned = passed.
• W2 tests that did not completely pass =  1, 7, 9, 11, 12, 14, 15, 16, 17
• Tester reported that this portion of the item 1 test failed or had a problem:
“As V1: open /farmers_market/vendor/markets. Find Market 2 Test and open its day picker (the weekday toggles). Tick a day. Expect: it is refused with a RED message: "Market 2 Test reviews vendor applications”    Notes: > Not sure where to find this..there is no day picker, just their market hours and no way to select it. It’s just text.  
• Tester reported that this portion of the item 1 test failed or had a problem – Notes : There is no agreement text inside the day picker. No day picker in this section
• The other portions of item 1 were marked green so were considered to have performed correctly.  Analyze the test and review the code to determine what worked & what didn’t

• Tester reported that this portion of the item 7 test failed or had a problem: 
“Tick a day, then tap "Done — continue to booking"  Notes > Said “continue to payment” Expect: the booking form unlocks and the season option appears. I had booked through the market link, not locations. Didn’t see a season pop up. It went to book a booth at Market 2 test. Then pick a week drop down. There was a green box showing the booth number and assigned by the manager. The market agreement check box and then continue to payment. I paid and booked it. No other options after that.
• The other portions of item 7 were marked green so were considered to have performed correctly.  Analyze the test and review the code to determine what worked & what didn’t

• Tester reported that this portion of the item 9 test failed or had a problem: 
“As the MANAGER: the dashboard's visibility card. Expect: it reads "Your market isn't visible to buyers yet" and, in its list of what a vendor needs, includes "…and a paid booth week (your market charges for booths, so a vendor counts only once they've paid for a current or upcoming week)". Open /farmers_market/markets (the public list, logged out or as a buyer). Expect: Market 2 Test is NOT in the list”   
Notes  >  This is confusing, nothing coming up saying market isn’t visible when signed in as a manager. Not sure where to find a list of what the vendor needs..Also, when I went through it before, I added the listing with vendor 1 so that i could find the market and apply as a vendor…so it’s visible, the vendor has paid so it shows 2 vendors, with listings. I may have to create 2 new vendors not associated at all and try again. There is no visibility card.
• The other portions of item 9 were marked green so were considered to have performed correctly.  Analyze the test and review the code to determine what worked & what didn’t

• Tester reported that this portion of the item 11 test failed or had a problem:  
“The manager's visibility card reads "✓ Your market is visible to buyers"”   Notes: > not seeing this anywhere
• The other portions of item11 were marked green so were considered to have performed correctly.  Analyze the test and review the code to determine what worked & what didn’t

• Tester reported that this portion of the item 12 test failed or had a problem:  
‘controls are greyed out’  - No notes accompanied the reported problem.
• The other portions of item12 were marked green so were considered to have performed correctly.  Analyze the test and review the code to determine what worked & what didn’t

• Tester reported that this portion of the item 14 test failed or had a problem:  
“but STOP before paying (close the Stripe page).”    - Notes: > There was no way to close stripe, I had to hit the back button on browser and it says “stepped away from payment” No charge was made. Your booking is still on file as pending
• The other portions of item14 were marked green so were considered to have performed correctly.  Analyze the test and review the code to determine what worked & what didn’t

• Tester reported that item 15 test failed or had a problem:  
“As V2: go back and pay for that week. Expect (manager): the roster now shows V2 with #3 and small. "Booth occupancy — this week" shows #3 as "Paid this week" and the small size's "N of M occupied" count went up by one. 
Notes: > I got error message “You already have a booking for this week. If you need to change anything, contact the market manager.”  I can’t test this because of the error message and not being able to pay for the booking as V2.”

• Tester reported that item 16 test failed or had a problem:    
Notes > Not enough information to test. Because of the error payment message, the vendors do not have a paid booth yet.

• Tester reported that item 17 test failed or had a problem:    
Notes: > There is no season option visible.

Additional notes from the tester not specifically associated with a particular test :  (review these, see where they fit and include in your response to testing.

Errors: Disconnect all listings from this market button under manage my listings. So that you don’t have to edit all listings when you take off a market. 
I had to take too many steps to be able to setup a vendor with no history. There was no listing for market 2, because there were no vendors with listings. When I looked at admin and saw Hill country had been a vendor and had a place holder, I logged into that account and rented a booth. But I was not able to add any listings to market 2, because Hill country had 3 markets with held booths, but only 1 paid booth. So market 2 was greyed out. I had to go back through all of Hill country’s listings and edit and remove Westgate mall off each one. After that I was able to choose Market 2 test. Next I have to search for Hill country in the new vendor (v1) login to be able to see market 2 and rent a booth as vendor 1. 

https://inpersonmarketplace-git-staging-tsjr00s-projects.vercel.app/farmers_market/vendor/markets - on this page keeping the home market open makes it easy to select the wrong market. Suggest that it not be auto expanded.

Needs some way to refund if they picked the wrong date. Or within 24 hrs. Haven’t found a way for the vendor to cancel. On the market manager’s side, maybe change “cancel this week” say “cancel this booking” sounds like you are cancelling the market for the week. 

Needs a prompt to set your schedule before payment, a sequence to set up a booking. 

Pending payments need a link or something to show where to go to pay. When I tried to book again, got the error message about already having booked it. 

Triage (code read 2026-09-25; working file `apps/web/.claude/triage_2026-09-25_tester_W1W2.md`; owner: "don't assume" — untested is not pass):
DEFECTS — D1 (BLOCKER, W2.15–17) an abandoned booth Checkout leaves the week pending_payment; re-booking → DUPLICATE (`api/vendor/markets/[id]/book/route.ts:370-378`); no Pay-now for a pending FM booth (FT spots have one, `BookParkSpotForm.tsx:1109`); release = expire-orders Phase 16 after 24h, daily, Prod only (`cron/expire-orders/route.ts:73-75, :2908-2916`) while the banner says ~30 min (`BookBoothForm.tsx:219-224`). · D2 (W1.11/12) "Weekly booth bookings" with no bookings ever collapses to one line and hides its help paragraph and the Print week sheet (`WeeklyBookingsCard.tsx:118-125`, `DashboardCard.tsx:186`). · D3 (W2.12, ~80%) locked roster dropdowns are disabled but styled white (`BoothNumberPicker.tsx:79-86`). · D4 (W2.1) the apply-required refusal carries the heading "Cannot deactivate" (`MarketScheduleSelector.tsx:144-145, :296-298`). · D5 (W2.9/11) the visibility card lives inside the collapsed Setup section (`FmDashboardBody.tsx:144, :179`). · D6 (W2.7 + W2.9, ~85%) saving a listing with a traditional market auto-declares EVERY operating day there, client-side (`ListingForm.tsx:428-455`) — violates BR-1(a) (approval before activating days at a managed market) and BR-13's intent; the rows then grandfather the vendor past the day-picker's approval gate (`schedules/route.ts:62-68`). The tester's "I added the listing with vendor 1 so that i could find the market" is the matching act; the successful booking proves an active day existed (`booking-gates.ts:81-91`).
NOT DEFECTS — W1.3 conditional lines appear only when their condition exists (`ManagerActionSummary.tsx:97-122`) → required checks pass, optional links UNTESTED · W2.1 picker path = tick the market to expand → Set/Manage Schedule (`vendor/markets/page.tsx:437-453`) → UNTESTED · W2.7 season renders only with an open season (`SeasonBookingSection.tsx:69-70`) → UNTESTED · W2.14 PASS (Back is the way out of Stripe; banner as designed) · W2.17 UNTESTED · the tester's "setup took too many steps" = plan limit (3 traditional markets) + radius-filtered market list (`api/vendor/markets/route.ts:178-190`) + D6.
OWNER RULINGS 2026-09-25 — (a) bulk "disconnect all listings from this market" → backlog · (b) setup friction → no app change; training note for writing protocols · (c) home market not auto-expanded (badge/shading ok) → fix · (d) vendor cancel/refund of a paid week → backlog, limited, pending the owner's contract research · (e) "Cancel week" → "Cancel this booking" → fix · (f) vendor Markets card buttons in workflow order with an Apply step and next-step reinforcement → fix, together with D6 · tester's parentheses ask (W1.11 "10x10 (1–10)") → with D2, pending owner go.
