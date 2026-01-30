-- Migration: Comprehensive RLS recursion fix
-- Created: 2026-01-30
-- Issue: Multiple RLS policies causing recursion chains
--
-- This migration drops ALL policies on affected tables and recreates them
-- with careful attention to avoid any recursion

-- ============================================================================
-- 1. First, ensure is_platform_admin is SECURITY DEFINER (bypasses RLS)
-- ============================================================================

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_id = auth.uid()
    AND 'admin' = ANY(roles)
  )
$$;

-- ============================================================================
-- 2. USER_PROFILES - Simple policy, no is_platform_admin call to avoid recursion
-- ============================================================================

-- Drop ALL policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_select" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_update" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_insert" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;

-- Recreate without is_platform_admin() to break recursion
-- Admins can use service role for admin operations
CREATE POLICY "user_profiles_select" ON public.user_profiles
    FOR SELECT USING (
        user_id = (SELECT auth.uid())
    );

CREATE POLICY "user_profiles_update" ON public.user_profiles
    FOR UPDATE USING (
        user_id = (SELECT auth.uid())
    );

CREATE POLICY "user_profiles_insert" ON public.user_profiles
    FOR INSERT WITH CHECK (
        user_id = (SELECT auth.uid())
    );

-- Grant service_role full access for admin operations
GRANT ALL ON public.user_profiles TO service_role;

-- ============================================================================
-- 3. VENDOR_PROFILES - Simple policies, avoid nested RLS
-- ============================================================================

DROP POLICY IF EXISTS "vendor_profiles_select" ON public.vendor_profiles;
DROP POLICY IF EXISTS "vendor_profiles_update" ON public.vendor_profiles;
DROP POLICY IF EXISTS "vendor_profiles_insert" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Vendors can view own profiles" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Vendors can update own profiles" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Public can view approved vendors" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Admins can view all vendor profiles" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Admins can update vendor profiles" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Users can create vendor profiles" ON public.vendor_profiles;

-- Simple SELECT: public sees approved, owners see own
CREATE POLICY "vendor_profiles_select" ON public.vendor_profiles
    FOR SELECT USING (
        (status = 'approved' AND deleted_at IS NULL)
        OR user_id = (SELECT auth.uid())
    );

CREATE POLICY "vendor_profiles_update" ON public.vendor_profiles
    FOR UPDATE USING (
        user_id = (SELECT auth.uid())
    );

CREATE POLICY "vendor_profiles_insert" ON public.vendor_profiles
    FOR INSERT WITH CHECK (
        user_id = (SELECT auth.uid())
    );

-- Service role for admin operations
GRANT ALL ON public.vendor_profiles TO service_role;

-- ============================================================================
-- 4. MARKET_BOX_OFFERINGS - Simple policies
-- ============================================================================

DROP POLICY IF EXISTS "market_box_offerings_select" ON public.market_box_offerings;
DROP POLICY IF EXISTS "market_box_offerings_insert" ON public.market_box_offerings;
DROP POLICY IF EXISTS "market_box_offerings_update" ON public.market_box_offerings;
DROP POLICY IF EXISTS "market_box_offerings_delete" ON public.market_box_offerings;
DROP POLICY IF EXISTS "market_box_offerings_vendor_all" ON public.market_box_offerings;
DROP POLICY IF EXISTS "market_box_offerings_public_select" ON public.market_box_offerings;
DROP POLICY IF EXISTS "market_box_offerings_admin_all" ON public.market_box_offerings;

-- Public can view active offerings (no auth required)
CREATE POLICY "market_box_offerings_select" ON public.market_box_offerings
    FOR SELECT USING (
        active = true
        OR vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
        )
    );

