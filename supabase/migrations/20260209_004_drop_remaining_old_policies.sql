-- Drop remaining old-named duplicate policies that were not covered by
-- 20260209_002 (6-table merge) and 20260209_003 (markets merge).
--
-- Same pattern: old human-readable policy names coexist with newer
-- standardized names. Postgres OR-combines them, so no behavioral change
-- from dropping — pure performance cleanup.
--
-- Skipping: user_profiles (recursion risk with is_platform_admin())

-- ============================================================
-- 1. TRANSACTIONS — drop old-named SELECT + UPDATE duplicates
-- ============================================================
-- transactions_select already has: buyer OR vendor OR is_admin_for_vertical()
-- transactions_update already has: buyer OR vendor
-- These old policies are fully redundant.

DROP POLICY IF EXISTS "Admins can view all transactions" ON public.transactions;
DROP POLICY IF EXISTS "Vendors can view their transactions" ON public.transactions;
DROP POLICY IF EXISTS "Vendors can update transactions" ON public.transactions;

-- ============================================================
-- 2. VENDOR_PAYOUTS — drop old vendor-specific select
-- ============================================================
-- vendor_payouts_select already has: vendor OR can_admin_vendor()

DROP POLICY IF EXISTS "vendor_payouts_vendor_select" ON public.vendor_payouts;

-- ============================================================
-- 3. ORGANIZATIONS — drop old admin select
-- ============================================================
-- organizations_select is USING (true) — everyone can read.
-- "Admins can view all organizations" is completely redundant.

DROP POLICY IF EXISTS "Admins can view all organizations" ON public.organizations;

-- ============================================================
-- 4. VENDOR_PROFILES — merge admin access, drop old policies
-- ============================================================
-- Current vendor_profiles_select: approved+active OR user owns it
-- Missing: admin access (was only in old "Admins can view all vendor profiles")
-- Current vendor_profiles_update: user owns it
-- Missing: admin access (was only in old "Admins can update vendor profiles")
--
-- Safe: is_platform_admin() queries user_profiles, not vendor_profiles (no recursion)

DROP POLICY IF EXISTS "Admins can view all vendor profiles" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Public can view approved vendors" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Vendors can view own profiles" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Admins can update vendor profiles" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Vendors can update own profiles" ON public.vendor_profiles;

-- Recreate with admin access merged in
DROP POLICY IF EXISTS "vendor_profiles_select" ON public.vendor_profiles;
CREATE POLICY "vendor_profiles_select" ON public.vendor_profiles
  FOR SELECT TO public
  USING (
    -- Public: approved and not deleted
    ((status = 'approved'::vendor_status) AND (deleted_at IS NULL))
    -- Vendor: owns this profile
    OR (user_id = (SELECT auth.uid()))
    -- Admin: platform admin
    OR (SELECT is_platform_admin())
    -- Admin: vertical admin for this vendor's vertical
    OR is_admin_for_vertical(vertical_id)
  );

DROP POLICY IF EXISTS "vendor_profiles_update" ON public.vendor_profiles;
CREATE POLICY "vendor_profiles_update" ON public.vendor_profiles
  FOR UPDATE TO public
  USING (
    -- Vendor: owns this profile
    (user_id = (SELECT auth.uid()))
    -- Admin: platform admin
    OR (SELECT is_platform_admin())
    -- Admin: vertical admin for this vendor's vertical
    OR is_admin_for_vertical(vertical_id)
  );

-- ============================================================
-- 5. VENDOR_VERIFICATIONS — merge admin access, drop old policies
-- ============================================================
-- Current vendor_verifications_select: vendor owns it
-- Missing: admin/verifier access (was in old "Verifiers can view all verifications")

DROP POLICY IF EXISTS "Vendors can view own verifications" ON public.vendor_verifications;
DROP POLICY IF EXISTS "Verifiers can view all verifications" ON public.vendor_verifications;

DROP POLICY IF EXISTS "vendor_verifications_select" ON public.vendor_verifications;
CREATE POLICY "vendor_verifications_select" ON public.vendor_verifications
  FOR SELECT TO public
  USING (
    -- Vendor: owns this verification
    (vendor_profile_id IN (SELECT user_vendor_profile_ids()))
    -- Admin: platform admin
    OR (SELECT is_platform_admin())
    -- Admin: vertical admin for this vendor
    OR can_admin_vendor(vendor_profile_id)
  );

-- ============================================================
-- 6. VERTICALS — replace ALL policy with specific admin policies
-- ============================================================
-- verticals_select (USING true) already covers all SELECT access.
-- "Admins can manage verticals" is an ALL policy that also covers
-- INSERT/UPDATE/DELETE. We replace it with specific admin policies
-- to eliminate the duplicate SELECT evaluation.

DROP POLICY IF EXISTS "Admins can manage verticals" ON public.verticals;
DROP POLICY IF EXISTS "Public can read active verticals" ON public.verticals;

CREATE POLICY "verticals_admin_insert" ON public.verticals
  FOR INSERT TO public
  WITH CHECK ((SELECT is_platform_admin()));

CREATE POLICY "verticals_admin_update" ON public.verticals
  FOR UPDATE TO public
  USING ((SELECT is_platform_admin()));

CREATE POLICY "verticals_admin_delete" ON public.verticals
  FOR DELETE TO public
  USING ((SELECT is_platform_admin()));
