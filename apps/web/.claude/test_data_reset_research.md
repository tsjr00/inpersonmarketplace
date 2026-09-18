# Test-data reset — research (started 2026-09-18)

Owner ask: a SAFE way to remove old orders / events / markets etc. from Dev + Staging so new test runs start clean;
same procedure later strips seed data from Prod + Staging at launch. Owner: "i know there could be a wrong way".
Deliverable order: read → say what I need from the DBs → queries → plan.

## Checklist
- [x] FK map read in full (`SCHEMA_SNAPSHOT.md:2307-2815`, 95 tables)
- [x] Seed scripts inventoried (6 SQL + 2 TS)
- [x] App's own market DELETE (`api/admin/markets/[id]/route.ts:287-379`) — what it refuses and why
- [x] Core money-table columns read (orders, payments, vendor_payouts, market_box_subscriptions, evfp, wbr, psb)
- [ ] Owner's scope answers (what to keep)
- [ ] Inventory results from Dev + Staging
- [ ] Stripe-side implications confirmed (test mode on Staging; Prod seed = no real charges?)
- [ ] Storage buckets (listing images) — orphan policy
- [ ] auth.users — who gets removed and how (dashboard vs SQL)
- [ ] Final ordered script + dry-run on Dev

## FK facts that decide the order (read, cited)
- **markets ↔ catering_requests is CIRCULAR**: `catering_requests.market_id → markets.id` (no action, :2370) and
  `markets.catering_request_id → catering_requests.id` (no action, :2583). Neither can be deleted while the other
  points at it → null one side first (e.g. `UPDATE markets SET catering_request_id = NULL` for the targeted set).
- **markets.id is referenced by 27 tables**; most CASCADE (schedules, vms, market_vendors, evl, listing_markets,
  waves, wave_reservations, bundles, booth inventory/placeholders, wbr, psb, park_spots, standing reservations,
  vetting, blackouts, checkins, docs, favorites, broadcasts, surveys, date_overrides, seasons, booth_booking_groups,
  **booth_credits (a LEDGER)**, event_company_payments, event_vendor_fee_payments, vendor_location_cache). NOT
  cascading: `order_items.market_id` (no action → delete blocked while order_items exist), `cart_items.market_id`
  SET NULL, `market_box_offerings.pickup_market_id` **RESTRICT**, `vendor_profiles.home_market_id` SET NULL.
- **orders**: `order_items`, `payments`, `order_ratings` CASCADE; `event_wave_reservations.order_id` no action
  (delete reservations first — and `orders.event_wave_reservation_id` points back: circular, null one side);
  `orders.parent_order_id` self (children first); `market_box_subscriptions.order_id`, `cause_ledger.order_id`,
  `vendor_fee_ledger.order_id` SET NULL. **`vendor_payouts.order_item_id` CASCADE → deleting orders deletes
  payout records** (financial history; fine for TEST data only).
- **vendor_profiles**: CASCADE to listings (→ listing_images, listing_markets, evl, bundle components? no —
  `market_bundle_components.listing_id` no action → blocks), market_vendors, offerings, fee payments, checkins,
  blackouts, favorites, fee balance/ledger, offers, vip customers, verifications, referral credits, quality
  findings, activity flags, vendor_location_cache, agreement acceptances, vms, surveys, park vetting/standing
  reservations, `markets.vendor_profile_id` (private pickups). RESTRICT: `booth_booking_groups`, `booth_credits`,
  `park_spot_bookings`, `weekly_booth_rentals`, `transactions` (legacy) → those must go first.
- **user_profiles**: `market_box_subscriptions.buyer_user_id` RESTRICT, `organizations.owner_user_id` RESTRICT,
  `transactions.buyer_user_id` RESTRICT; `orders.buyer_user_id` has NO FK in the public map (orders survive a user
  delete as orphans — or is it auth.users? not in map). `vendor_vip_customers.buyer_user_id → auth.users CASCADE`.
- **No FK at all** (clutter that survives any delete): `notifications` (action_url points at deleted things),
  `carts`/`cart_items` (cart_items.listing_id CASCADE, market SET NULL), `error_logs`, `audit_log`, `email_events`,
  `buyer_search_log`, `public_activity_events`, `market_day_notification_log` (market CASCADE), `vendor_activity_*`.

## The app's own rule (admin market DELETE, `admin/markets/[id]/route.ts:339-362`)
Refuses to hard-delete a market that has listing links OR any booth rental / park booking / booking group / booth
credit: "deleting it would erase that financial history. Deactivate the market instead." → the reset is a
DELIBERATE purge the app itself will not do; it must be SQL, ordered, and only ever on rows we have proven are test.

## Seed identification (fixed id prefixes — the "is this seed?" test)
- Prod FT demo: `dd000000-`/`dd100000-`/`dd200000-`/`dd300000-`/`dd400000-…-4000-8000-…` (2 vendors:
  foodtrucknapp+truck4/5@gmail.com). Prod FM demo: `ee000000-`…`ee400000-` (6 vendors:
  farmersmarketingapp+vendor1..6@gmail.com). Staging: `a1b2c3d4-`, `b1b2c3d4-`, `f1000000-`, `f2000000-`,
  `f4000000-`. Dev: `scripts/seed-data.ts` → `@test.com` emails. Rows CREATED THROUGH THE APP by test accounts
  have random ids → identified by OWNER (buyer_user_id / vendor_profile_id / contact_email), not by prefix.

