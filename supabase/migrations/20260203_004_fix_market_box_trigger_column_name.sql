-- Migration: Fix market box premium window trigger column name
-- Created: 2026-02-03
-- Purpose: The trigger references 'is_active' but the column is named 'active'
--
-- Error: "record 'new' has no field 'is_active'"
-- Root cause: set_market_box_premium_window() uses NEW.is_active / OLD.is_active
--             but market_box_offerings table uses 'active' not 'is_active'
--
-- Related: error_resolutions ERR_MBOX_001

-- Fix the market box premium window function to use correct column name
CREATE OR REPLACE FUNCTION set_market_box_premium_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  window_minutes INTEGER;
BEGIN
  -- Get window minutes from platform_settings (default 120 if not set)
  -- Note: value column is TEXT, not JSONB, so we just cast directly
  SELECT COALESCE(value::INTEGER, 120) INTO window_minutes
  FROM platform_settings
  WHERE key = 'premium_window_minutes';

  IF window_minutes IS NULL THEN
    window_minutes := 120;
  END IF;

  -- Set premium window if:
  -- 1. New offering being published (active = true)
  -- 2. Status changing to active
  -- 3. Max subscribers increased (capacity increase)
  -- NOTE: Column is 'active', NOT 'is_active'
  IF (TG_OP = 'INSERT' AND NEW.active = true) OR
     (TG_OP = 'UPDATE' AND (OLD.active = false OR OLD.active IS NULL) AND NEW.active = true) OR
     (TG_OP = 'UPDATE' AND NEW.active = true AND NEW.max_subscribers > COALESCE(OLD.max_subscribers, 0)) THEN
    NEW.premium_window_ends_at := NOW() + (window_minutes || ' minutes')::INTERVAL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION set_market_box_premium_window IS 'Sets premium_window_ends_at on market box activation or capacity increase. Uses platform_settings premium_window_minutes (TEXT, default 120). Fixed: uses active column (not is_active).';

-- ============================================================================
-- END MIGRATION
-- ============================================================================
