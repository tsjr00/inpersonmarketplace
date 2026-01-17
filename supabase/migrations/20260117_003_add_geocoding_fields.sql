-- ============================================================================
-- Migration: Add Geocoding Fields for Geographic Filtering
-- Created: 2026-01-17
-- Purpose: Enable 25-mile radius filtering for vendors and markets
-- ============================================================================

-- Add latitude/longitude to vendor_profiles (vendor business address)
ALTER TABLE vendor_profiles
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11,8),
ADD COLUMN IF NOT EXISTS geocoding_failed BOOLEAN DEFAULT false;

COMMENT ON COLUMN vendor_profiles.latitude IS 'Latitude of vendor business address';
COMMENT ON COLUMN vendor_profiles.longitude IS 'Longitude of vendor business address';
COMMENT ON COLUMN vendor_profiles.geocoding_failed IS 'True if automatic geocoding failed for this address';

-- Add latitude/longitude to markets
ALTER TABLE markets
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11,8),
ADD COLUMN IF NOT EXISTS geocoding_failed BOOLEAN DEFAULT false;

COMMENT ON COLUMN markets.latitude IS 'Latitude of market address';
COMMENT ON COLUMN markets.longitude IS 'Longitude of market address';
COMMENT ON COLUMN markets.geocoding_failed IS 'True if automatic geocoding failed for this address';

-- Add indexes for geographic queries
-- Note: For actual geographic queries, consider using PostGIS extension
-- For now, simple indexes for coordinate-based filtering
CREATE INDEX IF NOT EXISTS idx_markets_coordinates ON markets(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_coordinates ON vendor_profiles(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- ============================================================================
-- END MIGRATION
-- ============================================================================
