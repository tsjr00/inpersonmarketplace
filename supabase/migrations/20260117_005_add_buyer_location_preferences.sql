-- ============================================================================
-- Migration: Add Buyer Location Preferences
-- Created: 2026-01-17
-- Purpose: Store buyer preferred location for 25-mile radius filtering
-- ============================================================================

-- Add location preference columns to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS preferred_latitude DECIMAL(10,8),
ADD COLUMN IF NOT EXISTS preferred_longitude DECIMAL(11,8),
ADD COLUMN IF NOT EXISTS location_source TEXT CHECK (location_source IN ('gps', 'manual', 'ip')),
ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN user_profiles.preferred_latitude IS 'Buyer preferred latitude for finding nearby vendors/markets';
COMMENT ON COLUMN user_profiles.preferred_longitude IS 'Buyer preferred longitude for finding nearby vendors/markets';
COMMENT ON COLUMN user_profiles.location_source IS 'How location was obtained: gps (browser), manual (ZIP entry), ip (IP geolocation)';
COMMENT ON COLUMN user_profiles.location_updated_at IS 'When the location preference was last updated';

-- Add index for location queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_location ON user_profiles(preferred_latitude, preferred_longitude)
  WHERE preferred_latitude IS NOT NULL AND preferred_longitude IS NOT NULL;

-- ============================================================================
-- END MIGRATION
-- ============================================================================
