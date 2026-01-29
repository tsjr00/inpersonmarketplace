-- Migration: Remove restock from premium window trigger
-- Only NEW listings get the premium window, not restocks of existing listings

-- Updated function for listings - only new publish, not restocks
CREATE OR REPLACE FUNCTION set_listing_premium_window()
RETURNS TRIGGER AS $$
DECLARE
  window_minutes INTEGER;
BEGIN
  -- Get window duration from platform settings (default 120 minutes)
  SELECT COALESCE(value::INTEGER, 120) INTO window_minutes
  FROM platform_settings
  WHERE key = 'premium_window_minutes';

  IF window_minutes IS NULL THEN
    window_minutes := 120;
  END IF;

  -- Set premium window ONLY for new listings being published
  -- (not restocks - those should remain visible with existing inventory)
  IF (TG_OP = 'INSERT' AND NEW.status = 'published') OR
     (TG_OP = 'UPDATE' AND OLD.status = 'draft' AND NEW.status = 'published') THEN
    NEW.premium_window_ends_at := NOW() + (window_minutes || ' minutes')::INTERVAL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Updated function for market box offerings - only new activation, not capacity increases
CREATE OR REPLACE FUNCTION set_market_box_premium_window()
RETURNS TRIGGER AS $$
DECLARE
  window_minutes INTEGER;
BEGIN
  -- Get window duration from platform settings (default 120 minutes)
  SELECT COALESCE(value::INTEGER, 120) INTO window_minutes
  FROM platform_settings
  WHERE key = 'premium_window_minutes';

  IF window_minutes IS NULL THEN
    window_minutes := 120;
  END IF;

  -- Set premium window ONLY for new offerings being activated
  -- (not capacity increases - those should remain visible)
  IF (TG_OP = 'INSERT' AND NEW.is_active = true) OR
     (TG_OP = 'UPDATE' AND (OLD.is_active = false OR OLD.is_active IS NULL) AND NEW.is_active = true) THEN
    NEW.premium_window_ends_at := NOW() + (window_minutes || ' minutes')::INTERVAL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update description in platform_settings
UPDATE platform_settings
SET description = 'Duration in minutes for premium early-bird window on new listings'
WHERE key = 'premium_window_minutes';