## Stripe (to confirm)
Staging = test mode: deleting DB rows leaves test-mode charges/transfers in Stripe — harmless. Prod seed: must
PROVE zero payments / payouts / fee payments / rentals / bookings carry a stripe id before touching anything.
Deleting a row that has a real transfer id = losing the only record of real money. Rule: on Prod, money rows
with Stripe ids are never deleted by this procedure.

## Owner answers (2026-09-18)
- Purge the TRANSACTIONAL layer only (orders, subscriptions, events + their markets, bookings, notifications);
  keep accounts, vendor profiles, listings, regular markets. Prod = 1 test vendor + seed. Mechanics agreed: SQL per
  env, transaction-wrapped, count-checked, Dev first. "lets talk before you delete anything."
- error_logs: "purge errors as you see fit" → Dev: empty the table.

## Dev inventory (owner-run 2026-09-18)
- Transactional: orders 27 (12 paid / 8 cancelled / 7 pending), order_items 39, payments 14 (all Stripe test),
  vendor_payouts 0, market_box_subscriptions 2 active (+10 pickups), carts 3, notifications 0, events 0,
  market_vendors 0, bookings/rentals 0. All Feb 4–13 2026.
- Kept structure: user_profiles 5 (3 `@test.com` dev seed, 1 platform_admin, 2 other), vendor_profiles 5 (4 with
  Stripe), listings 6, markets 8 (3 FT fixed-id seed), market_box_offerings 1.
- error_logs 16,002: ~15,900 written BY THE TEST SUITE (logger.ts:36-56 uses service creds from .env.local; vitest
  loads it; no test mocks '@/lib/errors'; counts 1943/1941/… identical across guard-test routes, last_seen = today;
  86x group starts 2026-07-14 = money-authorization tests). ~100 real, all old + fixed. → BACKLOG: make the logger
  inert under vitest (test-setup change, not a business rule).

## DEV PURGE — DONE 2026-09-18, BUT NOT THE WAY IT WAS PROMISED (incident)
Result: purge set 0 rows (orders/items/payments/subs/pickups/carts/error_logs); kept structure intact = user_profiles 6,
vendor_profiles 5, listings 6, markets 8, market_schedules 12, market_box_offerings 1.
Runs: (1) failed on a post-check guard hard-coded to the pg_stat ESTIMATE (5 users; exact = 6) — rolled back;
(2) syntax error (multi-line `+` arithmetic) — never ran; (3) `relation "purge_keep_before" does not exist` — the TEMP
table did not survive between statements in the Supabase editor, so the DELETEs COMMITTED WITHOUT the post-check.
Root causes + the new process: memory `feedback_destructive_sql_process` (exact counts only · one atomic DO block ·
prove the guard fails first · read-only state after any error · blast radius in the pre-check · script in a file).
STAGING/PROD: not before the owner accepts the new process.

## STAGING PURGE — DONE 2026-09-18 UNDER THE NEW WORKFLOW
Inventory (exact): orders 54 · items 59 · payments 47 · payouts 16 · subs 9 · pickups 32 · events 14 · event markets
14 · market_vendors 49 (26 event) · evl 52 · fee payments 6 · blackouts 6 · booth rentals 24 · park bookings 11 ·
groups 1 · credits 2 · standing 5 · carts 24 · notifications 454 · error_logs 246. Stripe: all test mode (owner in
writing). Blockers: none (1 orphan event market, 1 pre-approval event — both deleted directly).
Runs: dry run tripped the guard as designed (54/14/454/246 unchanged) → real run 1 failed INSIDE the block on
`vendor_payouts.market_box_subscription_id` (NO ACTION) — my ordering miss; atomic rollback proven → payouts moved
first → real run 2 success. Confirmation exact: 0×6 · 37 / 28 / 69 / 18 / 23 / 12. File:
`supabase/maintenance/20260918_staging_transactional_purge.sql`.
Consequence for testing: the 09-15 test event is gone — TR-022 / TR-064–066 need a NEW self-service event; bundle
and market-box retests start from fresh orders (structure intact).
PROD: at launch, same workflow; targeted rows only (seed prefixes dd/ee + the one test vendor's rows).

## Open scope questions for the owner (asked 2026-09-18) — ANSWERED above
1. Keep accounts (your test buyers/vendors/managers/organizers) + vendor profiles + listings, and purge only the
   TRANSACTIONAL layer (orders, subscriptions, events, bookings, notifications)? Or purge markets/listings too?
2. Prod today: is it seed-only, or are there real signups already? (Prod purge = seed rows by prefix + rows those
   seed accounts created; never anything else.)
3. Preferred mechanics: a reviewed SQL script the owner pastes (one env at a time, Dev first as the dry run, with
   pre/post counts), vs a service-side script. Recommendation: SQL, transaction-wrapped, count-verified.
