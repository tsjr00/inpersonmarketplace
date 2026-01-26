-- Migration: Fix Remaining Performance Warnings
-- Created: 2026-01-26
-- Purpose: Address remaining performance issues on dev and staging
--
-- DEV issues:
--   1. vendor_referral_credits - multiple SELECT policies
--   2. listing_images - duplicate index
--
-- STAGING additional issues:
--   3. "Buyers can view X from their orders" policies need auth.uid() fix
--   4. listing_markets - multiple overlapping policies
--   5. listings, markets, vendor_profiles - overlapping SELECT policies

-- ============================================================================
-- 1. FIX vendor_referral_credits - Consolidate into single SELECT policy
-- ============================================================================

-- Drop both policies and recreate as one
DROP POLICY IF EXISTS "vendor_referral_credits_select" ON public.vendor_referral_credits;
DROP POLICY IF EXISTS "vendor_referral_credits_admin" ON public.vendor_referral_credits;

-- Single consolidated policy for all operations
-- Vendors see their own (as referrer or referred), admins see all
CREATE POLICY "vendor_referral_credits_access" ON public.vendor_referral_credits
    FOR ALL USING (
        referrer_vendor_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
        )
        OR referred_vendor_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- 2. FIX listing_images - Drop duplicate index
-- ============================================================================

DROP INDEX IF EXISTS idx_listing_images_listing;
-- Keep idx_listing_images_listing_id

-- ============================================================================
-- 3. FIX STAGING: "Buyers can view X from their orders" policies
-- These policies use auth.uid() directly and overlap with existing policies
-- We'll drop them and consolidate into the main SELECT policies
-- ============================================================================

-- Drop the buyer-specific policies (they overlap with main select policies)
DROP POLICY IF EXISTS "Buyers can view vendor profiles from their orders" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Buyers can view listings from their orders" ON public.listings;
DROP POLICY IF EXISTS "Buyers can view markets from their orders" ON public.markets;
DROP POLICY IF EXISTS "Buyers can view listing_markets from their orders" ON public.listing_markets;

-- ============================================================================
-- 4. FIX vendor_profiles SELECT - Add buyer access to main policy
-- ============================================================================

DROP POLICY IF EXISTS "vendor_profiles_select" ON public.vendor_profiles;

CREATE POLICY "vendor_profiles_select" ON public.vendor_profiles
    FOR SELECT USING (
        -- Public profiles are visible to all (for marketplace browsing)
        status = 'approved'
        OR
        -- Vendors can see their own profile
        user_id = (select auth.uid())
        OR
        -- Buyers can see vendors from their orders
        id IN (
            SELECT oi.vendor_profile_id FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.buyer_user_id = (select auth.uid())
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- 5. FIX listings SELECT - Add buyer access to main policy
-- ============================================================================

DROP POLICY IF EXISTS "listings_select" ON public.listings;

CREATE POLICY "listings_select" ON public.listings
    FOR SELECT USING (
        -- Published listings are public
        (status = 'published' AND deleted_at IS NULL)
        OR
        -- Vendors can see their own listings
        vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
        )
        OR
        -- Buyers can see listings from their orders
        id IN (
            SELECT oi.listing_id FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.buyer_user_id = (select auth.uid())
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- 6. FIX markets SELECT - Already has buyer access via our previous migration
-- Just ensure the "Buyers can view" policy is dropped (done above)
-- ============================================================================

-- The markets_public_select policy from our previous migration should handle this
-- No additional changes needed if the drop above worked

-- ============================================================================
-- 7. FIX listing_markets - Consolidate all policies
-- ============================================================================

-- Drop all existing policies
DROP POLICY IF EXISTS "listing_markets_select" ON public.listing_markets;
DROP POLICY IF EXISTS "listing_markets_select_published" ON public.listing_markets;
DROP POLICY IF EXISTS "listing_markets_insert" ON public.listing_markets;
DROP POLICY IF EXISTS "listing_markets_update" ON public.listing_markets;
DROP POLICY IF EXISTS "listing_markets_delete" ON public.listing_markets;
DROP POLICY IF EXISTS "listing_markets_admin_all" ON public.listing_markets;
DROP POLICY IF EXISTS "listing_markets_vendor_manage" ON public.listing_markets;

-- Consolidated SELECT policy
CREATE POLICY "listing_markets_select" ON public.listing_markets
    FOR SELECT USING (
        -- Public: can see listing_markets for published listings at approved markets
        EXISTS (
            SELECT 1 FROM listings l
            JOIN markets m ON m.id = market_id
            WHERE l.id = listing_id
            AND l.status = 'published'
            AND l.deleted_at IS NULL
            AND m.active = true
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

-- Consolidated INSERT policy (vendors for their listings, admins for all)
CREATE POLICY "listing_markets_insert" ON public.listing_markets
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM listings l
            WHERE l.id = listing_id
            AND l.vendor_profile_id IN (
                SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
            )
        )
        OR is_platform_admin()
    );

-- Consolidated UPDATE policy
CREATE POLICY "listing_markets_update" ON public.listing_markets
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM listings l
            WHERE l.id = listing_id
            AND l.vendor_profile_id IN (
                SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
            )
        )
        OR is_platform_admin()
    );

-- Consolidated DELETE policy
CREATE POLICY "listing_markets_delete" ON public.listing_markets
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM listings l
            WHERE l.id = listing_id
            AND l.vendor_profile_id IN (
                SELECT id FROM vendor_profiles WHERE user_id = (select auth.uid())
            )
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- Done!
-- ============================================================================
