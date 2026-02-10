-- Migration: Cleanup Order-Related Policies
-- Created: 2026-01-26
-- Purpose: Remove duplicate/conflicting policies on order_items and ensure
--          all related tables have proper buyer access

-- ============================================================================
-- 1. ORDER_ITEMS - Drop ALL old policies and create one consolidated policy
-- ============================================================================

-- Drop all existing order_items policies
DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_buyer_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_vendor_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_buyer_insert" ON public.order_items;
DROP POLICY IF EXISTS "order_items_vendor_update" ON public.order_items;
DROP POLICY IF EXISTS "order_items_buyer_update" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
DROP POLICY IF EXISTS "order_items_update" ON public.order_items;

-- Consolidated SELECT policy
CREATE POLICY "order_items_select" ON public.order_items
    FOR SELECT USING (
        -- Buyer can see items in their orders
        EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_id
            AND o.buyer_user_id = (select auth.uid())
        )
        OR
        -- Vendor can see their items
        vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
        )
        OR is_platform_admin()
    );

-- INSERT policy (buyers adding to their orders)
CREATE POLICY "order_items_insert" ON public.order_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_id
            AND o.buyer_user_id = (select auth.uid())
        )
        OR is_platform_admin()
    );

-- UPDATE policy (vendors updating status, buyers confirming pickup)
CREATE POLICY "order_items_update" ON public.order_items
    FOR UPDATE USING (
        -- Vendor can update their items
        vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
        )
        OR
        -- Buyer can update items in their orders (for confirmation)
        EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_id
            AND o.buyer_user_id = (select auth.uid())
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- 2. Verify ORDERS policy is correct
-- ============================================================================

DROP POLICY IF EXISTS "orders_select" ON public.orders;

CREATE POLICY "orders_select" ON public.orders
    FOR SELECT USING (
        -- Buyer sees their own orders
        buyer_user_id = (select auth.uid())
        OR
        -- Vendor sees orders containing their items
        EXISTS (
            SELECT 1 FROM order_items oi
            WHERE oi.order_id = id
            AND oi.vendor_profile_id IN (
                SELECT vp.id FROM vendor_profiles vp WHERE vp.user_id = (select auth.uid())
            )
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- Done!
-- ============================================================================
