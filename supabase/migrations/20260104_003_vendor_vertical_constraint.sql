-- Migration: Add unique constraint for user+vertical combination
-- Created: 2026-01-04
-- Purpose: Prevent duplicate vendor profiles per vertical

-- Add unique constraint
ALTER TABLE vendor_profiles
ADD CONSTRAINT unique_user_vertical
UNIQUE (user_id, vertical_id);

-- Add index for common queries
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_user_vertical
ON vendor_profiles(user_id, vertical_id);

COMMENT ON CONSTRAINT unique_user_vertical ON vendor_profiles IS
'Ensures a user can only have one vendor profile per vertical, but can have multiple profiles across different verticals';
