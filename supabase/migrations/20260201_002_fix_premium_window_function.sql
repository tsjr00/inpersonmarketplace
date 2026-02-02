-- Migration: Fix premium window functions - they were using ->>'hours' on a TEXT column
-- The platform_settings.value column is TEXT, not JSONB
-- The setting 'premium_window_minutes' stores minutes as a plain text number

-- Fix the listing premium window function
CREATE OR REPLACE FUNCTION set_listing_premium_window()
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
  -- 1. New listing being published
  -- 2. Status changing from draft to published
  -- 3. Quantity increased (restock)
  IF (TG_OP = 'INSERT' AND NEW.status = 'published') OR
     (TG_OP = 'UPDATE' AND OLD.status = 'draft' AND NEW.status = 'published') OR
     (TG_OP = 'UPDATE' AND NEW.status = 'published' AND NEW.quantity > COALESCE(OLD.quantity, 0)) THEN
    NEW.premium_window_ends_at := NOW() + (window_minutes || ' minutes')::INTERVAL;
  END IF;

  RETURN NEW;
END;
$$;

-- Fix the market box premium window function
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
  -- 1. New offering being published (is_active = true)
  -- 2. Status changing to active
  -- 3. Max subscribers increased (restock)
  IF (TG_OP = 'INSERT' AND NEW.is_active = true) OR
     (TG_OP = 'UPDATE' AND (OLD.is_active = false OR OLD.is_active IS NULL) AND NEW.is_active = true) OR
     (TG_OP = 'UPDATE' AND NEW.is_active = true AND NEW.max_subscribers > COALESCE(OLD.max_subscribers, 0)) THEN
    NEW.premium_window_ends_at := NOW() + (window_minutes || ' minutes')::INTERVAL;
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure premium_window_minutes setting exists
INSERT INTO platform_settings (key, value, description)
VALUES ('premium_window_minutes', '120', 'Duration in minutes for premium early-bird window on new listings and restocks')
ON CONFLICT (key) DO NOTHING;

-- Comment
COMMENT ON FUNCTION set_listing_premium_window IS 'Sets premium_window_ends_at on listing publish or restock. Uses platform_settings premium_window_minutes (TEXT, default 120).';
COMMENT ON FUNCTION set_market_box_premium_window IS 'Sets premium_window_ends_at on market box activation or capacity increase. Uses platform_settings premium_window_minutes (TEXT, default 120).';
