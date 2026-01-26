-- Migration: Fix RLS Performance Warnings
-- Created: 2026-01-26
-- Purpose: Optimize RLS policies for better query performance
--
-- Fixes two categories of issues:
-- 1. auth_rls_initplan - Replace auth.uid() with (select auth.uid()) for single evaluation
-- 2. multiple_permissive_policies - Consolidate policies to reduce evaluation overhead
--
-- Note: Using (select auth.uid()) makes the value evaluate ONCE per query instead
-- of once per row, significantly improving performance on large tables.

-- ============================================================================
-- HELPER: Create a reusable function for common admin check
-- This avoids repeating the subquery in every policy
-- ============================================================================

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_id = (select auth.uid())
    AND 'admin' = ANY(roles)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ============================================================================
-- 1. FULFILLMENTS TABLE - Fix and consolidate
-- ============================================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "fulfillments_vendor_insert" ON public.fulfillments;
DROP POLICY IF EXISTS "fulfillments_vendor_update" ON public.fulfillments;
DROP POLICY IF EXISTS "fulfillments_admin_delete" ON public.fulfillments;
DROP POLICY IF EXISTS "fulfillments_admin_insert" ON public.fulfillments;
DROP POLICY IF EXISTS "fulfillments_admin_update" ON public.fulfillments;
DROP POLICY IF EXISTS "fulfillments_select" ON public.fulfillments;
DROP POLICY IF EXISTS "fulfillments_insert" ON public.fulfillments;
DROP POLICY IF EXISTS "fulfillments_update" ON public.fulfillments;
DROP POLICY IF EXISTS "fulfillments_delete" ON public.fulfillments;

-- Consolidated INSERT policy (vendors for their transactions OR admins)
CREATE POLICY "fulfillments_insert" ON public.fulfillments
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM transactions t
            JOIN vendor_profiles vp ON t.vendor_profile_id = vp.id
            WHERE t.id = transaction_id
            AND vp.user_id = (select auth.uid())
        )
        OR is_platform_admin()
    );

-- Consolidated UPDATE policy (vendors for their transactions OR admins)
CREATE POLICY "fulfillments_update" ON public.fulfillments
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM transactions t
            JOIN vendor_profiles vp ON t.vendor_profile_id = vp.id
            WHERE t.id = transaction_id
            AND vp.user_id = (select auth.uid())
        )
        OR is_platform_admin()
    );

-- DELETE policy (admins only)
CREATE POLICY "fulfillments_delete" ON public.fulfillments
    FOR DELETE USING (is_platform_admin());

