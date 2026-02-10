-- Migration: Fix Markets Buyer Access
-- Created: 2026-01-26
-- Purpose: Allow buyers to see markets from their orders
--
-- Issue: The markets_public_select policy didn't include buyer access
-- for markets referenced in their orders, causing "Failed to fetch orders"

-- ============================================================================
-- FIX markets SELECT - Add buyer access for markets from their orders
-- ============================================================================

DROP POLICY IF EXISTS "markets_public_select" ON public.markets;

CREATE POLICY "markets_public_select" ON public.markets
    FOR SELECT USING (
        -- Public: approved and active markets
        (approval_status = 'approved' AND active = true)
        OR
        -- Vendors can see their own submitted/private markets
        submitted_by_vendor_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
        )
        OR
        -- Buyers can see markets from their orders
        id IN (
            SELECT oi.market_id FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.buyer_user_id = (select auth.uid())
            AND oi.market_id IS NOT NULL
        )
        OR
        -- Buyers can also see markets via listing_markets from their orders
        id IN (
            SELECT lm.market_id FROM listing_markets lm
            JOIN order_items oi ON oi.listing_id = lm.listing_id
            JOIN orders o ON o.id = oi.order_id
            WHERE o.buyer_user_id = (select auth.uid())
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- Done!
-- ============================================================================
