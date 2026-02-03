-- Migration: Add vertical admin support to RLS policies
-- Created: 2026-02-03
-- Purpose: Allow vertical admins to manage their vertical's data
--
-- Depends on: 20260203_002_fix_admin_helper_functions.sql
--   - is_platform_admin()
--   - is_vertical_admin(vertical_id)
--   - is_admin_for_vertical(vertical_id)
--
-- Tables updated:
--   - market_schedules: vertical admins can manage schedules for markets in their vertical
--   - shopper_feedback: vertical admins can update feedback for their vertical
--   - vendor_feedback: vertical admins can update feedback for their vertical
--   - vendor_profiles: vertical admins can VIEW all vendor profiles (for approval workflow)
--   - listings: vertical admins can VIEW all listings in their vertical
--   - orders: vertical admins can VIEW orders in their vertical (support access)

-- ============================================================================
-- 1. MARKET_SCHEDULES - Add vertical admin support
-- ============================================================================
-- Vertical admins should be able to manage schedules for markets in their vertical

-- Helper to check if user can admin a market's vertical
CREATE OR REPLACE FUNCTION can_admin_market(p_market_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM markets m
    WHERE m.id = p_market_id
    AND is_admin_for_vertical(m.vertical_id)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

DROP POLICY IF EXISTS "market_schedules_delete" ON public.market_schedules;
CREATE POLICY "market_schedules_delete" ON public.market_schedules
    FOR DELETE USING (
        -- Vendor can delete their own market's schedules
        EXISTS (
            SELECT 1 FROM markets m
            WHERE m.id = market_schedules.market_id
            AND m.submitted_by_vendor_id IN (
                SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
            )
        )
        -- Platform or vertical admin can delete
        OR can_admin_market(market_id)
    );

DROP POLICY IF EXISTS "market_schedules_insert" ON public.market_schedules;
CREATE POLICY "market_schedules_insert" ON public.market_schedules
    FOR INSERT WITH CHECK (
        -- Vendor can insert for their own markets
        EXISTS (
            SELECT 1 FROM markets m
            WHERE m.id = market_schedules.market_id
            AND m.submitted_by_vendor_id IN (
                SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
            )
        )
        -- Platform or vertical admin can insert
        OR can_admin_market(market_id)
    );

DROP POLICY IF EXISTS "market_schedules_update" ON public.market_schedules;
CREATE POLICY "market_schedules_update" ON public.market_schedules
    FOR UPDATE USING (
        -- Vendor can update their own market's schedules
        EXISTS (
            SELECT 1 FROM markets m
            WHERE m.id = market_schedules.market_id
            AND m.submitted_by_vendor_id IN (
                SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
            )
        )
        -- Platform or vertical admin can update
        OR can_admin_market(market_id)
    );

-- ============================================================================
-- 2. SHOPPER_FEEDBACK - Add vertical admin support
-- ============================================================================
-- Vertical admins should be able to update/review feedback for their vertical

DROP POLICY IF EXISTS "shopper_feedback_update" ON public.shopper_feedback;
CREATE POLICY "shopper_feedback_update" ON public.shopper_feedback
    FOR UPDATE USING (
        is_admin_for_vertical(vertical_id)
    );

-- Also add SELECT for admins to view all feedback
DROP POLICY IF EXISTS "shopper_feedback_admin_select" ON public.shopper_feedback;
CREATE POLICY "shopper_feedback_admin_select" ON public.shopper_feedback
    FOR SELECT USING (
        is_admin_for_vertical(vertical_id)
    );

-- ============================================================================
-- 3. VENDOR_FEEDBACK - Add vertical admin support
-- ============================================================================
-- Vertical admins should be able to update/review feedback for their vertical

DROP POLICY IF EXISTS "vendor_feedback_update" ON public.vendor_feedback;
CREATE POLICY "vendor_feedback_update" ON public.vendor_feedback
    FOR UPDATE USING (
        is_admin_for_vertical(vertical_id)
    );

-- Also add SELECT for admins to view all feedback
DROP POLICY IF EXISTS "vendor_feedback_admin_select" ON public.vendor_feedback;
CREATE POLICY "vendor_feedback_admin_select" ON public.vendor_feedback
    FOR SELECT USING (
        is_admin_for_vertical(vertical_id)
    );

-- ============================================================================
-- 4. VENDOR_PROFILES - Add admin SELECT access
-- ============================================================================
-- Vertical admins need to see ALL vendor profiles (including pending) for approval workflow
-- Note: We're ADDING a policy, not replacing - multiple SELECT policies OR together

DROP POLICY IF EXISTS "vendor_profiles_admin_select" ON public.vendor_profiles;
CREATE POLICY "vendor_profiles_admin_select" ON public.vendor_profiles
    FOR SELECT USING (
        is_admin_for_vertical(vertical_id)
    );

-- ============================================================================
-- 5. LISTINGS - Add admin SELECT access
-- ============================================================================
-- Vertical admins need to see all listings (including drafts) for management
-- Note: We're ADDING a policy, not replacing

DROP POLICY IF EXISTS "listings_admin_select" ON public.listings;
CREATE POLICY "listings_admin_select" ON public.listings
    FOR SELECT USING (
        is_admin_for_vertical(vertical_id)
    );

-- ============================================================================
-- 6. ORDERS - Add admin SELECT access
-- ============================================================================
-- Vertical admins need to view orders for support/dispute resolution
-- Note: We're ADDING a policy, not replacing

DROP POLICY IF EXISTS "orders_admin_select" ON public.orders;
CREATE POLICY "orders_admin_select" ON public.orders
    FOR SELECT USING (
        is_admin_for_vertical(vertical_id)
    );

-- ============================================================================
-- 7. ORDER_ITEMS - Add admin SELECT access (needed to view order details)
-- ============================================================================

-- Helper to check if user can admin an order's vertical
CREATE OR REPLACE FUNCTION can_admin_order(p_order_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = p_order_id
    AND is_admin_for_vertical(o.vertical_id)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

DROP POLICY IF EXISTS "order_items_admin_select" ON public.order_items;
CREATE POLICY "order_items_admin_select" ON public.order_items
    FOR SELECT USING (
        can_admin_order(order_id)
    );

-- ============================================================================
-- 8. TRANSACTIONS - Add admin SELECT access
-- ============================================================================

DROP POLICY IF EXISTS "transactions_admin_select" ON public.transactions;
CREATE POLICY "transactions_admin_select" ON public.transactions
    FOR SELECT USING (
        is_admin_for_vertical(vertical_id)
    );

-- ============================================================================
-- 9. PAYMENTS - Add admin SELECT access (via order)
-- ============================================================================

DROP POLICY IF EXISTS "payments_admin_select" ON public.payments;
CREATE POLICY "payments_admin_select" ON public.payments
    FOR SELECT USING (
        can_admin_order(order_id)
    );

-- ============================================================================
-- 10. VENDOR_FEE_BALANCE - Add admin SELECT access
-- ============================================================================

-- Helper to check if user can admin a vendor's vertical
CREATE OR REPLACE FUNCTION can_admin_vendor(p_vendor_profile_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM vendor_profiles vp
    WHERE vp.id = p_vendor_profile_id
    AND is_admin_for_vertical(vp.vertical_id)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

DROP POLICY IF EXISTS "vendor_fee_balance_admin_select" ON public.vendor_fee_balance;
CREATE POLICY "vendor_fee_balance_admin_select" ON public.vendor_fee_balance
    FOR SELECT USING (
        can_admin_vendor(vendor_profile_id)
    );

-- ============================================================================
-- 11. VENDOR_FEE_LEDGER - Add admin SELECT access
-- ============================================================================

DROP POLICY IF EXISTS "vendor_fee_ledger_admin_select" ON public.vendor_fee_ledger;
CREATE POLICY "vendor_fee_ledger_admin_select" ON public.vendor_fee_ledger
    FOR SELECT USING (
        can_admin_vendor(vendor_profile_id)
    );

-- ============================================================================
-- 12. VENDOR_PAYOUTS - Add admin SELECT access
-- ============================================================================

DROP POLICY IF EXISTS "vendor_payouts_admin_select" ON public.vendor_payouts;
CREATE POLICY "vendor_payouts_admin_select" ON public.vendor_payouts
    FOR SELECT USING (
        can_admin_vendor(vendor_profile_id)
    );

-- ============================================================================
-- 13. VENDOR_VERIFICATIONS - Add admin SELECT access
-- ============================================================================

DROP POLICY IF EXISTS "vendor_verifications_admin_select" ON public.vendor_verifications;
CREATE POLICY "vendor_verifications_admin_select" ON public.vendor_verifications
    FOR SELECT USING (
        can_admin_vendor(vendor_profile_id)
    );

-- ============================================================================
-- 14. NOTIFICATIONS - Add admin SELECT access (for debugging/support)
-- ============================================================================
-- Note: Notifications don't have vertical_id, so we need to join through user
-- For now, only platform admins can view all notifications

DROP POLICY IF EXISTS "notifications_admin_select" ON public.notifications;
CREATE POLICY "notifications_admin_select" ON public.notifications
    FOR SELECT USING (
        is_platform_admin()
    );

-- ============================================================================
-- Done!
-- ============================================================================
--
-- Summary of changes:
--   - market_schedules: Vertical admins can manage schedules for their vertical's markets
--   - shopper_feedback: Vertical admins can view/update feedback
--   - vendor_feedback: Vertical admins can view/update feedback
--   - vendor_profiles: Vertical admins can view all vendors (for approval)
--   - listings: Vertical admins can view all listings
--   - orders: Vertical admins can view orders (support)
--   - order_items: Vertical admins can view order details
--   - transactions: Vertical admins can view transactions
--   - payments: Vertical admins can view payments
--   - vendor_fee_balance: Vertical admins can view fee balances
--   - vendor_fee_ledger: Vertical admins can view fee ledger
--   - vendor_payouts: Vertical admins can view payouts
--   - vendor_verifications: Vertical admins can view verifications
--   - notifications: Platform admins only (no vertical_id)
--
-- New helper functions:
--   - can_admin_market(market_id) - Check if user can admin a market's vertical
--   - can_admin_order(order_id) - Check if user can admin an order's vertical
--   - can_admin_vendor(vendor_profile_id) - Check if user can admin a vendor's vertical
