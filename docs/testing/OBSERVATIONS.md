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
