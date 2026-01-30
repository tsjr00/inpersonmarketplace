-- Migration: Fix market box RLS recursion
-- Created: 2026-01-30
-- Issue: Nested EXISTS queries on RLS-protected tables cause recursion
--
-- Solution: Use direct column checks and SECURITY DEFINER helper functions

-- ============================================================================
-- 1. Create helper function to check if user owns a vendor profile
-- This avoids RLS recursion by using SECURITY DEFINER
-- ============================================================================

CREATE OR REPLACE FUNCTION user_vendor_profile_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM vendor_profiles WHERE user_id = auth.uid()
$$;

COMMENT ON FUNCTION user_vendor_profile_ids IS 'Returns vendor_profile IDs owned by current user. SECURITY DEFINER to bypass RLS and avoid recursion.';

-- ============================================================================
-- 2. Create helper to check if user is buyer of a subscription
-- ============================================================================

CREATE OR REPLACE FUNCTION user_is_subscription_buyer(sub_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM market_box_subscriptions
    WHERE id = sub_id AND buyer_user_id = auth.uid()
  )
$$;

-- ============================================================================
-- 3. Create helper to check if user is vendor of a subscription's offering
-- ============================================================================

CREATE OR REPLACE FUNCTION user_is_subscription_vendor(sub_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM market_box_subscriptions mbs
    JOIN market_box_offerings mbo ON mbs.offering_id = mbo.id
    WHERE mbs.id = sub_id
    AND mbo.vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid())
  )
$$;

-- ============================================================================
-- 4. Fix market_box_subscriptions policy - use direct check, no nested RLS
-- ============================================================================

DROP POLICY IF EXISTS "market_box_subscriptions_select" ON public.market_box_subscriptions;
DROP POLICY IF EXISTS "market_box_subs_buyer_select" ON public.market_box_subscriptions;
DROP POLICY IF EXISTS "market_box_subs_vendor_select" ON public.market_box_subscriptions;
DROP POLICY IF EXISTS "market_box_subs_select" ON public.market_box_subscriptions;

-- Simple policy: buyer sees own, vendor sees their offerings' subscriptions, admin sees all
CREATE POLICY "market_box_subscriptions_select" ON public.market_box_subscriptions
    FOR SELECT USING (
        -- Buyer can see their own subscriptions (direct column check, no RLS)
        buyer_user_id = (SELECT auth.uid())
        OR
        -- Vendor can see subscriptions to their offerings (use helper to avoid recursion)
        offering_id IN (
            SELECT id FROM market_box_offerings
            WHERE vendor_profile_id IN (SELECT user_vendor_profile_ids())
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- 5. Fix market_box_pickups policy - use helper functions
-- ============================================================================

DROP POLICY IF EXISTS "market_box_pickups_select" ON public.market_box_pickups;
DROP POLICY IF EXISTS "market_box_pickups_buyer_select" ON public.market_box_pickups;
DROP POLICY IF EXISTS "market_box_pickups_vendor_select" ON public.market_box_pickups;

-- Use helper functions to avoid RLS recursion
CREATE POLICY "market_box_pickups_select" ON public.market_box_pickups
    FOR SELECT USING (
        user_is_subscription_buyer(subscription_id)
        OR user_is_subscription_vendor(subscription_id)
        OR is_platform_admin()
    );

-- ============================================================================
-- 6. Ensure market_box_offerings has simple policies too
-- ============================================================================

DROP POLICY IF EXISTS "market_box_offerings_select" ON public.market_box_offerings;

-- Public can view active offerings, vendors see their own, admins see all
CREATE POLICY "market_box_offerings_select" ON public.market_box_offerings
    FOR SELECT USING (
        active = true
        OR vendor_profile_id IN (SELECT user_vendor_profile_ids())
        OR is_platform_admin()
    );

-- ============================================================================
-- Done!
-- ============================================================================
