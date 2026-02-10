-- Migration: Fix orders/order_items RLS recursion
-- Created: 2026-01-30
--
-- Issue: orders_select queries order_items, order_items_select queries orders
-- This creates a circular dependency causing "RLS policy recursion detected"
--
-- Fix: Create SECURITY DEFINER helper functions that bypass RLS

-- =============================================================================
-- HELPER FUNCTIONS (bypass RLS to avoid recursion)
-- =============================================================================

-- Check if user is the buyer of an order (bypasses RLS on orders)
CREATE OR REPLACE FUNCTION is_order_buyer(order_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM orders WHERE id = order_uuid AND buyer_user_id = auth.uid()
  )
$$;

-- Get order IDs where user is the buyer (bypasses RLS on orders)
CREATE OR REPLACE FUNCTION user_buyer_order_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM orders WHERE buyer_user_id = auth.uid()
$$;

-- Get order IDs where user is the vendor of any item (bypasses RLS)
CREATE OR REPLACE FUNCTION user_vendor_order_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT order_id FROM order_items
  WHERE vendor_profile_id IN (SELECT user_vendor_profile_ids())
$$;

-- =============================================================================
-- DROP AND RECREATE ORDERS POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "orders_select" ON public.orders;
DROP POLICY IF EXISTS "orders_buyer_select" ON public.orders;
DROP POLICY IF EXISTS "orders_vendor_select" ON public.orders;

CREATE POLICY "orders_select" ON public.orders
    FOR SELECT USING (
        buyer_user_id = (SELECT auth.uid())
        OR id IN (SELECT user_vendor_order_ids())
    );

-- Keep insert/update policies as-is (they don't cause recursion)
DROP POLICY IF EXISTS "orders_insert" ON public.orders;
CREATE POLICY "orders_insert" ON public.orders
    FOR INSERT WITH CHECK (buyer_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "orders_update" ON public.orders;
CREATE POLICY "orders_update" ON public.orders
    FOR UPDATE USING (
        buyer_user_id = (SELECT auth.uid())
        OR id IN (SELECT user_vendor_order_ids())
    );

-- =============================================================================
-- DROP AND RECREATE ORDER_ITEMS POLICIES
-- =============================================================================

DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_buyer_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_vendor_select" ON public.order_items;

CREATE POLICY "order_items_select" ON public.order_items
    FOR SELECT USING (
        order_id IN (SELECT user_buyer_order_ids())
        OR vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
CREATE POLICY "order_items_insert" ON public.order_items
    FOR INSERT WITH CHECK (
        order_id IN (SELECT user_buyer_order_ids())
    );

DROP POLICY IF EXISTS "order_items_update" ON public.order_items;
CREATE POLICY "order_items_update" ON public.order_items
    FOR UPDATE USING (
        vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

-- =============================================================================
-- GRANTS
-- =============================================================================
GRANT ALL ON public.orders TO service_role;
GRANT ALL ON public.order_items TO service_role;
