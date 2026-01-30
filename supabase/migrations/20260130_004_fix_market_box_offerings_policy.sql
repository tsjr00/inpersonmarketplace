-- Migration: Fix market_box_offerings policies
-- Created: 2026-01-30
-- Issue: Old policies may still exist, causing conflicts

-- ============================================================================
-- 1. Drop ALL existing market_box_offerings policies
-- ============================================================================

DROP POLICY IF EXISTS "market_box_offerings_select" ON public.market_box_offerings;
DROP POLICY IF EXISTS "market_box_offerings_insert" ON public.market_box_offerings;
DROP POLICY IF EXISTS "market_box_offerings_update" ON public.market_box_offerings;
DROP POLICY IF EXISTS "market_box_offerings_delete" ON public.market_box_offerings;
DROP POLICY IF EXISTS "market_box_offerings_vendor_all" ON public.market_box_offerings;
DROP POLICY IF EXISTS "market_box_offerings_public_select" ON public.market_box_offerings;

-- ============================================================================
-- 2. Recreate with proper policies
-- ============================================================================

-- Anyone can view active offerings (public browsing)
CREATE POLICY "market_box_offerings_public_select" ON public.market_box_offerings
    FOR SELECT USING (active = true);

-- Vendors can view and manage their own offerings (including inactive)
CREATE POLICY "market_box_offerings_vendor_all" ON public.market_box_offerings
    FOR ALL USING (
        vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

-- Admins can do everything
CREATE POLICY "market_box_offerings_admin_all" ON public.market_box_offerings
    FOR ALL USING (is_platform_admin());

-- ============================================================================
-- Done!
-- ============================================================================
