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
