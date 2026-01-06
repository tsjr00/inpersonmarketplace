-- =============================================================================
-- Migration: Create user profile auto-generation trigger
-- =============================================================================
-- Created: 2026-01-05 15:22:00 CST
-- Author: Claude Code
--
-- Purpose:
-- Automatically creates a user_profiles entry when a new user signs up via
-- Supabase Auth. This ensures every authenticated user has a corresponding
-- profile in our public.user_profiles table.
--
-- Dependencies:
-- Requires user_profiles table from 20260103_001_initial_schema.sql
--
-- Applied to:
-- [ ] Dev (vawpviatqalicckkqchs) - Date: ___________
-- [ ] Staging (vfknvsxfgcwqmlkuzhnq) - Date: ___________
--
-- Rollback:
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP FUNCTION IF EXISTS create_profile_for_user();
-- =============================================================================

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION create_profile_for_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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
END;
$$;

-- Create trigger on auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_profile_for_user();

-- Add comment
COMMENT ON FUNCTION create_profile_for_user() IS
'Automatically creates a user_profile record when a new user signs up via Supabase Auth';
