-- Migration: Make premium window triggers vertical-aware
-- Date: 2026-02-17
-- Purpose: Food trucks should NOT get premium windows set on their listings/market boxes.
--   The vertical's config.buyer_premium_enabled flag controls this behavior.
--   Also fixes market box trigger capacity-increase regression (was fixed for listings in 009 but not market boxes).
--
-- Changes:
--   1. set_listing_premium_window() — checks vertical config before setting window
--   2. set_market_box_premium_window() — same + removes capacity-increase condition
--   3. Adds buyer_premium_enabled config to verticals table rows

-- ============================================================================
-- 1. Update set_listing_premium_window() — vertical-aware
-- ============================================================================
CREATE OR REPLACE FUNCTION set_listing_premium_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  window_minutes INTEGER;
  premium_enabled BOOLEAN;
BEGIN
  -- Check if buyer premium is enabled for this vertical
  SELECT COALESCE((config->>'buyer_premium_enabled')::BOOLEAN, true)
  INTO premium_enabled
  FROM verticals
  WHERE vertical_id = NEW.vertical_id;

  -- If premium is disabled for this vertical, ensure no window is set
  IF NOT COALESCE(premium_enabled, true) THEN
    NEW.premium_window_ends_at := NULL;
    RETURN NEW;
  END IF;

  SELECT COALESCE(value::INTEGER, 120) INTO window_minutes
  FROM platform_settings
  WHERE key = 'premium_window_minutes';

  IF window_minutes IS NULL THEN
    window_minutes := 120;
  END IF;

  -- Only new publish (INSERT or draft→published), NOT restocks
  IF (TG_OP = 'INSERT' AND NEW.status = 'published') OR
     (TG_OP = 'UPDATE' AND OLD.status = 'draft' AND NEW.status = 'published') THEN
    NEW.premium_window_ends_at := NOW() + (window_minutes || ' minutes')::INTERVAL;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. Update set_market_box_premium_window() — vertical-aware + fix regression
-- ============================================================================
CREATE OR REPLACE FUNCTION set_market_box_premium_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  window_minutes INTEGER;
  premium_enabled BOOLEAN;
BEGIN
  -- Check if buyer premium is enabled for this vertical
  SELECT COALESCE((config->>'buyer_premium_enabled')::BOOLEAN, true)
  INTO premium_enabled
  FROM verticals
  WHERE vertical_id = NEW.vertical_id;

  -- If premium is disabled for this vertical, ensure no window is set
  IF NOT COALESCE(premium_enabled, true) THEN
    NEW.premium_window_ends_at := NULL;
    RETURN NEW;
  END IF;

  SELECT COALESCE(value::INTEGER, 120) INTO window_minutes
  FROM platform_settings
  WHERE key = 'premium_window_minutes';

  IF window_minutes IS NULL THEN
    window_minutes := 120;
  END IF;

  -- Only new activation or reactivation, NOT capacity increases
  -- (matches listing trigger fix from migration 009)
  IF (TG_OP = 'INSERT' AND NEW.active = true) OR
     (TG_OP = 'UPDATE' AND (OLD.active = false OR OLD.active IS NULL) AND NEW.active = true) THEN
    NEW.premium_window_ends_at := NOW() + (window_minutes || ' minutes')::INTERVAL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION set_market_box_premium_window IS 'Sets premium_window_ends_at on market box activation. Vertical-aware: skips window for verticals with buyer_premium_enabled=false. Fixed: removed capacity-increase condition (matching listing trigger fix from migration 009).';

-- ============================================================================
-- 3. Add buyer_premium_enabled config to verticals table
-- ============================================================================
UPDATE verticals
SET config = jsonb_set(COALESCE(config, '{}'), '{buyer_premium_enabled}', 'true')
WHERE vertical_id = 'farmers_market';

UPDATE verticals
SET config = jsonb_set(COALESCE(config, '{}'), '{buyer_premium_enabled}', 'false')
WHERE vertical_id = 'food_trucks';

-- Also set for fire_works (disabled by default)
UPDATE verticals
SET config = jsonb_set(COALESCE(config, '{}'), '{buyer_premium_enabled}', 'false')
WHERE vertical_id = 'fire_works';

-- Clear any existing food truck premium windows (shouldn't exist but safety)
UPDATE listings
SET premium_window_ends_at = NULL
WHERE vertical_id = 'food_trucks'
  AND premium_window_ends_at IS NOT NULL;

UPDATE market_box_offerings
SET premium_window_ends_at = NULL
WHERE vertical_id = 'food_trucks'
  AND premium_window_ends_at IS NOT NULL;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