-- SELECT policy (vendors, buyers, or admins)
CREATE POLICY "fulfillments_select" ON public.fulfillments
    FOR SELECT USING (
        -- Vendors can see their fulfillments
        EXISTS (
            SELECT 1 FROM transactions t
            JOIN vendor_profiles vp ON t.vendor_profile_id = vp.id
            WHERE t.id = transaction_id
            AND vp.user_id = (select auth.uid())
        )
        OR
        -- Buyers can see their transaction's fulfillments
        EXISTS (
            SELECT 1 FROM transactions t
            WHERE t.id = transaction_id
            AND t.buyer_user_id = (select auth.uid())
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- 2. USER_PROFILES TABLE - Fix auth.uid() call
-- ============================================================================

DROP POLICY IF EXISTS "user_profiles_select" ON public.user_profiles;

CREATE POLICY "user_profiles_select" ON public.user_profiles
    FOR SELECT USING (
        user_id = (select auth.uid())
        OR is_platform_admin()
    );

-- ============================================================================
-- 3. ORDERS TABLE - Fix auth.uid() call
-- ============================================================================

DROP POLICY IF EXISTS "orders_select" ON public.orders;

CREATE POLICY "orders_select" ON public.orders
    FOR SELECT USING (
        buyer_user_id = (select auth.uid())
        OR EXISTS (
            SELECT 1 FROM order_items oi
            JOIN vendor_profiles vp ON oi.vendor_profile_id = vp.id
            WHERE oi.order_id = orders.id
            AND vp.user_id = (select auth.uid())
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- 4. ORDER_ITEMS TABLE - Fix auth.uid() call
-- ============================================================================

DROP POLICY IF EXISTS "order_items_select" ON public.order_items;

CREATE POLICY "order_items_select" ON public.order_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_id
            AND o.buyer_user_id = (select auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM vendor_profiles vp
            WHERE vp.id = vendor_profile_id
            AND vp.user_id = (select auth.uid())
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- 5. MARKETS TABLE - Fix and consolidate
-- ============================================================================

DROP POLICY IF EXISTS "Admins can manage all markets" ON public.markets;
DROP POLICY IF EXISTS "Admins can view all markets" ON public.markets;
DROP POLICY IF EXISTS "Vendors can create private pickup locations" ON public.markets;
DROP POLICY IF EXISTS "Vendors can update own private pickup locations" ON public.markets;
DROP POLICY IF EXISTS "Vendors can delete own private pickup locations" ON public.markets;
DROP POLICY IF EXISTS "Vendors can suggest traditional markets" ON public.markets;
DROP POLICY IF EXISTS "Vendors can view their submitted markets" ON public.markets;
DROP POLICY IF EXISTS "markets_select" ON public.markets;
DROP POLICY IF EXISTS "markets_insert" ON public.markets;
DROP POLICY IF EXISTS "markets_update" ON public.markets;
DROP POLICY IF EXISTS "markets_delete" ON public.markets;

-- Public can view approved/active markets
CREATE POLICY "markets_public_select" ON public.markets
    FOR SELECT USING (
        (approval_status = 'approved' AND active = true)
        OR
        -- Vendors can see their own submitted/private markets
        submitted_by_vendor_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
        )
        OR is_platform_admin()
    );

-- Consolidated INSERT (vendors can create private pickup or suggest traditional)
CREATE POLICY "markets_insert" ON public.markets
    FOR INSERT WITH CHECK (
        -- Vendors creating private pickup locations
        (
            market_type = 'private_pickup'
            AND submitted_by_vendor_id IN (
                SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
            )
        )
        OR
        -- Vendors suggesting traditional markets
        (
            market_type = 'traditional'
            AND approval_status = 'pending'
            AND submitted_by_vendor_id IN (
                SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
            )
        )
        OR is_platform_admin()
    );

-- Consolidated UPDATE (vendors can update own private, admins can update all)
CREATE POLICY "markets_update" ON public.markets
    FOR UPDATE USING (
        (
            market_type = 'private_pickup'
            AND submitted_by_vendor_id IN (
                SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
            )
        )
        OR is_platform_admin()
    );

-- Consolidated DELETE (vendors can delete own private, admins can delete all)
CREATE POLICY "markets_delete" ON public.markets
    FOR DELETE USING (
        (
            market_type = 'private_pickup'
            AND submitted_by_vendor_id IN (
                SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
            )
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- 6. MARKET_SCHEDULES TABLE - Fix and consolidate
-- ============================================================================

DROP POLICY IF EXISTS "Vendors can manage their private pickup schedules" ON public.market_schedules;
DROP POLICY IF EXISTS "Vendors can create schedules for their market suggestions" ON public.market_schedules;
DROP POLICY IF EXISTS "market_schedules_select" ON public.market_schedules;
DROP POLICY IF EXISTS "market_schedules_insert" ON public.market_schedules;
DROP POLICY IF EXISTS "market_schedules_update" ON public.market_schedules;
DROP POLICY IF EXISTS "market_schedules_delete" ON public.market_schedules;

-- Public can view schedules for approved markets
CREATE POLICY "market_schedules_select" ON public.market_schedules
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM markets m
            WHERE m.id = market_id
            AND (
                (m.approval_status = 'approved' AND m.active = true)
                OR m.submitted_by_vendor_id IN (
                    SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
                )
            )
        )
        OR is_platform_admin()
    );

-- Consolidated INSERT
CREATE POLICY "market_schedules_insert" ON public.market_schedules
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM markets m
            WHERE m.id = market_id
            AND m.submitted_by_vendor_id IN (
                SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
            )
        )
        OR is_platform_admin()
    );

-- Consolidated UPDATE
CREATE POLICY "market_schedules_update" ON public.market_schedules
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM markets m
            WHERE m.id = market_id
            AND m.submitted_by_vendor_id IN (
                SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
            )
        )
        OR is_platform_admin()
    );

