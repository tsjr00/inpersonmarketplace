-- Migration: Fix remaining Supabase warnings
-- Created: 2026-01-30
--
-- Fixes:
-- 1. Function search path warnings (2 functions)
-- 2. Notifications INSERT policy (remove - only service_role creates notifications)
-- 3. Multiple permissive policies on SELECT (split *_manage into *_insert/*_update/*_delete)
-- 4. Error reports multiple policies (consolidate into single SELECT/UPDATE)

-- ============================================================================
-- 1. FIX FUNCTION SEARCH PATHS
-- ============================================================================

CREATE OR REPLACE FUNCTION set_listing_premium_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  window_hours INTEGER;
BEGIN
  -- Get window hours from platform_settings (default 24 if not set)
  SELECT COALESCE(
    (SELECT (value->>'hours')::INTEGER FROM platform_settings WHERE key = 'premium_window'),
    24
  ) INTO window_hours;

  -- Set premium window end time
  NEW.premium_window_ends_at := NEW.created_at + (window_hours || ' hours')::INTERVAL;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION set_market_box_premium_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  window_hours INTEGER;
BEGIN
  -- Get window hours from platform_settings (default 24 if not set)
  SELECT COALESCE(
    (SELECT (value->>'hours')::INTEGER FROM platform_settings WHERE key = 'premium_window'),
    24
  ) INTO window_hours;

  -- Set premium window end time
  NEW.premium_window_ends_at := NEW.created_at + (window_hours || ' hours')::INTERVAL;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. FIX NOTIFICATIONS - Remove INSERT policy (only service_role creates)
-- ============================================================================

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
-- notifications table already has GRANT ALL to service_role from migration 007

-- ============================================================================
-- 3. FIX LISTINGS - Split _manage into separate policies
-- ============================================================================

DROP POLICY IF EXISTS "listings_manage" ON public.listings;

CREATE POLICY "listings_insert" ON public.listings
    FOR INSERT WITH CHECK (
        vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

CREATE POLICY "listings_update" ON public.listings
    FOR UPDATE USING (
        vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

CREATE POLICY "listings_delete" ON public.listings
    FOR DELETE USING (
        vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

-- ============================================================================
-- 4. FIX LISTING_IMAGES - Split _manage into separate policies
-- ============================================================================

DROP POLICY IF EXISTS "listing_images_manage" ON public.listing_images;

CREATE POLICY "listing_images_insert" ON public.listing_images
    FOR INSERT WITH CHECK (
        listing_id IN (SELECT id FROM listings WHERE vendor_profile_id IN (SELECT user_vendor_profile_ids()))
    );

CREATE POLICY "listing_images_update" ON public.listing_images
    FOR UPDATE USING (
        listing_id IN (SELECT id FROM listings WHERE vendor_profile_id IN (SELECT user_vendor_profile_ids()))
    );

CREATE POLICY "listing_images_delete" ON public.listing_images
    FOR DELETE USING (
        listing_id IN (SELECT id FROM listings WHERE vendor_profile_id IN (SELECT user_vendor_profile_ids()))
    );

-- ============================================================================
-- 5. FIX LISTING_MARKETS - Split _manage into separate policies
-- ============================================================================

DROP POLICY IF EXISTS "listing_markets_manage" ON public.listing_markets;

CREATE POLICY "listing_markets_insert" ON public.listing_markets
    FOR INSERT WITH CHECK (
        listing_id IN (SELECT id FROM listings WHERE vendor_profile_id IN (SELECT user_vendor_profile_ids()))
    );

CREATE POLICY "listing_markets_update" ON public.listing_markets
    FOR UPDATE USING (
        listing_id IN (SELECT id FROM listings WHERE vendor_profile_id IN (SELECT user_vendor_profile_ids()))
    );

CREATE POLICY "listing_markets_delete" ON public.listing_markets
    FOR DELETE USING (
        listing_id IN (SELECT id FROM listings WHERE vendor_profile_id IN (SELECT user_vendor_profile_ids()))
    );

-- ============================================================================
-- 6. FIX MARKETS - Split _manage into separate policies
-- ============================================================================

DROP POLICY IF EXISTS "markets_manage" ON public.markets;

CREATE POLICY "markets_insert" ON public.markets
    FOR INSERT WITH CHECK (
        submitted_by_vendor_id IN (SELECT user_vendor_profile_ids())
    );

CREATE POLICY "markets_update" ON public.markets
    FOR UPDATE USING (
        submitted_by_vendor_id IN (SELECT user_vendor_profile_ids())
    );

CREATE POLICY "markets_delete" ON public.markets
    FOR DELETE USING (
        submitted_by_vendor_id IN (SELECT user_vendor_profile_ids())
    );

-- ============================================================================
-- 7. FIX MARKET_BOX_OFFERINGS - Split _manage into separate policies
-- ============================================================================

DROP POLICY IF EXISTS "market_box_offerings_manage" ON public.market_box_offerings;

CREATE POLICY "market_box_offerings_insert" ON public.market_box_offerings
    FOR INSERT WITH CHECK (
        vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

CREATE POLICY "market_box_offerings_update" ON public.market_box_offerings
    FOR UPDATE USING (
        vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

CREATE POLICY "market_box_offerings_delete" ON public.market_box_offerings
    FOR DELETE USING (
        vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

-- ============================================================================
-- 8. FIX FULFILLMENTS - Split _manage into separate policies
-- ============================================================================

DROP POLICY IF EXISTS "fulfillments_manage" ON public.fulfillments;

CREATE POLICY "fulfillments_insert" ON public.fulfillments
    FOR INSERT WITH CHECK (
        transaction_id IN (
            SELECT id FROM transactions
            WHERE vendor_profile_id IN (SELECT user_vendor_profile_ids())
        )
    );

CREATE POLICY "fulfillments_update" ON public.fulfillments
    FOR UPDATE USING (
        transaction_id IN (
            SELECT id FROM transactions
            WHERE vendor_profile_id IN (SELECT user_vendor_profile_ids())
        )
    );

CREATE POLICY "fulfillments_delete" ON public.fulfillments
    FOR DELETE USING (
        transaction_id IN (
            SELECT id FROM transactions
            WHERE vendor_profile_id IN (SELECT user_vendor_profile_ids())
        )
    );

-- ============================================================================
-- 9. FIX VENDOR_MARKET_SCHEDULES - Split _manage into separate policies
-- ============================================================================

DROP POLICY IF EXISTS "vms_manage" ON public.vendor_market_schedules;

CREATE POLICY "vms_insert" ON public.vendor_market_schedules
    FOR INSERT WITH CHECK (
        vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

CREATE POLICY "vms_update" ON public.vendor_market_schedules
    FOR UPDATE USING (
        vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

CREATE POLICY "vms_delete" ON public.vendor_market_schedules
    FOR DELETE USING (
        vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

-- ============================================================================
-- 10. FIX ERROR_REPORTS - Consolidate multiple SELECT/UPDATE policies
-- ============================================================================

-- Drop existing multiple policies
DROP POLICY IF EXISTS "error_reports_user_select" ON public.error_reports;
DROP POLICY IF EXISTS "error_reports_vertical_admin_select" ON public.error_reports;
DROP POLICY IF EXISTS "error_reports_platform_admin_select" ON public.error_reports;
DROP POLICY IF EXISTS "error_reports_vertical_admin_update" ON public.error_reports;
DROP POLICY IF EXISTS "error_reports_platform_admin_update" ON public.error_reports;

-- Consolidated SELECT: users see own, vertical admins see their vertical, platform admins see all
CREATE POLICY "error_reports_select" ON public.error_reports
    FOR SELECT USING (
        -- User can see their own reports
        reported_by_user_id = (SELECT auth.uid())
        -- Vertical admin can see reports for their vertical
        OR EXISTS (
            SELECT 1 FROM vertical_admins va
            WHERE va.vertical_id = error_reports.vertical_id
            AND va.user_id = (SELECT auth.uid())
        )
        -- Platform admin can see all
        OR is_platform_admin()
    );

-- Consolidated UPDATE: vertical admins for their vertical, platform admins for all
CREATE POLICY "error_reports_update" ON public.error_reports
    FOR UPDATE USING (
        -- Vertical admin can update reports for their vertical
        EXISTS (
            SELECT 1 FROM vertical_admins va
            WHERE va.vertical_id = error_reports.vertical_id
            AND va.user_id = (SELECT auth.uid())
        )
        -- Platform admin can update all
        OR is_platform_admin()
    );

-- Note: error_reports_user_insert (WITH CHECK true) is intentional - anyone can submit error reports

-- ============================================================================
-- DONE
-- ============================================================================
