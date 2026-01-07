-- =============================================================================
-- Migration: Seed branding configurations for existing verticals
-- =============================================================================
-- Created: 2026-01-06 09:32:33 CST
-- Author: Claude Code
--
-- Purpose:
-- Populates the config column with branding and vendor field data for
-- existing fireworks and farmers_market verticals. This data was previously
-- only in JSON files - now it's in the database.
--
-- Dependencies:
-- Requires 20260106_093233_001_add_branding_to_verticals.sql
--
-- Applied to:
-- [ ] Dev (vawpviatqalicckkqchs) - Date: ___________
-- [ ] Staging (vfknvsxfgcwqmlkuzhnq) - Date: ___________
--
-- Rollback:
-- UPDATE verticals SET config = jsonb_strip_nulls(config - 'branding');
-- =============================================================================

-- Update fireworks vertical with complete config
UPDATE verticals
SET config = jsonb_set(
  COALESCE(config, '{}'::jsonb),
  '{branding}',
  '{
    "domain": "fireworksstand.com",
    "brand_name": "Fireworks Stand",
    "tagline": "Your Premier Fireworks Marketplace",
    "logo_path": "/branding/fireworks-logo.svg",
    "favicon": "/branding/fireworks-favicon.ico",
    "colors": {
      "primary": "#ff4500",
      "secondary": "#ffa500",
      "accent": "#ff6347",
      "background": "#1a1a1a",
      "text": "#ffffff"
    },
    "meta": {
      "title": "Fireworks Stand - Buy & Sell Fireworks",
      "description": "Connect with licensed fireworks sellers in your area",
      "keywords": "fireworks, buy fireworks, fireworks stand, fireworks marketplace"
    }
  }'::jsonb
)
WHERE vertical_id = 'fireworks';

-- Update farmers_market vertical with complete config
UPDATE verticals
SET config = jsonb_set(
  COALESCE(config, '{}'::jsonb),
  '{branding}',
  '{
    "domain": "farmersmarket.app",
    "brand_name": "Fresh Market",
    "tagline": "Farm Fresh, Locally Grown",
    "logo_path": "/branding/farmers-logo.svg",
    "favicon": "/branding/farmers-favicon.ico",
    "colors": {
      "primary": "#2d5016",
      "secondary": "#6b8e23",
      "accent": "#9acd32",
      "background": "#f5f5dc",
      "text": "#2d2d2d"
    },
    "meta": {
      "title": "Fresh Market - Local Farmers & Producers",
      "description": "Buy fresh produce directly from local farmers",
      "keywords": "farmers market, fresh produce, local food, organic"
    }
  }'::jsonb
)
WHERE vertical_id = 'farmers_market';

-- Verify data was inserted
DO $$
DECLARE
  fireworks_branding jsonb;
  farmers_branding jsonb;
BEGIN
  SELECT config->'branding' INTO fireworks_branding
  FROM verticals WHERE vertical_id = 'fireworks';

  SELECT config->'branding' INTO farmers_branding
  FROM verticals WHERE vertical_id = 'farmers_market';

  IF fireworks_branding IS NULL OR farmers_branding IS NULL THEN
    RAISE EXCEPTION 'Branding data not properly inserted';
  END IF;

  RAISE NOTICE 'Branding data successfully seeded for both verticals';
END $$;
