-- Migration 075: Merge duplicate permissive SELECT policies
--
-- Root cause: Migrations 20260209_002 and 20260209_003 merged these policies
-- on Dev & Staging but were never applied to Prod. Prod still has separate
-- _admin_select policies from migration 20260203_003.
-- vendor_quality_findings was never merged on any environment (migration 047).
--
-- This migration is idempotent — on Dev/Staging the admin_select drops are no-ops
-- and the merged policies are recreated with the same USING clauses.

-- ============================================================
-- 1. LISTINGS: merge listings_select + listings_admin_select
-- ============================================================
DROP POLICY IF EXISTS "listings_select" ON public.listings;
DROP POLICY IF EXISTS "listings_admin_select" ON public.listings;

CREATE POLICY "listings_select" ON public.listings
  FOR SELECT TO public
  USING (
    (status = 'published'::listing_status)
    OR (vendor_profile_id IN (SELECT user_vendor_profile_ids()))
    OR is_admin_for_vertical(vertical_id)
  );

-- ============================================================
-- 2. MARKETS: merge markets_select + markets_public_select
-- ============================================================
DROP POLICY IF EXISTS "markets_select" ON public.markets;
DROP POLICY IF EXISTS "markets_public_select" ON public.markets;

CREATE POLICY "markets_select" ON public.markets
  FOR SELECT TO public
  USING (
    ((approval_status = 'approved'::market_approval_status) AND (active = true))
    OR (submitted_by_vendor_id IN (SELECT user_vendor_profile_ids()))
    OR (id IN (
      SELECT oi.market_id
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.buyer_user_id = (SELECT auth.uid())
        AND oi.market_id IS NOT NULL
    ))
    OR (id IN (
      SELECT lm.market_id
      FROM listing_markets lm
      JOIN order_items oi ON oi.listing_id = lm.listing_id
      JOIN orders o ON o.id = oi.order_id
      WHERE o.buyer_user_id = (SELECT auth.uid())
    ))
    OR (SELECT is_platform_admin())
    OR is_vertical_admin(vertical_id)
  );

-- ============================================================
-- 3. NOTIFICATIONS: merge notifications_select + notifications_admin_select
-- ============================================================
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_admin_select" ON public.notifications;

CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT TO public
  USING (
    (user_id = (SELECT auth.uid()))
    OR (SELECT is_platform_admin())
  );

-- ============================================================
-- 4. ORDER_ITEMS: merge order_items_select + order_items_admin_select
-- ============================================================
DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_admin_select" ON public.order_items;

CREATE POLICY "order_items_select" ON public.order_items
  FOR SELECT TO public
  USING (
    (order_id IN (SELECT user_buyer_order_ids()))
    OR (vendor_profile_id IN (SELECT user_vendor_profile_ids()))
    OR can_admin_order(order_id)
  );

-- ============================================================
-- 5. ORDERS: merge orders_select + orders_admin_select
-- ============================================================
DROP POLICY IF EXISTS "orders_select" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_select" ON public.orders;

CREATE POLICY "orders_select" ON public.orders
  FOR SELECT TO public
  USING (
    (buyer_user_id = (SELECT auth.uid()))
    OR (id IN (SELECT user_vendor_order_ids()))
    OR is_admin_for_vertical(vertical_id)
  );

-- ============================================================
-- 6. TRANSACTIONS: merge transactions_select + transactions_admin_select
-- ============================================================
DROP POLICY IF EXISTS "transactions_select" ON public.transactions;
DROP POLICY IF EXISTS "transactions_admin_select" ON public.transactions;

CREATE POLICY "transactions_select" ON public.transactions
  FOR SELECT TO public
  USING (
    (buyer_user_id = (SELECT auth.uid()))
    OR (vendor_profile_id IN (SELECT user_vendor_profile_ids()))
    OR is_admin_for_vertical(vertical_id)
  );

-- ============================================================
-- 7. VENDOR_PAYOUTS: merge vendor_payouts_select + vendor_payouts_admin_select
-- ============================================================
DROP POLICY IF EXISTS "vendor_payouts_select" ON public.vendor_payouts;
DROP POLICY IF EXISTS "vendor_payouts_admin_select" ON public.vendor_payouts;

CREATE POLICY "vendor_payouts_select" ON public.vendor_payouts
  FOR SELECT TO public
  USING (
    (vendor_profile_id IN (SELECT user_vendor_profile_ids()))
    OR can_admin_vendor(vendor_profile_id)
  );

-- ============================================================
-- 8. VENDOR_QUALITY_FINDINGS: merge vendor_select_own_findings + admin_select_all_findings
-- (Never merged on any environment — migration 047 created both)
-- ============================================================
DROP POLICY IF EXISTS "vendor_select_own_findings" ON public.vendor_quality_findings;
DROP POLICY IF EXISTS "admin_select_all_findings" ON public.vendor_quality_findings;

CREATE POLICY "vendor_quality_findings_select" ON public.vendor_quality_findings
  FOR SELECT TO public
  USING (
    (vendor_profile_id IN (SELECT user_vendor_profile_ids()))
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = (SELECT auth.uid()) AND role = 'admin'
    )
  );

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
