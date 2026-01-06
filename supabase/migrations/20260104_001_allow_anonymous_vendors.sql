-- Migration: Allow anonymous vendor signups (temporary until auth)
-- Created: 2026-01-04
-- Purpose: Remove vendor_owner_check to allow signups without user_id

-- Drop the existing constraint
ALTER TABLE vendor_profiles
DROP CONSTRAINT IF EXISTS vendor_owner_check;

-- Add comment explaining temporary state
COMMENT ON TABLE vendor_profiles IS
'Vendor profile data. Note: user_id and organization_id are nullable temporarily
to allow anonymous signups. When auth is implemented, profiles will be claimed
by matching email addresses.';

-- Add index on email for future matching
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_email
ON vendor_profiles ((profile_data->>'email'));

COMMENT ON INDEX idx_vendor_profiles_email IS
'For matching anonymous profiles to user accounts on signup via email';
