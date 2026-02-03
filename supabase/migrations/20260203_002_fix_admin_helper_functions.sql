-- Migration: Fix admin helper functions for proper role detection
-- Created: 2026-02-03
-- Purpose: Properly detect platform admins and vertical admins
--
-- Background:
-- - Users can have multiple "hats": admin, buyer/shopper, vendor/seller
-- - Two admin types: Platform admins (all verticals) and Vertical admins (one vertical)
-- - Platform admin stored in user_profiles.role OR user_profiles.roles array
-- - Vertical admin stored in vertical_admins table
--
-- Issue fixed:
-- - is_platform_admin() only checked 'roles' array, not 'role' column
-- - No helper existed for vertical admin checks

-- ============================================================================
-- 1. Fix is_platform_admin() - check BOTH role column AND roles array
-- ============================================================================

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_id = (SELECT auth.uid())
    AND (
      role = 'admin'
      OR 'admin' = ANY(roles)
    )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION is_platform_admin() IS
  'Returns true if current user is a platform-wide admin (can manage all verticals)';

-- ============================================================================
-- 2. Create is_vertical_admin(vertical_id) - check vertical_admins table
-- ============================================================================

CREATE OR REPLACE FUNCTION is_vertical_admin(p_vertical_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM vertical_admins
    WHERE user_id = (SELECT auth.uid())
    AND vertical_id = p_vertical_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION is_vertical_admin(TEXT) IS
  'Returns true if current user is an admin for the specified vertical';

-- ============================================================================
-- 3. Create is_admin_for_vertical(vertical_id) - platform OR vertical admin
-- ============================================================================
-- This is the most commonly needed check: "can this user admin this vertical?"

CREATE OR REPLACE FUNCTION is_admin_for_vertical(p_vertical_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT
    is_platform_admin()
    OR is_vertical_admin(p_vertical_id);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION is_admin_for_vertical(TEXT) IS
  'Returns true if current user can admin the specified vertical (platform or vertical admin)';

-- ============================================================================
-- 4. Create is_any_admin() - is user ANY type of admin?
-- ============================================================================
-- Useful for showing admin UI elements

CREATE OR REPLACE FUNCTION is_any_admin()
RETURNS BOOLEAN AS $$
  SELECT
    is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM vertical_admins
      WHERE user_id = (SELECT auth.uid())
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION is_any_admin() IS
  'Returns true if current user is any type of admin (platform or any vertical)';

-- ============================================================================
-- 5. Create get_user_admin_verticals() - list verticals user can admin
-- ============================================================================
-- Returns all verticals a user can admin (useful for UI filtering)

CREATE OR REPLACE FUNCTION get_user_admin_verticals()
RETURNS TABLE(vertical_id TEXT, is_platform_admin BOOLEAN, is_vertical_admin BOOLEAN) AS $$
BEGIN
  -- If platform admin, return all verticals
  IF is_platform_admin() THEN
    RETURN QUERY
    SELECT v.vertical_id, TRUE, FALSE
    FROM verticals v
    WHERE v.status = 'active';
  ELSE
    -- Return only verticals where user is vertical admin
    RETURN QUERY
    SELECT va.vertical_id, FALSE, TRUE
    FROM vertical_admins va
    WHERE va.user_id = (SELECT auth.uid());
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

COMMENT ON FUNCTION get_user_admin_verticals() IS
  'Returns list of verticals the current user can administer';

-- ============================================================================
-- 6. Update markets RLS policy to use fixed function
-- ============================================================================
-- The markets_public_select policy already uses is_platform_admin()
-- which will now work correctly. But let's also add vertical admin support.

DROP POLICY IF EXISTS "markets_public_select" ON public.markets;

CREATE POLICY "markets_public_select" ON public.markets
    FOR SELECT USING (
        -- Public: approved and active markets
        (approval_status = 'approved' AND active = true)
        OR
        -- Vendors can see their own submitted/private markets
        submitted_by_vendor_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
        )
        OR
        -- Buyers can see markets from their orders
        id IN (
            SELECT oi.market_id FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.buyer_user_id = (SELECT auth.uid())
            AND oi.market_id IS NOT NULL
        )
        OR
        -- Buyers can also see markets via listing_markets from their orders
        id IN (
            SELECT lm.market_id FROM listing_markets lm
            JOIN order_items oi ON oi.listing_id = lm.listing_id
            JOIN orders o ON o.id = oi.order_id
            WHERE o.buyer_user_id = (SELECT auth.uid())
        )
        OR
        -- Platform admins can see all markets
        is_platform_admin()
        OR
        -- Vertical admins can see markets in their vertical
        is_vertical_admin(vertical_id)
    );

COMMENT ON POLICY "markets_public_select" ON public.markets IS
  'Allows viewing markets: public approved, own submissions, order-related, or as admin';

-- ============================================================================
-- 7. Ensure "Admins can view all markets" policy doesn't conflict
-- ============================================================================
-- This was created in an earlier migration - drop it since we now handle
-- admin access in the main select policy

DROP POLICY IF EXISTS "Admins can view all markets" ON public.markets;

-- ============================================================================
-- Done!
-- ============================================================================
--
-- Summary of functions available:
--   is_platform_admin()              - Check if user is platform-wide admin
--   is_vertical_admin(vertical_id)   - Check if user is admin for specific vertical
--   is_admin_for_vertical(vertical_id) - Check if user can admin a vertical (either type)
--   is_any_admin()                   - Check if user is any type of admin
--   get_user_admin_verticals()       - List all verticals user can admin
--
-- Usage in RLS policies:
--   OR is_platform_admin()                    -- platform admins only
--   OR is_vertical_admin(vertical_id)         -- vertical admins for this record
--   OR is_admin_for_vertical(vertical_id)     -- either admin type
--   OR is_any_admin()                         -- any admin access
