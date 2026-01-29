-- Migration: Add premium window for early access
-- Premium buyers get early access to new listings and restocks

-- Add premium_window_ends_at to listings
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS premium_window_ends_at TIMESTAMPTZ DEFAULT NULL;

-- Add premium_window_ends_at to market_box_offerings
ALTER TABLE market_box_offerings
  ADD COLUMN IF NOT EXISTS premium_window_ends_at TIMESTAMPTZ DEFAULT NULL;

-- Index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_listings_premium_window
  ON listings(premium_window_ends_at)
  WHERE premium_window_ends_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_market_box_premium_window
  ON market_box_offerings(premium_window_ends_at)
  WHERE premium_window_ends_at IS NOT NULL;

-- Platform settings table (if not exists)
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default premium window duration (2 hours = 120 minutes)
INSERT INTO platform_settings (key, value, description)
VALUES ('premium_window_minutes', '120', 'Duration in minutes for premium early-bird window on new listings and restocks')
ON CONFLICT (key) DO NOTHING;

-- Comments
COMMENT ON COLUMN listings.premium_window_ends_at IS 'When the premium early-bird window ends. NULL means no active window.';
COMMENT ON COLUMN market_box_offerings.premium_window_ends_at IS 'When the premium early-bird window ends. NULL means no active window.';

-- Function to set premium window on listings
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
$$ LANGUAGE plpgsql;

-- Trigger for listings
DROP TRIGGER IF EXISTS trigger_listing_premium_window ON listings;
CREATE TRIGGER trigger_listing_premium_window
  BEFORE INSERT OR UPDATE ON listings
  FOR EACH ROW
  EXECUTE FUNCTION set_listing_premium_window();

-- Function to set premium window on market box offerings
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
$$ LANGUAGE plpgsql;

-- Trigger for market box offerings
DROP TRIGGER IF EXISTS trigger_market_box_premium_window ON market_box_offerings;
CREATE TRIGGER trigger_market_box_premium_window
  BEFORE INSERT OR UPDATE ON market_box_offerings
  FOR EACH ROW
  EXECUTE FUNCTION set_market_box_premium_window();
