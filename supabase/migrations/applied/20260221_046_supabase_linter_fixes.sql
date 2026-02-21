-- Migration: 20260221_046_supabase_linter_fixes.sql
-- Purpose: Address Supabase database linter warnings and suggestions
-- Scope: Merge overlapping permissive policies, drop duplicate indexes, add FK indexes, drop legacy indexes
-- Safety: All policy merges preserve identical access patterns. No schema or functionality changes.
-- Affects: knowledge_articles, payments, shopper_feedback, vendor_fee_balance, vendor_fee_ledger,
--          vendor_feedback, vendor_profiles, vendor_verifications, zip_codes (policies)
--          market_box_subscriptions, order_items, orders (duplicate indexes)
--          11 tables (FK indexes), transactions, fulfillments (legacy indexes)

BEGIN;

-- ============================================================
-- PART 1: MERGE MULTIPLE PERMISSIVE POLICIES (9 tables)
-- ============================================================

-- ---------------------------------------------------------
-- 1. KNOWLEDGE_ARTICLES
-- Problem: knowledge_articles_admin_all (FOR ALL) overlaps with
--          knowledge_articles_public_read (FOR SELECT) on SELECT operations.
-- Fix: Replace FOR ALL with per-operation policies. Single SELECT merges both conditions.
-- ---------------------------------------------------------
DROP POLICY IF EXISTS "knowledge_articles_public_read" ON public.knowledge_articles;
DROP POLICY IF EXISTS "knowledge_articles_admin_all" ON public.knowledge_articles;

-- Combined SELECT: public reads published articles, admins read all
CREATE POLICY "knowledge_articles_select" ON public.knowledge_articles
  FOR SELECT TO public
  USING (
    is_published = true
    OR (SELECT is_platform_admin())
  );

-- Admin write access (previously covered by FOR ALL)
CREATE POLICY "knowledge_articles_admin_insert" ON public.knowledge_articles
  FOR INSERT TO public
  WITH CHECK ((SELECT is_platform_admin()));

CREATE POLICY "knowledge_articles_admin_update" ON public.knowledge_articles
  FOR UPDATE TO public
  USING ((SELECT is_platform_admin()))
  WITH CHECK ((SELECT is_platform_admin()));

CREATE POLICY "knowledge_articles_admin_delete" ON public.knowledge_articles
  FOR DELETE TO public
  USING ((SELECT is_platform_admin()));

-- ---------------------------------------------------------
-- 2. PAYMENTS
-- Problem: payments_buyer_select + payments_admin_select = two permissive SELECT policies.
-- Fix: Merge into single SELECT policy.
-- ---------------------------------------------------------
DROP POLICY IF EXISTS "payments_buyer_select" ON public.payments;
DROP POLICY IF EXISTS "payments_select" ON public.payments;
DROP POLICY IF EXISTS "payments_admin_select" ON public.payments;

CREATE POLICY "payments_select" ON public.payments
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = payments.order_id AND o.buyer_user_id = (SELECT auth.uid())
    )
    OR can_admin_order(order_id)
  );

-- ---------------------------------------------------------
-- 3. SHOPPER_FEEDBACK
-- Problem: shopper_feedback_select + shopper_feedback_admin_select = two permissive SELECT.
-- Fix: Merge into single SELECT policy.
-- ---------------------------------------------------------
DROP POLICY IF EXISTS "shopper_feedback_select" ON public.shopper_feedback;
DROP POLICY IF EXISTS "shopper_feedback_admin_select" ON public.shopper_feedback;

CREATE POLICY "shopper_feedback_select" ON public.shopper_feedback
  FOR SELECT TO public
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT is_platform_admin())
    OR is_admin_for_vertical(vertical_id)
  );

-- ---------------------------------------------------------
-- 4. VENDOR_FEE_BALANCE
-- Problem: vendor_fee_balance_select + vendor_fee_balance_admin_select = two permissive SELECT.
-- Fix: Merge into single SELECT policy.
-- ---------------------------------------------------------
DROP POLICY IF EXISTS "vendor_fee_balance_select" ON public.vendor_fee_balance;
DROP POLICY IF EXISTS "vendor_fee_balance_admin_select" ON public.vendor_fee_balance;

CREATE POLICY "vendor_fee_balance_select" ON public.vendor_fee_balance
  FOR SELECT TO public
  USING (
    vendor_profile_id IN (
      SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
    )
    OR can_admin_vendor(vendor_profile_id)
  );

