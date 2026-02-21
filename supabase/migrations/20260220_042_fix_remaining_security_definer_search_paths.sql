-- Migration: Fix remaining SECURITY DEFINER functions missing SET search_path
-- Created: 2026-02-20
-- Description: Adds SET search_path = public to 11 SECURITY DEFINER functions
--   from migrations 20260103_002 and 20260103_003 that were missed by the
--   earlier fix in 20260126_002.
--
-- Issue: C3 from Session 41 audit — search path injection vulnerability
-- Risk: Without SET search_path, SECURITY DEFINER functions could resolve
--   unqualified table names from attacker-controlled schemas.
--
-- Note: handle_new_user() was superseded by create_profile_for_user() (migration
--   20260201_003) but still exists in the database. We fix it for completeness.
--
-- Applied to:
-- [ ] Staging
-- [ ] Production
-- [ ] Dev

-- ============================================================================
-- RLS Helper Functions (20260103_002)
-- ============================================================================

ALTER FUNCTION public.has_role(user_role) SET search_path = public;
ALTER FUNCTION public.is_admin() SET search_path = public;
ALTER FUNCTION public.is_verifier() SET search_path = public;
ALTER FUNCTION public.get_user_vendor_ids() SET search_path = public;

-- ============================================================================
-- Trigger Functions (20260103_003)
-- ============================================================================

ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.track_vendor_status_change() SET search_path = public;
ALTER FUNCTION public.notify_transaction_status_change() SET search_path = public;

-- ============================================================================
-- Utility Functions (20260103_003)
-- ============================================================================

ALTER FUNCTION public.get_vertical_config(TEXT) SET search_path = public;
ALTER FUNCTION public.get_vendor_fields(TEXT) SET search_path = public;
ALTER FUNCTION public.get_listing_fields(TEXT) SET search_path = public;
ALTER FUNCTION public.user_owns_vendor(UUID) SET search_path = public;

-- ============================================================================
-- Verify: All public SECURITY DEFINER functions should have search_path
-- ============================================================================

DO $$
DECLARE
  unsafe_count INTEGER;
  func_names TEXT;
BEGIN
  SELECT COUNT(*), STRING_AGG(p.proname, ', ')
  INTO unsafe_count, func_names
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND (p.proconfig IS NULL OR NOT p.proconfig::text[] @> ARRAY['search_path=public'])
    AND p.prokind = 'f';

  IF unsafe_count > 0 THEN
    RAISE WARNING 'SECURITY DEFINER functions still missing search_path: % (%)', unsafe_count, func_names;
  ELSE
    RAISE NOTICE 'All public SECURITY DEFINER functions have search_path = public. ✓';
  END IF;
END $$;
