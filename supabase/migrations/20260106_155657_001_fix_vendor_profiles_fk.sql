-- =============================================================================
-- Migration: Fix vendor_profiles FK constraint
-- =============================================================================
-- Created: 2026-01-06 15:56:57 CST
-- Author: Claude Code
--
-- Purpose: FK was referencing user_profiles.id instead of user_profiles.user_id
--
-- Applied to:
-- [x] Dev (vawpviatqalicckkqchs) - Date: manual fix prior
-- [ ] Staging (vfknvsxfgcwqmlkuzhnq) - Date: ___________
-- =============================================================================

-- Drop the bad FK
ALTER TABLE vendor_profiles
DROP CONSTRAINT IF EXISTS vendor_profiles_user_id_fkey;

-- Recreate with correct reference
ALTER TABLE vendor_profiles
ADD CONSTRAINT vendor_profiles_user_id_fkey
FOREIGN KEY (user_id) REFERENCES user_profiles(user_id);
