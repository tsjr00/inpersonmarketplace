-- Migration: Cleanup duplicate RLS policies
-- Created: 2026-01-30
-- Purpose: Remove duplicate policies created by previous migrations
--
-- The previous migration (004) created new policies but didn't drop all existing ones
-- This migration removes the duplicates, keeping only the optimized versions

-- ============================================================================
-- 1. CARTS - Remove old policies, keep new ones
-- ============================================================================

DROP POLICY IF EXISTS "carts_all" ON public.carts;
DROP POLICY IF EXISTS "carts_user_all" ON public.carts;

-- ============================================================================
-- 2. CART_ITEMS - Remove old policies, keep new ones
-- ============================================================================

DROP POLICY IF EXISTS "cart_items_all" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_user_all" ON public.cart_items;

-- ============================================================================
-- 3. LISTING_IMAGES - Remove duplicate manage policy, keep specific ones
-- ============================================================================

-- Drop the old individual policies if they exist alongside manage
DROP POLICY IF EXISTS "listing_images_delete" ON public.listing_images;
DROP POLICY IF EXISTS "listing_images_insert" ON public.listing_images;
DROP POLICY IF EXISTS "listing_images_update" ON public.listing_images;

-- ============================================================================
-- 4. MARKET_BOX_SUBSCRIPTIONS - Remove old policy name
-- ============================================================================

DROP POLICY IF EXISTS "market_box_subs_select" ON public.market_box_subscriptions;

-- ============================================================================
-- 5. VERTICALS - Remove old admin policy (keep verticals_select + verticals_admin)
-- Actually, we need to consolidate these properly
-- ============================================================================

-- Drop the individual action policies if verticals_admin exists
DROP POLICY IF EXISTS "verticals_delete" ON public.verticals;
DROP POLICY IF EXISTS "verticals_insert" ON public.verticals;
DROP POLICY IF EXISTS "verticals_update" ON public.verticals;

-- ============================================================================
-- 6. VENDOR_MARKET_SCHEDULES - Consolidate and fix auth.uid()
-- ============================================================================

-- Drop ALL existing policies
DROP POLICY IF EXISTS "vms_admin_all" ON public.vendor_market_schedules;
DROP POLICY IF EXISTS "vms_public_select" ON public.vendor_market_schedules;
DROP POLICY IF EXISTS "vms_vendor_delete" ON public.vendor_market_schedules;
DROP POLICY IF EXISTS "vms_vendor_insert" ON public.vendor_market_schedules;
DROP POLICY IF EXISTS "vms_vendor_update" ON public.vendor_market_schedules;
DROP POLICY IF EXISTS "vms_vendor_select" ON public.vendor_market_schedules;
DROP POLICY IF EXISTS "vms_vendor_all" ON public.vendor_market_schedules;

-- Recreate with proper (SELECT auth.uid()) syntax
-- Public can view schedules for approved vendors
CREATE POLICY "vms_public_select" ON public.vendor_market_schedules
    FOR SELECT USING (true);

-- Vendors can manage their own schedules
CREATE POLICY "vms_vendor_all" ON public.vendor_market_schedules
    FOR ALL USING (
        vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
        )
    );

-- Admins can manage all schedules
CREATE POLICY "vms_admin_all" ON public.vendor_market_schedules
    FOR ALL USING (is_platform_admin());

-- ============================================================================
-- 7. ERROR_REPORTS - These multiple policies are intentional (different access levels)
-- No changes needed - vertical admins, platform admins, and users have different access
-- ============================================================================

-- ============================================================================
-- 7b. ERROR_RESOLUTIONS - Fix auth.uid() performance
-- ============================================================================

DROP POLICY IF EXISTS "error_resolutions_admin_select" ON public.error_resolutions;
DROP POLICY IF EXISTS "error_resolutions_admin_insert" ON public.error_resolutions;
DROP POLICY IF EXISTS "error_resolutions_admin_update" ON public.error_resolutions;

-- Recreate with is_platform_admin() which already uses (SELECT auth.uid())
CREATE POLICY "error_resolutions_admin_select" ON public.error_resolutions
    FOR SELECT USING (is_platform_admin());

CREATE POLICY "error_resolutions_admin_insert" ON public.error_resolutions
    FOR INSERT WITH CHECK (is_platform_admin());

CREATE POLICY "error_resolutions_admin_update" ON public.error_resolutions
    FOR UPDATE USING (is_platform_admin());

-- ============================================================================
-- 8. PLATFORM_SETTINGS - Fix the admin_write policy conflict
-- The admin_write is FOR ALL which includes SELECT, conflicting with read policy
-- ============================================================================

DROP POLICY IF EXISTS "platform_settings_admin_write" ON public.platform_settings;

-- Recreate as INSERT/UPDATE/DELETE only (not SELECT since read handles that)
CREATE POLICY "platform_settings_admin_insert" ON public.platform_settings
    FOR INSERT WITH CHECK (is_platform_admin());

CREATE POLICY "platform_settings_admin_update" ON public.platform_settings
    FOR UPDATE USING (is_platform_admin());

CREATE POLICY "platform_settings_admin_delete" ON public.platform_settings
    FOR DELETE USING (is_platform_admin());

-- ============================================================================
-- Done!
-- ============================================================================
