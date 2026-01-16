-- ============================================================================
-- Migration: Order Expiration Support
-- Created: 2026-01-16
-- Purpose: Add expiration tracking to order_items based on pickup date
-- ============================================================================

-- Add pickup_date field to order_items (set at checkout based on market schedule)
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS pickup_date DATE;

COMMENT ON COLUMN order_items.pickup_date IS 'Expected pickup date at market';

-- Add market_id field to order_items if not exists (for pickup location)
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS market_id UUID REFERENCES markets(id);

COMMENT ON COLUMN order_items.market_id IS 'Market where item will be picked up';

-- Add expiration field to order_items
-- expires_at is calculated as pickup_date minus a buffer (default 18 hours)
-- This gives vendors until the evening before market day to confirm
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

COMMENT ON COLUMN order_items.expires_at IS 'When this item expires if not confirmed. Calculated from pickup_date minus buffer hours.';

-- Create index for querying items that need expiration
CREATE INDEX IF NOT EXISTS idx_order_items_expires_at
  ON order_items(expires_at)
  WHERE expires_at IS NOT NULL
    AND status = 'pending'
    AND cancelled_at IS NULL;

-- Function to calculate expiration from pickup date
-- Default: 18 hours before pickup (e.g., if pickup is Saturday 8am, expires Friday 2pm)
CREATE OR REPLACE FUNCTION calculate_order_item_expiration(
  p_pickup_date DATE,
  p_buffer_hours INTEGER DEFAULT 18
) RETURNS TIMESTAMPTZ AS $$
BEGIN
  IF p_pickup_date IS NULL THEN
    -- No pickup date, expire 7 days from now as fallback
    RETURN NOW() + INTERVAL '7 days';
  END IF;

  -- Assume pickup is at start of day (8am), subtract buffer hours
  RETURN (p_pickup_date + TIME '08:00:00') - (p_buffer_hours || ' hours')::INTERVAL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger to auto-set expires_at when order_item is created or pickup_date changes
CREATE OR REPLACE FUNCTION set_order_item_expiration()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set expiration if not already set and item is in initial state
  IF NEW.expires_at IS NULL AND NEW.status = 'pending' THEN
    NEW.expires_at := calculate_order_item_expiration(NEW.pickup_date);
  END IF;

  -- If pickup_date changed, recalculate expiration (unless already confirmed)
  IF TG_OP = 'UPDATE'
     AND OLD.pickup_date IS DISTINCT FROM NEW.pickup_date
     AND NEW.status = 'pending' THEN
    NEW.expires_at := calculate_order_item_expiration(NEW.pickup_date);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_set_order_item_expiration ON order_items;
CREATE TRIGGER trigger_set_order_item_expiration
  BEFORE INSERT OR UPDATE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION set_order_item_expiration();

-- Update existing order_items that don't have expiration set
UPDATE order_items
SET expires_at = calculate_order_item_expiration(pickup_date)
WHERE expires_at IS NULL
  AND status = 'pending'
  AND cancelled_at IS NULL;

-- ============================================================================
-- END MIGRATION
-- ============================================================================