-- ---------------------------------------------------------
-- 5. VENDOR_FEE_LEDGER
-- Problem: vendor_fee_ledger_select + vendor_fee_ledger_admin_select = two permissive SELECT.
-- Fix: Merge into single SELECT policy.
-- ---------------------------------------------------------
DROP POLICY IF EXISTS "vendor_fee_ledger_select" ON public.vendor_fee_ledger;
DROP POLICY IF EXISTS "vendor_fee_ledger_admin_select" ON public.vendor_fee_ledger;

CREATE POLICY "vendor_fee_ledger_select" ON public.vendor_fee_ledger
  FOR SELECT TO public
  USING (
    vendor_profile_id IN (
      SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
    )
    OR can_admin_vendor(vendor_profile_id)
  );

-- ---------------------------------------------------------
-- 6. VENDOR_FEEDBACK
-- Problem: vendor_feedback_select + vendor_feedback_admin_select = two permissive SELECT.
-- Fix: Merge into single SELECT policy.
-- ---------------------------------------------------------
DROP POLICY IF EXISTS "vendor_feedback_select" ON public.vendor_feedback;
DROP POLICY IF EXISTS "vendor_feedback_admin_select" ON public.vendor_feedback;

CREATE POLICY "vendor_feedback_select" ON public.vendor_feedback
  FOR SELECT TO public
  USING (
    vendor_profile_id IN (
      SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
    )
    OR (SELECT is_platform_admin())
    OR is_admin_for_vertical(vertical_id)
  );

-- ---------------------------------------------------------
-- 7. VENDOR_PROFILES
-- Problem: vendor_profiles_select (already comprehensive, includes admin + vertical admin)
--          + vendor_profiles_admin_select (is_admin_for_vertical — redundant, never dropped).
-- Fix: Just drop the redundant policy.
-- ---------------------------------------------------------
DROP POLICY IF EXISTS "vendor_profiles_admin_select" ON public.vendor_profiles;

-- ---------------------------------------------------------
-- 8. VENDOR_VERIFICATIONS (UPDATE overlap)
-- Problem: vendor_verifications_vendor_update + vendor_verifications_admin_update
--          = two permissive UPDATE policies.
-- Fix: Merge into single UPDATE policy preserving both USING and WITH CHECK.
-- ---------------------------------------------------------
DROP POLICY IF EXISTS "vendor_verifications_vendor_update" ON public.vendor_verifications;
DROP POLICY IF EXISTS "vendor_verifications_admin_update" ON public.vendor_verifications;

CREATE POLICY "vendor_verifications_update" ON public.vendor_verifications
  FOR UPDATE TO public
  USING (
    vendor_profile_id IN (SELECT user_vendor_profile_ids())
    OR (SELECT is_platform_admin())
    OR can_admin_vendor(vendor_profile_id)
  )
  WITH CHECK (
    vendor_profile_id IN (SELECT user_vendor_profile_ids())
    OR (SELECT is_platform_admin())
    OR can_admin_vendor(vendor_profile_id)
  );

-- ---------------------------------------------------------
-- 9. ZIP_CODES
-- Problem: zip_codes_admin_all (FOR ALL) overlaps with
--          zip_codes_public_read (FOR SELECT) on SELECT operations.
-- Fix: Replace FOR ALL with per-operation policies. Single SELECT for public read.
-- ---------------------------------------------------------
DROP POLICY IF EXISTS "zip_codes_public_read" ON public.zip_codes;
DROP POLICY IF EXISTS "zip_codes_admin_all" ON public.zip_codes;

-- Everyone can read zip codes (unchanged)
CREATE POLICY "zip_codes_select" ON public.zip_codes
  FOR SELECT TO public
  USING (true);

-- Admin write access (previously covered by FOR ALL)
CREATE POLICY "zip_codes_admin_insert" ON public.zip_codes
  FOR INSERT TO public
  WITH CHECK ((SELECT is_platform_admin()));

CREATE POLICY "zip_codes_admin_update" ON public.zip_codes
  FOR UPDATE TO public
  USING ((SELECT is_platform_admin()))
  WITH CHECK ((SELECT is_platform_admin()));

CREATE POLICY "zip_codes_admin_delete" ON public.zip_codes
  FOR DELETE TO public
  USING ((SELECT is_platform_admin()));


