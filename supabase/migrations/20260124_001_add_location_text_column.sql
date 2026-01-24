-- ============================================================================
-- Migration: Add Location Text Column
-- Created: 2026-01-24
-- Purpose: Store display text for user's saved location (ZIP code or city name)
-- ============================================================================

-- Add location_text column to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS location_text TEXT;

COMMENT ON COLUMN user_profiles.location_text IS 'Display text for location (e.g., "12345" for ZIP or "New York, NY" for city)';

-- ============================================================================
-- END MIGRATION
-- ============================================================================
