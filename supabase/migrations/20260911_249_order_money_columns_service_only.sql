-- ============================================================================
-- Migration 249: order money columns become SERVICE-ROLE-ONLY (launch review A-2)
-- ============================================================================
-- ⛔ DIFFERENTIAL CLASS — DO NOT PASTE until the code push carrying the
--    checkout/session change (orders + order_items inserts via the SERVICE
--    client) is DEPLOYED to this environment. Pasting first makes EVERY card
--    checkout fail at the orders insert.
--
-- WHAT WAS WRONG (found 2026-09-11 on PROD via pg_policies):
--   RLS policies order_items_update (mig 20260201_004), order_items_insert and
--   orders_update (mig 011) let the ORDER'S BUYER write any column of their own
--   rows over PostgREST — no column restriction. The fulfill route transfers
--   exactly orderItem.vendor_payout_cents to the vendor. So on a genuinely paid
--   order a buyer could set their own payout figure (platform pays it) or insert
--   extra items (free goods). RLS decides WHICH ROWS a role may touch; it cannot
--   decide WHICH COLUMNS. Column privileges can, and Postgres checks them before
--   RLS — nothing in app code can route around them.
--
-- WHAT THIS DOES:
--   1. anon + authenticated lose INSERT on orders and order_items entirely
--      (orders are created by the checkout route on the service client).
--   2. anon + authenticated lose the blanket UPDATE; authenticated gets UPDATE
--      back on ONLY the columns vendor/buyer routes write today (status,
--      timestamps, issue fields, refund bookkeeping). Verified 2026-09-11 by
--      classifying all 86 files that touch these tables: 23 user-client UPDATE
--      sites, none writes a money/identity column; the only user-client INSERTs
--      are the two checkout routes (see the external-payments note).
--   Row scoping is unchanged: the existing RLS policies still limit WHICH rows.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ ⚠ EXTERNAL PAYMENTS (Venmo / Cash App / PayPal / cash) — READ THIS WHEN   │
-- │   THAT FLOW IS REVIVED (owner plan: rebuild after live launch).           │
-- │                                                                          │
-- │ src/app/api/checkout/external/route.ts creates the order (:293) and its  │
-- │ items (:314) with the buyer's USER client. After this migration those    │
-- │ two inserts FAIL with 42501 (permission denied) because authenticated no │
-- │ longer holds INSERT on orders / order_items. The flow is inactive today  │
-- │ (memory: external payments are historical; owner 2026-09-11: "keep the   │
-- │ logic but not use it now"), so the code was deliberately LEFT UNTOUCHED  │
-- │ and this migration makes it inert at the database as well.              │
-- │                                                                          │
-- │ TO REVIVE: change those two inserts to the SERVICE client — the same     │
-- │ two-token edit made to checkout/session/route.ts in the commit that      │
-- │ precedes this migration (`supabase.` → `serviceClient.` on the orders    │
-- │ insert and the order_items insert; the route already sets               │
-- │ buyer_user_id = user.id itself). No further migration is needed.        │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- NOT changed here (phase 2, after launch): refund_amount_cents,
-- cancellation_fee_cents and orders.status stay user-writable because 7 buyer/
-- vendor routes write them through the user client. Today they feed reports and
-- order display only — never a Stripe amount (fulfill also requires a payments
-- row, so a faked status cannot unlock a payout).
--
-- PRE-CHECK (expect INSERT/UPDATE/DELETE rows for anon + authenticated = hole open):
--   SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema='public' AND table_name IN ('orders','order_items')
--     AND grantee IN ('anon','authenticated') ORDER BY 1,2,3;
-- POST-CHECK 1 (expect ONLY SELECT at table level for both roles):
--   (same query)
-- POST-CHECK 2 (expect exactly the granted column lists below, nothing else):
--   SELECT table_name, column_name FROM information_schema.column_privileges
--   WHERE table_schema='public' AND table_name IN ('orders','order_items')
--     AND grantee='authenticated' AND privilege_type='UPDATE' ORDER BY 1,2;
--
-- ROLLBACK:
--   GRANT INSERT, UPDATE ON public.orders, public.order_items TO anon, authenticated;
--   (restores the Supabase default; the RLS policies were not touched)
-- ============================================================================

-- 1. INSERT: only the service role creates orders and order items.
REVOKE INSERT ON public.orders      FROM anon, authenticated;
REVOKE INSERT ON public.order_items FROM anon, authenticated;

-- 2. UPDATE on order_items: drop the blanket grant, re-grant the user-writable set.
REVOKE UPDATE ON public.order_items FROM anon, authenticated;
GRANT  UPDATE (
  status, cancelled_at, cancelled_by, cancellation_reason,
  refund_amount_cents, cancellation_fee_cents,
  buyer_confirmed_at, vendor_confirmed_at, pickup_confirmed_at,
  confirmation_window_expires_at, lockdown_active, lockdown_initiated_at,
  issue_reported_at, issue_reported_by, issue_description, issue_status,
  issue_resolved_at, issue_resolved_by, issue_admin_notes, updated_at
) ON public.order_items TO authenticated;
-- Service-only from now on (never written by a user client — verified):
--   order_id, listing_id, vendor_profile_id, quantity, unit_price_cents,
--   subtotal_cents, platform_fee_cents, vendor_payout_cents, market_id,
--   schedule_id, pickup_date, preferred_pickup_time, pickup_snapshot, wave_id,
--   expires_at, tax_amount_cents, taxable_amount_cents, tax_jurisdictions,
--   tax_rate_version, tax_source, discount_cents, offer_id

-- 3. UPDATE on orders: same treatment.
REVOKE UPDATE ON public.orders FROM anon, authenticated;
GRANT  UPDATE (
  status, external_payment_confirmed_at, external_payment_confirmed_by, updated_at
) ON public.orders TO authenticated;
-- Service-only from now on:
--   buyer_user_id, vertical_id, order_number, subtotal_cents, platform_fee_cents,
--   total_cents, stripe_checkout_session_id, payment_method, parent_order_id,
--   order_suffix, tip_percentage, tip_amount, tip_on_platform_fee_cents,
--   small_order_fee_cents, payment_model, event_wave_reservation_id,
--   event_company_payment_id, chipin_amount_cents, chipin_beneficiary_id,
--   tax_total_cents, reconfirm_* (5), discount_cents, bundle_id,
--   bundle_margin_cents, bundle_handed_off_at, bundle_margin_transfer_id,
--   bundle_buyer_ack_at

-- Privilege changes alter what PostgREST exposes per role.
NOTIFY pgrst, 'reload schema';
