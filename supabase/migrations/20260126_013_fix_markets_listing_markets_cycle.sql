-- Migration: Fix Markets ↔ Listing_Markets RLS Cycle (ERR_RLS_001)
-- Created: 2026-01-26
-- Purpose: Break circular dependency between markets and listing_markets policies
--
-- Previous Fix (Migration 011):
--   Fixed: orders ↔ order_items cycle
--   Fixed: order_items ↔ vendor_profiles cycle
--   MISSED: markets ↔ listing_markets cycle
--
-- The Problem (THIS migration fixes):
--   markets_public_select → references listing_markets
--   listing_markets_select → references markets
--   Result: markets → listing_markets → markets → infinite loop!
--
-- The Solution:
--   - markets: Remove reference to listing_markets
--   - listing_markets: Can reference markets (markets won't reference back)
--   - Buyer access to markets is through order_items.market_id directly

-- ============================================================================
-- 1. FIX MARKETS - Remove reference to listing_markets
-- ============================================================================

DROP POLICY IF EXISTS "markets_public_select" ON public.markets;

-- Simplified markets policy - no listing_markets reference
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
        -- Buyers can see markets directly from their order items
        -- NOTE: Removed listing_markets reference to break cycle
        id IN (
            SELECT oi.market_id FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.buyer_user_id = (select auth.uid())
            AND oi.market_id IS NOT NULL
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- 2. FIX LISTING_MARKETS - Remove reference to markets in buyer check
-- ============================================================================

DROP POLICY IF EXISTS "listing_markets_select" ON public.listing_markets;

-- Simplified listing_markets policy
CREATE POLICY "listing_markets_select" ON public.listing_markets
    FOR SELECT USING (
        -- Public: listing_markets for published listings
        -- NOTE: Removed markets join from this check to simplify
        EXISTS (
            SELECT 1 FROM listings l
            WHERE l.id = listing_id
            AND l.status = 'published'
            AND l.deleted_at IS NULL
        )
        OR
        -- Vendors can see their own listing_markets
        EXISTS (
            SELECT 1 FROM listings l
            WHERE l.id = listing_id
            AND l.vendor_profile_id IN (
                SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
            )
        )
        OR
        -- Buyers can see listing_markets from their orders
        EXISTS (
            SELECT 1 FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE oi.listing_id = listing_id
            AND o.buyer_user_id = (select auth.uid())
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- 3. Also check LISTINGS - has order_items reference, trace the chain
-- ============================================================================

-- listings_select references order_items, but order_items doesn't reference listings
-- So this is NOT a cycle, just a one-way dependency. Leave it as-is.

-- Chain verification after all fixes:
--   orders: no cross-table refs (fixed in 011)
--   order_items: refs orders + vendor_profiles (both now have simple policies)
--   vendor_profiles: no cross-table refs (fixed in 011)
--   markets: refs order_items only (no listing_markets ref anymore)
--   listing_markets: refs listings only (no markets ref anymore)
--   listings: refs vendor_profiles + order_items (both are safe endpoints)

-- ============================================================================
-- Done! All known cycles are now broken.
-- ============================================================================
