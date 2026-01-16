-- Migration: Add profile_image_url to vendor_profiles
-- Date: 2026-01-15
-- Phase: P
-- Purpose: Enable vendor profile image/logo uploads

-- Add profile_image_url column
ALTER TABLE vendor_profiles
ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

-- Add comment
COMMENT ON COLUMN vendor_profiles.profile_image_url IS 'URL to vendor profile image/logo';

-- Migration applied successfully
