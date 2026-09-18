-- ============================================================================
-- MAINTENANCE — STAGING transactional-layer purge — written + RAN 2026-09-18
-- ============================================================================
-- RESULT: dry run (orders guard 54→55) raised "guard: orders expected 54, found 54",
-- confirmation showed 54/14/454/246 unchanged. First real run failed inside the
-- block on vendor_payouts → market_box_subscriptions FK (rolled back; payouts
-- delete moved first). Second real run: success. Owner-run confirmation:
-- orders 0 · event markets 0 · catering_requests 0 · booth rentals 0 ·
-- notifications 0 · error_logs 0 · KEEP user_profiles 37 · vendor_profiles 28 ·
-- listings 69 · markets 18 · market_vendors 23 · market_box_offerings 12 — exact.
-- ============================================================================
-- ⛔ DESTRUCTIVE — RUN THE FAILING-GUARD DRY RUN FIRST (see bottom), THEN THE REAL RUN.
-- Follows apps/web/docs/destructive-data-workflow.md: ONE atomic DO block, exact
-- owner-run counts as guards, kept-structure counts captured inside the block,
-- post-checks inside the block. An exception anywhere rolls back everything.
--
-- SCOPE (owner 2026-09-18): purge the TRANSACTIONAL layer — orders, subscriptions,
-- events + their event markets, bookings, carts, notifications, error log. KEEP
-- accounts, vendor profiles, listings, regular markets + schedules + attendance +
-- listing links, market-box offerings, bundles (as products), regular-market
-- roster rows (market_vendors at non-event markets).
--
-- STRIPE: every Stripe id in the purge set is TEST MODE — owner in writing
-- 2026-09-18: "all transactions were done in stripe test mode". Counts: payments 47,
-- checkouts 52, bundle margin transfers 2, payouts 13, subscriptions 9, event fees 5,
-- booth rentals 21, park bookings 10, booking groups 1. Test-mode objects stay in
-- Stripe's test dashboard with no order behind them (harmless).
--
-- PRE-CHECK (owner-run 2026-09-18, exact counts — these ARE the guards):
--   orders 54 · order_items 59 · payments 47 · vendor_payouts 16 · order_ratings 6
--   market_box_subscriptions 9 · market_box_pickups 32
--   catering_requests 14 · event markets 14 · market_vendors 49 (26 at event markets)
--   event_vendor_listings 52 · event_vendor_fee_payments 6 · event_company_payments 0
--   event_change_requests 0 · event_ratings 0 · event_waves 0 · event_wave_reservations 0
--   vendor_date_blackouts 6 (all event-sourced) · weekly_booth_rentals 24 ·
--   park_spot_bookings 11 · booth_booking_groups 1 · booth_credits 2 ·
--   park_standing_reservations 5 · carts 24 · cart_items 6 · notifications 454 ·
--   error_logs 246
--   KEEP: user_profiles 37 · vendor_profiles 28 · listings 69 · non-event markets 18 ·
--   market_schedules@non-event 33 · vendor_market_schedules@non-event 62 ·
--   listing_markets@non-event 150 · market_box_offerings 12 · market_bundles 1 ·
--   market_vendors@non-event 23
--   BLOCKERS: offerings at event markets 0 · event markets with no request 1 (fine —
--   the market is deleted directly) · events with no market 1 (fine — deleted
--   directly) · manual blackouts 0 · bundle orders 3 (deleted; the bundle stays)
--
-- BLAST RADIUS (FK map, SCHEMA_SNAPSHOT.md → Foreign Keys):
--   DELETE orders → CASCADE order_items, payments, order_ratings; SET NULL on
--     market_box_subscriptions.order_id, cause_ledger.order_id, vendor_fee_ledger.order_id
--   DELETE order_items → CASCADE vendor_payouts; SET NULL vendor_fee_ledger.order_item_id
--   DELETE market_box_subscriptions → CASCADE market_box_pickups
--   DELETE markets (event) → CASCADE market_schedules, vendor_market_schedules,
--     market_vendors, event_vendor_listings, listing_markets, event_waves,
--     event_wave_reservations, event_vendor_fee_payments, event_company_payments,
--     vendor_date_blackouts, market_favorites, market_documents, market_broadcasts,
--     market_surveys, market_day_checkins, market_optin_selections,
--     vendor_market_agreement_acceptances, vendor_location_cache, booth_credits …
--     (all at EVENT markets only). BLOCKED BY: order_items.market_id (orders go
--     first), market_box_offerings.pickup_market_id RESTRICT (0 at event markets),
--     circular markets.catering_request_id ↔ catering_requests.market_id (nulled).
--   DELETE catering_requests → CASCADE event_change_requests, event_ratings,
--     event_vendor_fee_payments, event_company_payments
--   DELETE market_schedules (event, via cascade) → trigger cleans cart rows (carts
--     are deleted anyway)
--   DELETE order_ratings → trigger recomputes vendor_profiles.average_rating /
--     rating_count (rows stay; the 6 test ratings' effect on stats disappears)
--   DELETE listing_markets (event, via cascade) → trigger refreshes
--     vendor_location_cache (rows recomputed, vendors stay)
--
-- POST-CHECK (inside the block): purge set = 0; kept counts identical to capture.
-- Confirmation query for the owner afterwards is at the bottom.
-- ============================================================================

DO $$
DECLARE
  k_users bigint; k_vendors bigint; k_listings bigint; k_markets bigint;
  k_schedules bigint; k_vms bigint; k_lm bigint; k_offerings bigint; k_bundles bigint; k_roster bigint;
  leftover bigint;
BEGIN
  -- 1. GUARDS — exact owner-run counts. Any mismatch = the database is not the one
  --    that was inventoried → stop, nothing deleted.
  IF (SELECT count(*) FROM orders) <> 54 THEN RAISE EXCEPTION 'guard: orders expected 54, found %', (SELECT count(*) FROM orders); END IF;
  IF (SELECT count(*) FROM order_items) <> 59 THEN RAISE EXCEPTION 'guard: order_items expected 59'; END IF;
  IF (SELECT count(*) FROM payments) <> 47 THEN RAISE EXCEPTION 'guard: payments expected 47'; END IF;
  IF (SELECT count(*) FROM vendor_payouts) <> 16 THEN RAISE EXCEPTION 'guard: vendor_payouts expected 16'; END IF;
  IF (SELECT count(*) FROM market_box_subscriptions) <> 9 THEN RAISE EXCEPTION 'guard: subscriptions expected 9'; END IF;
  IF (SELECT count(*) FROM market_box_pickups) <> 32 THEN RAISE EXCEPTION 'guard: pickups expected 32'; END IF;
  IF (SELECT count(*) FROM catering_requests) <> 14 THEN RAISE EXCEPTION 'guard: events expected 14'; END IF;
  IF (SELECT count(*) FROM markets WHERE market_type = 'event') <> 14 THEN RAISE EXCEPTION 'guard: event markets expected 14'; END IF;
  IF (SELECT count(*) FROM weekly_booth_rentals) <> 24 THEN RAISE EXCEPTION 'guard: booth rentals expected 24'; END IF;
  IF (SELECT count(*) FROM park_spot_bookings) <> 11 THEN RAISE EXCEPTION 'guard: park bookings expected 11'; END IF;
  IF (SELECT count(*) FROM notifications) <> 454 THEN RAISE EXCEPTION 'guard: notifications expected 454'; END IF;
  IF (SELECT count(*) FROM error_logs) <> 246 THEN RAISE EXCEPTION 'guard: error_logs expected 246'; END IF;
  IF (SELECT count(*) FROM market_box_offerings o JOIN markets m ON m.id = o.pickup_market_id WHERE m.market_type = 'event') <> 0
    THEN RAISE EXCEPTION 'guard: an offering picks up at an event market — would block'; END IF;

  -- 2. CAPTURE the kept structure (exact, inside this statement).
  SELECT count(*) INTO k_users FROM user_profiles;
  SELECT count(*) INTO k_vendors FROM vendor_profiles;
  SELECT count(*) INTO k_listings FROM listings;
  SELECT count(*) INTO k_markets FROM markets WHERE market_type <> 'event';
  SELECT count(*) INTO k_schedules FROM market_schedules ms JOIN markets m ON m.id = ms.market_id WHERE m.market_type <> 'event';
  SELECT count(*) INTO k_vms FROM vendor_market_schedules v JOIN markets m ON m.id = v.market_id WHERE m.market_type <> 'event';
  SELECT count(*) INTO k_lm FROM listing_markets lm JOIN markets m ON m.id = lm.market_id WHERE m.market_type <> 'event';
  SELECT count(*) INTO k_roster FROM market_vendors mv JOIN markets m ON m.id = mv.market_id WHERE m.market_type <> 'event';
  SELECT count(*) INTO k_offerings FROM market_box_offerings;
  SELECT count(*) INTO k_bundles FROM market_bundles;
  IF k_users <> 37 OR k_vendors <> 28 OR k_listings <> 69 OR k_markets <> 18 OR k_schedules <> 33 OR k_vms <> 62 OR k_lm <> 150 OR k_roster <> 23 OR k_offerings <> 12 OR k_bundles <> 1
    THEN RAISE EXCEPTION 'guard: kept structure differs from the inventory (users % vendors % listings % markets % schedules % vms % lm % roster % offerings % bundles %)', k_users, k_vendors, k_listings, k_markets, k_schedules, k_vms, k_lm, k_roster, k_offerings, k_bundles; END IF;

  -- 3. DELETES — children before parents.
  -- orders + subscriptions. vendor_payouts FIRST: it references BOTH order_items
  -- (cascade) and market_box_subscriptions / market_box_pickups (NO ACTION) — the
  -- first real run (2026-09-18) failed on that FK, rolled back cleanly, fixed here.
  DELETE FROM vendor_payouts;
  DELETE FROM market_box_pickups;
  DELETE FROM market_box_subscriptions;
  DELETE FROM payments;
  DELETE FROM order_ratings;
  UPDATE orders SET event_wave_reservation_id = NULL;
  DELETE FROM event_wave_reservations;
  DELETE FROM order_items;
  DELETE FROM orders;
  -- carts
  DELETE FROM cart_items;
  DELETE FROM carts;
  -- bookings (regular markets stay, so these are explicit)
  DELETE FROM booth_credits;
  DELETE FROM weekly_booth_rentals;
  DELETE FROM park_spot_bookings;
  DELETE FROM booth_booking_groups;
  DELETE FROM park_standing_reservations;
  -- events + their markets
  DELETE FROM vendor_date_blackouts;
  DELETE FROM event_vendor_fee_payments;
  DELETE FROM event_company_payments;
  DELETE FROM event_change_requests;
  DELETE FROM event_ratings;
  DELETE FROM event_waves;
  UPDATE markets SET catering_request_id = NULL WHERE market_type = 'event';
  DELETE FROM catering_requests;
  DELETE FROM markets WHERE market_type = 'event';   -- cascades roster, menus, schedules, links AT EVENT MARKETS
  -- clutter
  DELETE FROM notifications;
  DELETE FROM error_logs;

  -- 4. POST-CHECKS.
  SELECT (SELECT count(*) FROM orders) + (SELECT count(*) FROM order_items) + (SELECT count(*) FROM payments) + (SELECT count(*) FROM vendor_payouts) + (SELECT count(*) FROM market_box_subscriptions) + (SELECT count(*) FROM market_box_pickups) + (SELECT count(*) FROM catering_requests) + (SELECT count(*) FROM markets WHERE market_type = 'event') + (SELECT count(*) FROM event_vendor_listings) + (SELECT count(*) FROM weekly_booth_rentals) + (SELECT count(*) FROM park_spot_bookings) + (SELECT count(*) FROM booth_credits) + (SELECT count(*) FROM carts) + (SELECT count(*) FROM notifications) + (SELECT count(*) FROM error_logs) INTO leftover;
  IF leftover <> 0 THEN RAISE EXCEPTION 'post-check: purge set not empty (% rows remain)', leftover; END IF;
  IF (SELECT count(*) FROM user_profiles) <> k_users THEN RAISE EXCEPTION 'post-check: user_profiles changed'; END IF;
  IF (SELECT count(*) FROM vendor_profiles) <> k_vendors THEN RAISE EXCEPTION 'post-check: vendor_profiles changed'; END IF;
  IF (SELECT count(*) FROM listings) <> k_listings THEN RAISE EXCEPTION 'post-check: listings changed'; END IF;
  IF (SELECT count(*) FROM markets) <> k_markets THEN RAISE EXCEPTION 'post-check: non-event markets changed'; END IF;
  IF (SELECT count(*) FROM market_schedules) <> k_schedules THEN RAISE EXCEPTION 'post-check: regular-market schedules changed'; END IF;
  IF (SELECT count(*) FROM vendor_market_schedules) <> k_vms THEN RAISE EXCEPTION 'post-check: regular-market attendance changed'; END IF;
  IF (SELECT count(*) FROM listing_markets) <> k_lm THEN RAISE EXCEPTION 'post-check: regular-market listing links changed'; END IF;
  IF (SELECT count(*) FROM market_vendors) <> k_roster THEN RAISE EXCEPTION 'post-check: regular-market roster changed'; END IF;
  IF (SELECT count(*) FROM market_box_offerings) <> k_offerings THEN RAISE EXCEPTION 'post-check: offerings changed'; END IF;
  IF (SELECT count(*) FROM market_bundles) <> k_bundles THEN RAISE EXCEPTION 'post-check: bundles changed'; END IF;
END $$;

-- ============================================================================
-- DRY RUN FIRST (workflow rule 3): paste the block above with ONE guard changed —
--   `<> 54` on the orders line → `<> 55`.
-- Expected: ERROR "guard: orders expected 54, found 54" (the block's own message) and
-- NOTHING deleted — prove it with the confirmation query below (all PURGE lines
-- still at their inventory counts). Only then paste the block unchanged.
--
-- CONFIRMATION (read-only, after each run):
--   SELECT 'orders' AS t, count(*) FROM orders
--   UNION ALL SELECT 'event markets', count(*) FROM markets WHERE market_type = 'event'
--   UNION ALL SELECT 'catering_requests', count(*) FROM catering_requests
--   UNION ALL SELECT 'booth rentals', count(*) FROM weekly_booth_rentals
--   UNION ALL SELECT 'notifications', count(*) FROM notifications
--   UNION ALL SELECT 'error_logs', count(*) FROM error_logs
--   UNION ALL SELECT 'KEEP user_profiles', count(*) FROM user_profiles
--   UNION ALL SELECT 'KEEP vendor_profiles', count(*) FROM vendor_profiles
--   UNION ALL SELECT 'KEEP listings', count(*) FROM listings
--   UNION ALL SELECT 'KEEP markets (all = regular)', count(*) FROM markets
--   UNION ALL SELECT 'KEEP market_vendors (regular roster)', count(*) FROM market_vendors
--   UNION ALL SELECT 'KEEP market_box_offerings', count(*) FROM market_box_offerings;
-- Dry run → 54 / 14 / 14 / 24 / 454 / 246 / 37 / 28 / 69 / 32 / 49 / 12.
-- Real run → 0 / 0 / 0 / 0 / 0 / 0 / 37 / 28 / 69 / 18 / 23 / 12.
-- ============================================================================