-- Consolidated DELETE
CREATE POLICY "market_schedules_delete" ON public.market_schedules
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM markets m
            WHERE m.id = market_id
            AND m.submitted_by_vendor_id IN (
                SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
            )
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- 7. VERTICAL_ADMINS TABLE - Fix and consolidate
-- ============================================================================

DROP POLICY IF EXISTS "vertical_admins_platform_admin_select" ON public.vertical_admins;
DROP POLICY IF EXISTS "vertical_admins_vertical_admin_select" ON public.vertical_admins;
DROP POLICY IF EXISTS "vertical_admins_insert" ON public.vertical_admins;
DROP POLICY IF EXISTS "vertical_admins_delete" ON public.vertical_admins;

-- Consolidated SELECT
CREATE POLICY "vertical_admins_select" ON public.vertical_admins
    FOR SELECT USING (
        user_id = (select auth.uid())
        OR is_platform_admin()
    );

-- INSERT (platform admins only)
CREATE POLICY "vertical_admins_insert" ON public.vertical_admins
    FOR INSERT WITH CHECK (is_platform_admin());

-- DELETE (platform admins only)
CREATE POLICY "vertical_admins_delete" ON public.vertical_admins
    FOR DELETE USING (is_platform_admin());

-- ============================================================================
-- 8. VENDOR_REFERRAL_CREDITS TABLE - Fix and consolidate
-- ============================================================================

DROP POLICY IF EXISTS "Vendors can view own referral credits" ON public.vendor_referral_credits;
DROP POLICY IF EXISTS "Vendors can view own referred status" ON public.vendor_referral_credits;
DROP POLICY IF EXISTS "System can manage referral credits" ON public.vendor_referral_credits;

-- Consolidated SELECT (vendors see their own, admins see all)
CREATE POLICY "vendor_referral_credits_select" ON public.vendor_referral_credits
    FOR SELECT USING (
        referrer_vendor_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
        )
        OR referred_vendor_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
        )
        OR is_platform_admin()
    );

-- Admin management (INSERT/UPDATE/DELETE)
CREATE POLICY "vendor_referral_credits_admin" ON public.vendor_referral_credits
    FOR ALL USING (is_platform_admin());

-- ============================================================================
-- 9. VENDOR_ACTIVITY_FLAGS TABLE - Fix and consolidate
-- ============================================================================

DROP POLICY IF EXISTS "Admins can manage activity flags" ON public.vendor_activity_flags;
DROP POLICY IF EXISTS "Vertical admins can view their flags" ON public.vendor_activity_flags;

-- Consolidated policy (platform admins OR vertical admins for their vertical)
CREATE POLICY "vendor_activity_flags_access" ON public.vendor_activity_flags
    FOR ALL USING (
        is_platform_admin()
        OR EXISTS (
            SELECT 1 FROM vertical_admins va
            WHERE va.user_id = (select auth.uid())
            AND va.vertical_id::TEXT = vendor_activity_flags.vertical_id
        )
    );

-- ============================================================================
-- 10. VENDOR_ACTIVITY_SETTINGS TABLE - Fix auth.uid() call
-- ============================================================================

DROP POLICY IF EXISTS "Admins can manage activity settings" ON public.vendor_activity_settings;

CREATE POLICY "vendor_activity_settings_admin" ON public.vendor_activity_settings
    FOR ALL USING (is_platform_admin());

-- ============================================================================
-- 11. VENDOR_ACTIVITY_SCAN_LOG TABLE - Fix auth.uid() call
-- ============================================================================

DROP POLICY IF EXISTS "Admins can view scan logs" ON public.vendor_activity_scan_log;

CREATE POLICY "vendor_activity_scan_log_admin" ON public.vendor_activity_scan_log
    FOR SELECT USING (is_platform_admin());

-- ============================================================================
-- 12. ADMIN_ACTIVITY_LOG TABLE - Fix auth.uid() call
-- ============================================================================