-- Vendors can insert/update/delete their own offerings
CREATE POLICY "market_box_offerings_insert" ON public.market_box_offerings
    FOR INSERT WITH CHECK (
        vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "market_box_offerings_update" ON public.market_box_offerings
    FOR UPDATE USING (
        vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "market_box_offerings_delete" ON public.market_box_offerings
    FOR DELETE USING (
        vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
        )
    );

GRANT ALL ON public.market_box_offerings TO service_role;

-- ============================================================================
-- 5. MARKET_BOX_SUBSCRIPTIONS - Simple policies
-- ============================================================================

DROP POLICY IF EXISTS "market_box_subscriptions_select" ON public.market_box_subscriptions;
DROP POLICY IF EXISTS "market_box_subs_buyer_select" ON public.market_box_subscriptions;
DROP POLICY IF EXISTS "market_box_subs_vendor_select" ON public.market_box_subscriptions;
DROP POLICY IF EXISTS "market_box_subs_select" ON public.market_box_subscriptions;
DROP POLICY IF EXISTS "market_box_subs_insert" ON public.market_box_subscriptions;

-- Buyers see own, vendors see their offerings' subscriptions
CREATE POLICY "market_box_subscriptions_select" ON public.market_box_subscriptions
    FOR SELECT USING (
        buyer_user_id = (SELECT auth.uid())
        OR offering_id IN (
            SELECT mbo.id FROM market_box_offerings mbo
            JOIN vendor_profiles vp ON mbo.vendor_profile_id = vp.id
            WHERE vp.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "market_box_subscriptions_insert" ON public.market_box_subscriptions
    FOR INSERT WITH CHECK (
        buyer_user_id = (SELECT auth.uid())
    );

GRANT ALL ON public.market_box_subscriptions TO service_role;

-- ============================================================================
-- 6. MARKET_BOX_PICKUPS - Simple policies
-- ============================================================================

DROP POLICY IF EXISTS "market_box_pickups_select" ON public.market_box_pickups;
DROP POLICY IF EXISTS "market_box_pickups_update" ON public.market_box_pickups;
DROP POLICY IF EXISTS "market_box_pickups_buyer_select" ON public.market_box_pickups;
DROP POLICY IF EXISTS "market_box_pickups_vendor_select" ON public.market_box_pickups;
DROP POLICY IF EXISTS "market_box_pickups_vendor_update" ON public.market_box_pickups;

-- Use SECURITY DEFINER function to avoid recursion
CREATE OR REPLACE FUNCTION can_access_pickup(p_subscription_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM market_box_subscriptions mbs
    WHERE mbs.id = p_subscription_id
    AND (
      mbs.buyer_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM market_box_offerings mbo
        JOIN vendor_profiles vp ON mbo.vendor_profile_id = vp.id
        WHERE mbo.id = mbs.offering_id
        AND vp.user_id = auth.uid()
      )
    )
  )
$$;

CREATE POLICY "market_box_pickups_select" ON public.market_box_pickups
    FOR SELECT USING (can_access_pickup(subscription_id));

CREATE POLICY "market_box_pickups_update" ON public.market_box_pickups
    FOR UPDATE USING (can_access_pickup(subscription_id));

GRANT ALL ON public.market_box_pickups TO service_role;

-- ============================================================================
-- 7. MARKETS - Simple policies (needed for market_box_offerings join)
-- ============================================================================

DROP POLICY IF EXISTS "markets_select" ON public.markets;
DROP POLICY IF EXISTS "markets_public_select" ON public.markets;
DROP POLICY IF EXISTS "Admins full access to markets" ON public.markets;
DROP POLICY IF EXISTS "Anyone can view active markets" ON public.markets;
DROP POLICY IF EXISTS "Vendors can create private pickup markets" ON public.markets;
DROP POLICY IF EXISTS "Vendors can update own markets" ON public.markets;
DROP POLICY IF EXISTS "Vendors can delete own markets" ON public.markets;
DROP POLICY IF EXISTS "markets_insert" ON public.markets;
DROP POLICY IF EXISTS "markets_update" ON public.markets;
DROP POLICY IF EXISTS "markets_delete" ON public.markets;

-- Anyone can view approved/active markets
CREATE POLICY "markets_select" ON public.markets
    FOR SELECT USING (
        (approval_status = 'approved' AND active = true)
        OR submitted_by_vendor_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
        )
    );

-- Vendors can create/update/delete their own markets
CREATE POLICY "markets_insert" ON public.markets
    FOR INSERT WITH CHECK (
        submitted_by_vendor_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "markets_update" ON public.markets
    FOR UPDATE USING (
        submitted_by_vendor_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "markets_delete" ON public.markets
    FOR DELETE USING (
        submitted_by_vendor_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
        )
    );

GRANT ALL ON public.markets TO service_role;

-- ============================================================================
-- Done! Service role is used for admin operations to avoid RLS recursion
-- ============================================================================
