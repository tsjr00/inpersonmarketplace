-- =============================================================================
-- Migration: Enhance listings table with price and inventory fields
-- =============================================================================
-- Created: 2026-01-06 11:35:08 CST
-- Author: Claude Code
--
-- Purpose:
-- Adds explicit price and quantity columns to listings table for easier
-- querying and display. Also adds category and title/description fields.
--
-- Dependencies:
-- Requires listings table from initial schema
--
-- Applied to:
-- [x] Dev (vawpviatqalicckkqchs) - Date: 2026-01-06
-- [ ] Staging (vfknvsxfgcwqmlkuzhnq) - Date: ___________
--
-- Rollback:
-- ALTER TABLE listings DROP COLUMN IF EXISTS price_cents;
-- ALTER TABLE listings DROP COLUMN IF EXISTS quantity;
-- ALTER TABLE listings DROP COLUMN IF EXISTS category;
-- ALTER TABLE listings DROP COLUMN IF EXISTS image_urls;
-- ALTER TABLE listings DROP COLUMN IF EXISTS title;
-- ALTER TABLE listings DROP COLUMN IF EXISTS description;
-- =============================================================================

-- Add title column
ALTER TABLE listings ADD COLUMN IF NOT EXISTS title TEXT;

-- Add description column
ALTER TABLE listings ADD COLUMN IF NOT EXISTS description TEXT;

-- Add price column (stored as cents to avoid floating point issues)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS price_cents INTEGER DEFAULT 0;

-- Add quantity/inventory column
ALTER TABLE listings ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 0;

-- Add category column for filtering
ALTER TABLE listings ADD COLUMN IF NOT EXISTS category TEXT;

-- Add image URLs array
ALTER TABLE listings ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';

-- Add index for common queries
CREATE INDEX IF NOT EXISTS idx_listings_vendor_status
ON listings(vendor_profile_id, status)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_listings_vertical_status
ON listings(vertical_id, status)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_listings_category
ON listings(vertical_id, category)
WHERE deleted_at IS NULL;
