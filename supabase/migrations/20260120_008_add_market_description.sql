-- Migration: Add description and website columns to markets
-- Purpose: Allow market suggestions to include description and website info

ALTER TABLE markets
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS website TEXT;

COMMENT ON COLUMN markets.description IS 'Description of the market (optional)';
COMMENT ON COLUMN markets.website IS 'Website URL for the market (optional)';