DROP POLICY IF EXISTS "admin_activity_log_select" ON public.admin_activity_log;
DROP POLICY IF EXISTS "admin_activity_log_insert" ON public.admin_activity_log;

CREATE POLICY "admin_activity_log_select" ON public.admin_activity_log
    FOR SELECT USING (is_platform_admin());

CREATE POLICY "admin_activity_log_insert" ON public.admin_activity_log
    FOR INSERT WITH CHECK (is_platform_admin());

-- ============================================================================
-- 13. SHOPPER_FEEDBACK TABLE - Fix and consolidate
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own feedback" ON public.shopper_feedback;
DROP POLICY IF EXISTS "Users can submit feedback" ON public.shopper_feedback;
DROP POLICY IF EXISTS "Admins can view all feedback" ON public.shopper_feedback;
DROP POLICY IF EXISTS "Admins can update feedback" ON public.shopper_feedback;

-- Consolidated SELECT (users see own, admins see all)
CREATE POLICY "shopper_feedback_select" ON public.shopper_feedback
    FOR SELECT USING (
        user_id = (select auth.uid())
        OR is_platform_admin()
    );

-- INSERT (authenticated users)
CREATE POLICY "shopper_feedback_insert" ON public.shopper_feedback
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

-- UPDATE (admins only)
CREATE POLICY "shopper_feedback_update" ON public.shopper_feedback
    FOR UPDATE USING (is_platform_admin());

-- ============================================================================
-- 14. VENDOR_FEEDBACK TABLE - Fix and consolidate
-- ============================================================================

DROP POLICY IF EXISTS "Vendors can view own feedback" ON public.vendor_feedback;
DROP POLICY IF EXISTS "Vendors can submit feedback" ON public.vendor_feedback;
DROP POLICY IF EXISTS "Admins can view all vendor feedback" ON public.vendor_feedback;
DROP POLICY IF EXISTS "Admins can update vendor feedback" ON public.vendor_feedback;

-- Consolidated SELECT (vendors see own, admins see all)
CREATE POLICY "vendor_feedback_select" ON public.vendor_feedback
    FOR SELECT USING (
        vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
        )
        OR is_platform_admin()
    );

-- INSERT (vendors)
CREATE POLICY "vendor_feedback_insert" ON public.vendor_feedback
    FOR INSERT WITH CHECK (
        vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
        )
    );

-- UPDATE (admins only)
CREATE POLICY "vendor_feedback_update" ON public.vendor_feedback
    FOR UPDATE USING (is_platform_admin());

-- ============================================================================
-- 15. ORDER_RATINGS TABLE - Fix auth.uid() calls
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can view ratings" ON public.order_ratings;
DROP POLICY IF EXISTS "Buyers can create ratings for their orders" ON public.order_ratings;
DROP POLICY IF EXISTS "Buyers can update their own ratings" ON public.order_ratings;
DROP POLICY IF EXISTS "Buyers can delete their own ratings" ON public.order_ratings;

-- SELECT (public)
CREATE POLICY "order_ratings_select" ON public.order_ratings
    FOR SELECT USING (true);

-- INSERT (buyers for their completed orders)
CREATE POLICY "order_ratings_insert" ON public.order_ratings
    FOR INSERT WITH CHECK (
        buyer_user_id = (select auth.uid())
        AND EXISTS (
            SELECT 1 FROM orders
            WHERE orders.id = order_id
            AND orders.buyer_user_id = (select auth.uid())
            AND orders.status = 'completed'
        )
    );

-- UPDATE (buyers for their own ratings)
CREATE POLICY "order_ratings_update" ON public.order_ratings
    FOR UPDATE USING (buyer_user_id = (select auth.uid()));

-- DELETE (buyers for their own ratings)
CREATE POLICY "order_ratings_delete" ON public.order_ratings
    FOR DELETE USING (buyer_user_id = (select auth.uid()));

-- ============================================================================
-- Done!
-- ============================================================================

COMMENT ON FUNCTION is_platform_admin IS 'Helper function for RLS policies - checks if current user is a platform admin. Uses (select auth.uid()) for performance.';