-- ============================================================
-- PART 2: DROP DUPLICATE INDEXES (4 pairs)
-- Keep the original, drop the duplicate created later.
-- ============================================================

-- Keep idx_market_box_subs_active (from 006), drop duplicate (from 001_perf)
DROP INDEX IF EXISTS idx_market_box_subscriptions_offering_active;

-- Keep idx_order_items_order (from 001), drop duplicate (from 015)
DROP INDEX IF EXISTS idx_order_items_order_id;

-- Keep idx_orders_buyer (from 001), drop duplicate (from 015)
DROP INDEX IF EXISTS idx_orders_buyer_user_id;

-- Keep idx_orders_parent (from pickup_scheduling), drop duplicate (from 001_perf)
DROP INDEX IF EXISTS idx_orders_parent_id;


-- ============================================================
-- PART 3: ADD MISSING FK INDEXES (18 indexes)
-- These FK columns have no index, which slows JOINs and CASCADE DELETEs.
-- All are low-traffic admin/metadata columns — zero risk, minor benefit.
-- ============================================================

-- admin_activity_log
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_vertical
  ON public.admin_activity_log(vertical_id);

-- error_reports (4 FK columns)
CREATE INDEX IF NOT EXISTS idx_error_reports_assigned_to
  ON public.error_reports(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_error_reports_escalated_by
  ON public.error_reports(escalated_by_user_id);
CREATE INDEX IF NOT EXISTS idx_error_reports_reported_by
  ON public.error_reports(reported_by_user_id);
CREATE INDEX IF NOT EXISTS idx_error_reports_resolved_by
  ON public.error_reports(resolved_by_user_id);

-- knowledge_articles
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_vertical
  ON public.knowledge_articles(vertical_id);

-- market_box_subscriptions
CREATE INDEX IF NOT EXISTS idx_market_box_subs_order
  ON public.market_box_subscriptions(order_id);

-- markets
CREATE INDEX IF NOT EXISTS idx_markets_reviewed_by
  ON public.markets(reviewed_by);

-- orders
CREATE INDEX IF NOT EXISTS idx_orders_ext_payment_confirmed_by
  ON public.orders(external_payment_confirmed_by);

-- shopper_feedback
CREATE INDEX IF NOT EXISTS idx_shopper_feedback_resolved_by
  ON public.shopper_feedback(resolved_by);

-- vendor_activity_flags
CREATE INDEX IF NOT EXISTS idx_vendor_activity_flags_resolved_by
  ON public.vendor_activity_flags(resolved_by);

-- vendor_activity_settings
CREATE INDEX IF NOT EXISTS idx_vendor_activity_settings_updated_by
  ON public.vendor_activity_settings(updated_by);

-- vendor_feedback
CREATE INDEX IF NOT EXISTS idx_vendor_feedback_resolved_by
  ON public.vendor_feedback(resolved_by);

-- vendor_location_cache
CREATE INDEX IF NOT EXISTS idx_vendor_location_cache_source_market
  ON public.vendor_location_cache(source_market_id);

-- vendor_referral_credits
CREATE INDEX IF NOT EXISTS idx_vendor_referral_credits_voided_by
  ON public.vendor_referral_credits(voided_by);

-- vendor_verifications (2 FK columns)
CREATE INDEX IF NOT EXISTS idx_vendor_verifications_coi_verified_by
  ON public.vendor_verifications(coi_verified_by);
CREATE INDEX IF NOT EXISTS idx_vendor_verifications_reviewed_by
  ON public.vendor_verifications(reviewed_by);

-- vertical_admins
CREATE INDEX IF NOT EXISTS idx_vertical_admins_granted_by
  ON public.vertical_admins(granted_by);


-- ============================================================
-- PART 4: DROP TRULY DEAD LEGACY INDEXES
-- transactions + fulfillments tables are legacy (replaced by orders/order_items system).
-- These indexes are confirmed unused by Supabase linter.
-- ============================================================

DROP INDEX IF EXISTS idx_transactions_listing;
DROP INDEX IF EXISTS idx_transactions_vendor;
DROP INDEX IF EXISTS idx_fulfillments_transaction;
DROP INDEX IF EXISTS idx_fulfillments_status;


-- ============================================================
-- RELOAD POSTGREST SCHEMA CACHE
-- ============================================================
NOTIFY pgrst, 'reload schema';

COMMIT;
