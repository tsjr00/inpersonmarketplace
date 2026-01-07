-- =============================================================================
-- Migration: Add admin role to user profiles
-- =============================================================================
-- Created: 2026-01-06 12:26:05 CST
-- Author: Claude Code
--
-- Purpose:
-- Adds role column to user_profiles to support admin access control.
-- Default role is 'user', admins get 'admin' role.
--
-- Dependencies:
-- Requires user_profiles table
--
-- Applied to:
-- [ ] Dev (vawpviatqalicckkqchs) - Date: ___________
-- [ ] Staging (vfknvsxfgcwqmlkuzhnq) - Date: ___________
--
-- Rollback:
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS role;
-- DROP TYPE IF EXISTS user_role;
-- =============================================================================

-- Create role enum
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('user', 'admin', 'super_admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add role column
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'user';

COMMENT ON COLUMN user_profiles.role IS
'User role: user (default), admin (platform admin), super_admin (full access)';

-- Create index for role queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_role
ON user_profiles(role);

-- Verify column added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'role'
  ) THEN
    RAISE EXCEPTION 'role column was not added';
  END IF;
  RAISE NOTICE 'Admin role column added successfully';
END $$;
