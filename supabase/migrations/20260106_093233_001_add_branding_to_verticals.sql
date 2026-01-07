-- =============================================================================
-- Migration: Add branding configuration to verticals table
-- =============================================================================
-- Created: 2026-01-06 09:32:33 CST
-- Author: Claude Code
--
-- Purpose:
-- Extends the verticals table to include branding and vendor field configurations.
-- This allows dynamic vertical management without code deployment.
-- The config column will store all vertical-specific data including branding,
-- vendor fields, and other configuration.
--
-- Dependencies:
-- Requires verticals table from 20260103_001_initial_schema.sql
--
-- Applied to:
-- [ ] Dev (vawpviatqalicckkqchs) - Date: ___________
-- [ ] Staging (vfknvsxfgcwqmlkuzhnq) - Date: ___________
--
-- Rollback:
-- N/A - This is additive, no data loss on rollback
-- Config column can be set to NULL if needed
-- =============================================================================

-- No schema changes needed - config column already exists as JSONB
-- This migration just adds comments and an index for the config structure

-- Verify column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'verticals'
    AND column_name = 'config'
  ) THEN
    RAISE EXCEPTION 'config column does not exist in verticals table';
  END IF;
END $$;

-- Add comment explaining config structure
COMMENT ON COLUMN verticals.config IS
'Complete vertical configuration including branding, vendor_fields, and other settings. Structure:
{
  "branding": {
    "domain": "example.com",
    "brand_name": "Brand Name",
    "tagline": "Brand tagline",
    "logo_path": "/logos/brand.svg",
    "favicon": "/favicons/brand.ico",
    "colors": {
      "primary": "#hex",
      "secondary": "#hex",
      "accent": "#hex",
      "background": "#hex",
      "text": "#hex"
    },
    "meta": {
      "title": "Page title",
      "description": "Meta description",
      "keywords": "keyword1, keyword2"
    }
  },
  "vendor_fields": [...],
  "other_config": {...}
}';

-- Create index on config for better query performance
CREATE INDEX IF NOT EXISTS idx_verticals_config_gin
ON verticals USING GIN (config);

COMMENT ON INDEX idx_verticals_config_gin IS
'GIN index for efficient JSONB queries on vertical configuration';
