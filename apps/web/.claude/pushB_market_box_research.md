# Push B research — market-box visibility (TR-014 / 015 / 016 / 048) — 2026-09-15

- [x] TR-015 dashboard "My Upcoming Pickups": reads ONLY `order_items.pickup_date` (dashboard/page.tsx:268-277); market-box
  pickups live in `market_box_pickups` (subscription → offering → vendor_profile_id / pickup_market_id) → never counted.
  FIX (diff presented 2026-09-15): second query on market_box_pickups, merged into pickupMap by date|market.
- [ ] TR-015 vendor markets page week strip: `lib/vendor/week-strip.ts` loader (schedules, commitments, events, overrides,
  blackouts) — no market-box source. FIX = add a `market_box` day entry; read the loader before diffing.
- [ ] TR-014 pickup-count mismatch: buyer orders LIST uses `market_box_subscriptions.weeks_completed` (api/buyer/orders/route.ts:450);
  subscriptions DETAIL counts pickups with status 'picked_up' (subscriptions/[id]/page.tsx:132,226). `weeks_completed` is written
  only by DB trigger `trigger_check_subscription_completion` (AFTER UPDATE on market_box_pickups → `check_subscription_completion()`,
  snapshot Triggers block). Hypothesis (~70%): the trigger increments on a status the app no longer writes (e.g. 'completed' vs
  'picked_up'), or fires before the status lands. EVIDENCE NEEDED: pg_get_functiondef on Staging + the owner's subscription row.
  Likely fix: derive the list count from pickups (same predicate as the detail page) — one source, no trigger dependence.
- [ ] TR-048 vendor orders count cards: cards count items by status (vendor/orders/page.tsx:369-373: 'cancelled' only); the list
  labels an order 'cancelled' when NO item is ready/confirmed/pending/fulfilled (:387-394). Buyer cancel writes item status
  'cancelled' (:145, :207) OR 'refunded' (:261). Hypothesis (~70%): the owner's item ended 'refunded' → card misses it, list shows
  it. EVIDENCE NEEDED: that order's item statuses. Fix: cards count cancelled = status IN ('cancelled','refunded').
- [ ] TR-016 order number on vendor box page: buyer list derives orderNumber from the LINKED order (route.ts:415) — subscriptions
  carry `order_id`. Vendor page fix = show the linked order's order_number the same way. Read vendor/market-boxes/[id] first.
