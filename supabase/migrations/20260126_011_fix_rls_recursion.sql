-- Migration: Fix RLS Policy Recursion (ERR_RLS_001)
-- Created: 2026-01-26
-- Purpose: Break circular dependency between orders and order_items policies
--
-- The Problem:
--   orders_select → references order_items → order_items_select → references orders → infinite loop
--
-- The Solution:
--   - orders: Don't reference order_items for vendor access
--   - order_items: Can reference orders (orders is the parent)
--   - Vendor access to orders happens through order_items (they see items, not raw orders)

-- ============================================================================
-- 1. FIX ORDERS - Remove reference to order_items
-- ============================================================================

DROP POLICY IF EXISTS "orders_select" ON public.orders;

-- Simplified orders policy - no cross-table reference
CREATE POLICY "orders_select" ON public.orders
    FOR SELECT USING (
        -- Buyer sees their own orders
        buyer_user_id = (select auth.uid())
        -- Admins see all
        OR is_platform_admin()
    );

-- Note: Vendors access order data through order_items, not directly through orders.
-- The API joins order_items with orders, and the order_items policy handles vendor access.

-- ============================================================================
-- 2. VERIFY ORDER_ITEMS - Should only reference orders (parent), not vice versa
-- ============================================================================

DROP POLICY IF EXISTS "order_items_select" ON public.order_items;

-- order_items can safely reference orders (no cycle - orders doesn't reference back)
CREATE POLICY "order_items_select" ON public.order_items
    FOR SELECT USING (
        -- Buyer can see items in their orders
        EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_id
            AND o.buyer_user_id = (select auth.uid())
        )
        OR
        -- Vendor can see their items (direct check, no cross-table)
        vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- 3. FIX VENDOR_PROFILES - Remove any reference to order_items
-- ============================================================================

DROP POLICY IF EXISTS "vendor_profiles_select" ON public.vendor_profiles;

-- Simplified vendor_profiles policy - public read for approved profiles
CREATE POLICY "vendor_profiles_select" ON public.vendor_profiles
    FOR SELECT USING (
        -- Public can see approved vendor profiles (for marketplace display)
        status = 'approved'
        -- Vendor sees their own profile regardless of status
        OR user_id = (select auth.uid())
        -- Admins see all
        OR is_platform_admin()
    );

-- ============================================================================
-- Done! The cycle is now broken:
--   orders: no cross-table references
--   order_items: references orders (safe - orders doesn't reference back)
--   vendor_profiles: no cross-table references
-- ============================================================================
