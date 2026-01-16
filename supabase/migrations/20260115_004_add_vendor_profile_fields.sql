-- Migration: Add profile fields to vendor_profiles
-- Date: 2026-01-15
-- Phase: P
-- Purpose: Enable vendor descriptions and social links

-- Add description field (both tiers)
ALTER TABLE vendor_profiles
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add social links (premium only, enforced in app)
ALTER TABLE vendor_profiles
ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}'::jsonb;

-- Example social_links structure:
-- {
--   "facebook": "https://facebook.com/...",
--   "instagram": "https://instagram.com/...",
--   "website": "https://..."
-- }

-- Add comments
COMMENT ON COLUMN vendor_profiles.description IS 'Vendor description/about section (both tiers)';
COMMENT ON COLUMN vendor_profiles.social_links IS 'Social media links (premium tier only)';

-- Migration applied successfully
