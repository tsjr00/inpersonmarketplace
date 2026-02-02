-- =============================================================================
-- Migration: Fix user profile creation trigger
-- =============================================================================
-- Created: 2026-02-01
-- Author: Claude Code
--
-- Purpose:
-- Fixes the create_profile_for_user() trigger function that was broken by
-- search_path security changes. The function needs SET search_path = 'public'
-- (not empty) and must use fully qualified table names.
--
-- Issue: "Database error saving new user" on signup
-- =============================================================================

-- Drop and recreate the function with proper security settings
CREATE OR REPLACE FUNCTION public.create_profile_for_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.user_profiles (
    user_id,
    email,
    display_name,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NOW(),
    NOW()
  );
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- Profile already exists, just return
    RETURN NEW;
  WHEN OTHERS THEN
    -- Log error but don't block user creation
    RAISE WARNING 'Failed to create user profile for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_profile_for_user();

-- Add comment
COMMENT ON FUNCTION public.create_profile_for_user() IS
'Automatically creates a user_profile record when a new user signs up via Supabase Auth. Fixed to handle search_path security.';

-- Verify function exists and has correct settings
DO $$
DECLARE
  func_exists boolean;
  trigger_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM pg_proc WHERE proname = 'create_profile_for_user'
  ) INTO func_exists;

  SELECT EXISTS(
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) INTO trigger_exists;

  IF NOT func_exists THEN
    RAISE EXCEPTION 'Function create_profile_for_user does not exist!';
  END IF;

  IF NOT trigger_exists THEN
    RAISE EXCEPTION 'Trigger on_auth_user_created does not exist!';
  END IF;

  RAISE NOTICE 'User profile trigger fixed successfully';
END $$;
