-- =============================================================================
-- Migration 085b: Lazy profile creation + role function updates
-- =============================================================================
-- Created: 2026-03-16 (split from 085 on 2026-03-20)
-- Author: Claude Code
--
-- REQUIRES: 085a must be committed first (enum values must exist).
--
-- Changes:
-- 1. Migrate any 'verifier' role data to 'regional_admin'
-- 2. Create is_regional_admin() function (replaces is_verifier)
-- 3. Keep is_verifier() as backward-compatible alias
-- 4. Update is_platform_admin() to check both admin and platform_admin roles
-- 5. Create ensure_user_profile() RPC for lazy profile creation on login
-- =============================================================================

-- 1. Migrate any existing 'verifier' data to 'regional_admin'
UPDATE user_profiles SET role = 'regional_admin'::user_role WHERE role = 'verifier';
UPDATE user_profiles SET roles = array_replace(roles, 'verifier'::user_role, 'regional_admin'::user_role)
  WHERE 'verifier'::user_role = ANY(roles);

-- 2. Replace is_verifier() with is_regional_admin()
CREATE OR REPLACE FUNCTION public.is_regional_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.has_role('regional_admin') OR public.has_role('admin') OR public.has_role('platform_admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.is_regional_admin() IS
'Returns true if current user has regional_admin, admin, or platform_admin role. Replaces is_verifier().';

-- 3. Keep is_verifier() as alias for backward compatibility
CREATE OR REPLACE FUNCTION public.is_verifier()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.is_regional_admin();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.is_verifier() IS
'DEPRECATED: Use is_regional_admin() instead. Kept as alias for backward compatibility with existing RLS policies.';

-- 4. Update is_platform_admin() to check both roles
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.has_role('platform_admin') OR public.has_role('admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.is_platform_admin() IS
'Returns true if current user has platform_admin or admin role. platform_admin is now a valid enum value.';

-- 5. Lazy profile creation function (called from login flow via RPC)
CREATE OR REPLACE FUNCTION public.ensure_user_profile(
  p_user_id UUID,
  p_email TEXT,
  p_display_name TEXT DEFAULT ''
)
RETURNS JSONB AS $$
DECLARE
  v_profile RECORD;
BEGIN
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
    -- Race condition: profile was created between SELECT and INSERT
    SELECT id INTO v_profile FROM public.user_profiles WHERE user_id = p_user_id;
    RETURN jsonb_build_object('status', 'exists', 'profile_id', v_profile.id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.ensure_user_profile(UUID, TEXT, TEXT) IS
'Lazy profile creation: ensures a user_profiles row exists for the given auth user. Called from login flow when profile is missing. Returns {status: "exists"|"created", profile_id: UUID}.';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
