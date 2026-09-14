-- ============================================================================
-- Migration 248: revoke PUBLIC EXECUTE on five write-capable SECURITY DEFINER
--                functions that never check who is calling (launch review A-1)
-- ============================================================================
-- ⛔ DIFFERENTIAL CLASS — DO NOT PASTE until the code push carrying the
--    skip-route change (vendor_skip_week called via the service client) is
--    DEPLOYED to this environment. Pasting first breaks vendor "skip a week".
--
-- Found 2026-09-11 by running has_function_privilege('anon', …) on PROD.
-- Every function below writes data as its owner (SECURITY DEFINER) and its
-- body contains no auth.uid() / is_admin() check, so anyone holding the public
-- anon key could invoke it over PostgREST /rpc/ — no app route involved.
--
--   vendor_skip_week(uuid, text)          skips ANY market-box pickup and extends
--                                         the subscription (mig 124)          HIGH
--   ensure_user_profile(uuid, text, text) inserts a user_profiles row for an
--                                         ARBITRARY user_id / email (mig 085b) MEDIUM
--   cleanup_cart_items_invalid_schedules() deletes cart items platform-wide and
--                                         returns the affected users' ids (mig 002 pickup) MEDIUM
--   refresh_vendor_location(uuid) /
--   refresh_all_vendor_locations()        wipe + rebuild vendor_location_cache;
--                                         nearby search is empty mid-rebuild (mig 005) MEDIUM
--   scan_vendor_activity(text)            runs the vendor-activity scan, writing
--                                         flags + scan log rows (mig 237)      MEDIUM
--
-- Pattern = mig 152 (REVOKE … FROM PUBLIC), proven live: anon lost EXECUTE,
-- service-role callers kept working with no explicit GRANT.
--
-- App callers after the preceding code deploy:
--   vendor_skip_week   → skip route (service client after its ownership check),
--                        lib/markets/cancel-date-cascade.ts (already service)
--   ensure_user_profile → login page via the USER client → keeps EXECUTE for
--                        authenticated, but the body now refuses any p_user_id
--                        that is not auth.uid()
--   scan_vendor_activity → cron via service key (unchanged)
--   cleanup_* / refresh_* → no app callers
--
-- PRE-CHECK (expect anon_can_exec = true on all six = the hole is open):
--   SELECT proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_exec
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND proname IN ('vendor_skip_week','ensure_user_profile',
--     'cleanup_cart_items_invalid_schedules','refresh_vendor_location',
--     'refresh_all_vendor_locations','scan_vendor_activity') ORDER BY 1;
-- POST-CHECK: same query → false on all six; and
--   has_function_privilege('authenticated', …) true ONLY for ensure_user_profile.
--
-- ROLLBACK: GRANT EXECUTE ON FUNCTION <each signature below> TO PUBLIC; then
--   re-apply applied/20260316_085b_lazy_profile_and_role_functions.sql lines
--   56-86 to restore the unguarded ensure_user_profile body.
-- No NOTIFY pgrst needed — grants and function bodies do not change the schema cache.
-- ============================================================================

-- 1. Remove the default PUBLIC grant (anon + authenticated lose EXECUTE).
--    REVOKE of a privilege a role does not hold is a no-op; re-runnable.
REVOKE EXECUTE ON FUNCTION public.vendor_skip_week(uuid, text)            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_user_profile(uuid, text, text)   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_cart_items_invalid_schedules()  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_vendor_location(uuid)           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_all_vendor_locations()          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.scan_vendor_activity(text)              FROM PUBLIC;

-- mig 005 also granted the two refresh functions to authenticated explicitly.
REVOKE EXECUTE ON FUNCTION public.refresh_vendor_location(uuid)           FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_all_vendor_locations()          FROM authenticated;

-- 2. ensure_user_profile: SAME signature (the login page keeps working), but the
--    caller may only ensure THEIR OWN profile. Everything after the guard is
--    mig 085b's body verbatim.
CREATE OR REPLACE FUNCTION public.ensure_user_profile(
  p_user_id UUID,
  p_email TEXT,
  p_display_name TEXT DEFAULT ''
)
RETURNS JSONB AS $$
DECLARE
  v_profile RECORD;
BEGIN
  -- mig 248: refuse to act for anyone but the authenticated caller. auth.uid()
  -- is NULL for anon and for service-role sessions; neither has a legitimate
  -- reason to create someone else's profile row.
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'ensure_user_profile: caller may only ensure their own profile'
      USING ERRCODE = '42501';
  END IF;

  SELECT id, user_id, email, role, roles INTO v_profile
  FROM public.user_profiles
  WHERE user_id = p_user_id;

  IF FOUND THEN
    RETURN jsonb_build_object('status', 'exists', 'profile_id', v_profile.id);
  END IF;

  INSERT INTO public.user_profiles (user_id, email, display_name, role, roles, created_at, updated_at)
  VALUES (p_user_id, p_email, COALESCE(NULLIF(p_display_name, ''), split_part(p_email, '@', 1)),
          'buyer'::user_role, ARRAY['buyer']::user_role[], NOW(), NOW())
  RETURNING id INTO v_profile;

  RETURN jsonb_build_object('status', 'created', 'profile_id', v_profile.id);

EXCEPTION
  WHEN unique_violation THEN
    -- Race: profile was created between the SELECT and the INSERT
    SELECT id INTO v_profile FROM public.user_profiles WHERE user_id = p_user_id;
    RETURN jsonb_build_object('status', 'exists', 'profile_id', v_profile.id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.ensure_user_profile(UUID, TEXT, TEXT) IS
'Lazy profile creation for the AUTHENTICATED CALLER ONLY (mig 248: p_user_id must equal auth.uid()). Called from the login flow when the profile row is missing. Returns {status: "exists"|"created", profile_id: UUID}.';

-- The login page calls this with the user's own session → authenticated must keep EXECUTE.
GRANT EXECUTE ON FUNCTION public.ensure_user_profile(uuid, text, text) TO authenticated;
