-- ============================================================================
-- MAINTENANCE — DEV transactional-layer purge — RAN 2026-09-18 (owner-pasted)
-- ============================================================================
-- ⛔ DESTRUCTIVE. RECORD OF A RUN THAT PREDATES docs/destructive-data-workflow.md.
-- Do NOT reuse this text on any environment. It is kept because the workflow
-- (rule 6) requires every destructive run to exist as a file — and because
-- this run is the incident the workflow was written from.
--
-- WHAT IT DID (Dev only): emptied orders, order_items, payments, vendor_payouts,
-- order_ratings, event_wave_reservations, market_box_subscriptions,
-- market_box_pickups, cart_items, carts, notifications, error_logs.
-- Kept (verified after by owner-run count): user_profiles 6, vendor_profiles 5,
-- listings 6, markets 8, market_schedules 12, market_box_offerings 1.
--
-- PRE-CHECK (owner-run 2026-09-18): orders 27 (12 paid / 8 cancelled / 7
-- pending) · order_items 39 · payments 14 · vendor_payouts 0 · order_ratings 0 ·
-- market_box_subscriptions 2 · market_box_pickups 10 · event_wave_reservations 0
-- · cart_items 0 · carts 3 · notifications 0 · error_logs 16002 (≈15,900 written
-- by the vitest suite — see backlog) · payouts with a Stripe transfer id 0 ·
-- distinct buyers affected 6 (one orphaned buyer id; 6 accounts exist).
--
-- HOW IT WENT (the incident):
--   run 1 — post-check guard hard-coded `user_profiles = 5` from a pg_stat
--           ESTIMATE (exact = 6) → RAISE → rolled back. Nothing deleted.
--   run 2 — syntax error in multi-line `+` arithmetic → never executed.
--   run 3 — the version below. `CREATE TEMP TABLE purge_keep_before` did not
--           survive to the post-check DO block in the Supabase SQL editor
--           ("relation does not exist"); the DELETEs had already COMMITTED.
--           The post-check never ran. Owner-run counts afterwards matched the
--           expected kept structure exactly — correct by luck, not by design.
--
-- The compliant shape (one atomic DO block, failing-guard dry run first) is in
-- apps/web/docs/destructive-data-workflow.md. Incident:
-- apps/web/.claude/rule-incidents.md (2026-09-18).
-- ============================================================================

-- ---- run 3, as pasted (DO NOT RERUN) ----------------------------------------
BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM orders) <> 27 THEN RAISE EXCEPTION 'orders: expected 27'; END IF;
  IF (SELECT count(*) FROM order_items) <> 39 THEN RAISE EXCEPTION 'order_items: expected 39'; END IF;
  IF (SELECT count(*) FROM payments) <> 14 THEN RAISE EXCEPTION 'payments: expected 14'; END IF;
  IF (SELECT count(*) FROM market_box_subscriptions) <> 2 THEN RAISE EXCEPTION 'subscriptions: expected 2'; END IF;
  IF (SELECT count(*) FROM market_box_pickups) <> 10 THEN RAISE EXCEPTION 'pickups: expected 10'; END IF;
  IF (SELECT count(*) FROM carts) <> 3 THEN RAISE EXCEPTION 'carts: expected 3'; END IF;
  IF (SELECT count(*) FROM error_logs) <> 16002 THEN RAISE EXCEPTION 'error_logs: expected 16002'; END IF;
  IF (SELECT count(*) FROM vendor_payouts WHERE stripe_transfer_id IS NOT NULL) <> 0 THEN RAISE EXCEPTION 'SAFETY: payout with a real Stripe transfer exists'; END IF;
END $$;

CREATE TEMP TABLE purge_keep_before AS
SELECT (SELECT count(*) FROM user_profiles) AS user_profiles, (SELECT count(*) FROM vendor_profiles) AS vendor_profiles, (SELECT count(*) FROM listings) AS listings, (SELECT count(*) FROM markets) AS markets, (SELECT count(*) FROM market_schedules) AS market_schedules, (SELECT count(*) FROM market_box_offerings) AS market_box_offerings;

DELETE FROM market_box_pickups;
DELETE FROM market_box_subscriptions;
DELETE FROM vendor_payouts;
DELETE FROM payments;
DELETE FROM order_ratings;
UPDATE orders SET event_wave_reservation_id = NULL;
DELETE FROM event_wave_reservations;
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM cart_items;
DELETE FROM carts;
DELETE FROM notifications;
DELETE FROM error_logs;

DO $$
DECLARE b purge_keep_before%ROWTYPE;
DECLARE leftover bigint;
BEGIN
  SELECT * INTO b FROM purge_keep_before;   -- ← failed here: relation "purge_keep_before" does not exist
  SELECT (SELECT count(*) FROM orders) + (SELECT count(*) FROM order_items) + (SELECT count(*) FROM payments) + (SELECT count(*) FROM market_box_subscriptions) + (SELECT count(*) FROM market_box_pickups) + (SELECT count(*) FROM carts) + (SELECT count(*) FROM error_logs) INTO leftover;
  IF leftover <> 0 THEN RAISE EXCEPTION 'post-check: purge set not empty (% rows)', leftover; END IF;
  IF (SELECT count(*) FROM user_profiles) <> b.user_profiles THEN RAISE EXCEPTION 'post-check: user_profiles changed'; END IF;
  IF (SELECT count(*) FROM vendor_profiles) <> b.vendor_profiles THEN RAISE EXCEPTION 'post-check: vendor_profiles changed'; END IF;
  IF (SELECT count(*) FROM listings) <> b.listings THEN RAISE EXCEPTION 'post-check: listings changed'; END IF;
  IF (SELECT count(*) FROM markets) <> b.markets THEN RAISE EXCEPTION 'post-check: markets changed'; END IF;
  IF (SELECT count(*) FROM market_schedules) <> b.market_schedules THEN RAISE EXCEPTION 'post-check: schedules changed'; END IF;
  IF (SELECT count(*) FROM market_box_offerings) <> b.market_box_offerings THEN RAISE EXCEPTION 'post-check: offerings changed'; END IF;
END $$;

DROP TABLE purge_keep_before;
COMMIT;
