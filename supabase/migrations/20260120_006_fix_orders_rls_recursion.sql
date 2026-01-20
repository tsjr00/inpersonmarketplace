-- Migration: Fix circular RLS dependency between orders and order_items
-- Purpose: Break infinite recursion that occurred when orders_select referenced order_items
--          and order_items_select referenced orders
--
-- Issue: The original policies created a circular dependency:
--   - orders_select checked order_items to see if vendor owned an item
--   - order_items_select checked orders to see if user was the buyer
--   - This caused "infinite recursion detected in policy" errors
--
-- Solution:
--   - orders_select no longer references order_items (vendors see orders via order_items policy instead)
--   - order_items_select checks orders directly for buyer access
--   - Both policies include admin access

-- ============================================================================
-- DROP EXISTING POLICIES
-- ============================================================================
DROP POLICY IF EXISTS "orders_select" ON orders;
DROP POLICY IF EXISTS "order_items_select" ON order_items;

-- ============================================================================
-- ORDERS: Buyers and admins can view orders (NO order_items reference)
-- ============================================================================
CREATE POLICY "orders_select" ON orders FOR SELECT USING (
    -- Buyer can see their own orders
    buyer_user_id = auth.uid()
    -- Admin can see all orders
    OR EXISTS (
        SELECT 1 FROM user_profiles up
        WHERE up.user_id = auth.uid()
        AND (up.role = 'admin' OR 'admin' = ANY(up.roles))
    )
);

-- ============================================================================
-- ORDER_ITEMS: Buyers, vendors, and admins can view order items
-- ============================================================================
CREATE POLICY "order_items_select" ON order_items FOR SELECT USING (
    -- Buyer can see their order items (via orders table)
    EXISTS (
        SELECT 1 FROM orders o
        WHERE o.id = order_items.order_id
        AND o.buyer_user_id = auth.uid()
    )
    -- Vendor can see items they're fulfilling
    OR EXISTS (
        SELECT 1 FROM vendor_profiles vp
        WHERE vp.id = order_items.vendor_profile_id
        AND vp.user_id = auth.uid()
    )
    -- Admin can see all
    OR EXISTS (
        SELECT 1 FROM user_profiles up
        WHERE up.user_id = auth.uid()
        AND (up.role = 'admin' OR 'admin' = ANY(up.roles))
    )
);

-- ============================================================================
-- Note: The "Buyers can view X from their orders" policies were removed
-- because they also caused recursion issues. If needed in the future,
-- they should be created with "TO authenticated" role restriction.
-- See: 20260120_005_buyer_order_view_policies_fixed.sql
-- ============================================================================
