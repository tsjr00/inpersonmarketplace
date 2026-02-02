-- =============================================================================
-- Migration: Fix order_items RLS to allow buyer updates
-- =============================================================================
-- Created: 2026-02-01
-- Author: Claude Code
--
-- Problem: Buyers cannot update order_items (for buyer_confirmed_at, issue reports)
-- because the RLS policy only allows vendor updates.
--
-- Solution: Allow buyers to update order_items for their own orders.
-- =============================================================================

-- Drop the existing update policy
DROP POLICY IF EXISTS "order_items_update" ON public.order_items;

-- Create new update policy that allows both vendors AND buyers
CREATE POLICY "order_items_update" ON public.order_items
    FOR UPDATE USING (
        -- Vendors can update items they're selling
        vendor_profile_id IN (SELECT user_vendor_profile_ids())
        OR
        -- Buyers can update items in their orders (for confirmation, issue reports)
        order_id IN (SELECT user_buyer_order_ids())
    );

-- Add comment
COMMENT ON POLICY "order_items_update" ON public.order_items IS
'Allows vendors to update their order items (status changes) and buyers to update their order items (pickup confirmation, issue reports)';
