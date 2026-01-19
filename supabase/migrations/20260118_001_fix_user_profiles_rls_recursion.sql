-- =============================================================================
-- Migration: Fix infinite recursion in user_profiles RLS policy
-- =============================================================================
-- Created: 2026-01-18
-- Author: Claude Code
--
-- Purpose:
-- The "user_profiles_select" policy had a recursive admin check that queried
-- user_profiles while reading from user_profiles, causing infinite recursion.
-- This migration replaces it with a simple policy that lets users read their
-- own profile. Admin operations use service role which bypasses RLS anyway.
--
-- Applied to:
-- [x] Dev - Date: 2026-01-18
-- [x] Staging - Date: 2026-01-18
-- =============================================================================

-- Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS "user_profiles_select" ON user_profiles;

-- Create a simple policy that just lets users read their own profile
CREATE POLICY "user_profiles_select"
ON user_profiles FOR SELECT
USING (user_id = auth.uid());
