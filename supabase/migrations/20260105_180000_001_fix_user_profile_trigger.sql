-- =============================================================================
-- Migration: Fix user profile trigger column name
-- =============================================================================
-- Created: 2026-01-05 18:00:00 CST
-- Author: Claude Code
--
-- Purpose:
-- Fixes the create_profile_for_user() trigger function to use the correct
-- column name 'display_name' instead of 'full_name' which doesn't exist.
--
-- Bug: The original trigger migration (20260105_152200_001) used 'full_name'
-- but the initial schema (20260103_001) defined the column as 'display_name'.
--
-- Dependencies:
-- Requires user_profiles table from 20260103_001_initial_schema.sql
--
-- Applied to:
-- [ ] Dev (vawpviatqalicckkqchs) - Date: ___________
-- [ ] Staging (vfknvsxfgcwqmlkuzhnq) - Date: ___________
--
-- Rollback:
-- Re-run 20260105_152200_001_user_profile_trigger.sql (but it will still be broken)
-- =============================================================================

-- Fix the function to use correct column name
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

-- Add updated comment
COMMENT ON FUNCTION create_profile_for_user() IS
'Automatically creates a user_profile record when a new user signs up via Supabase Auth. Fixed column name 2026-01-05.';
