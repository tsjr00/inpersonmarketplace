-- =============================================================================
-- Migration: RLS policies for user_profiles table
-- =============================================================================
-- Created: 2026-01-05 15:22:30 CST
-- Author: Claude Code
--
-- Purpose:
-- Implements Row Level Security policies for user_profiles table to ensure:
-- - Users can read their own profile
-- - Users can update their own profile
-- - Service role can insert profiles (for trigger)
-- - Authenticated users can insert their own profile (fallback)
--
-- Dependencies:
-- Requires user_profiles table from 20260103_001_initial_schema.sql
--
-- Applied to:
-- [ ] Dev (vawpviatqalicckkqchs) - Date: ___________
-- [ ] Staging (vfknvsxfgcwqmlkuzhnq) - Date: ___________
--
-- Rollback:
-- DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
-- DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
-- DROP POLICY IF EXISTS "Service role can insert profiles" ON user_profiles;
-- DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
-- ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
-- =============================================================================

-- Enable RLS (safe to run if already enabled)
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (idempotent)
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;

-- Policy: Users can read their own profile
CREATE POLICY "Users can read own profile"
ON user_profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
ON user_profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Allow trigger to insert (service role)
CREATE POLICY "Service role can insert profiles"
ON user_profiles
FOR INSERT
TO service_role
WITH CHECK (true);

-- Policy: Allow authenticated users to insert their own profile (if trigger fails)
CREATE POLICY "Users can insert own profile"
ON user_profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
