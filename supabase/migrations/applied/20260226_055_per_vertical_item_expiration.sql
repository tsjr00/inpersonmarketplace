-- ============================================================================
-- Migration: Per-Vertical Item Expiration
-- Created: 2026-02-26
-- Purpose: Make order item expiration per-vertical:
--   FT (food_trucks): 24 hours from order creation
--   FM (farmers_market): 24 hours after start of pickup window
--   Default: 24 hours after pickup window start (FM behavior)
-- ============================================================================

-- Update the calculation function to accept vertical and order creation time
-- Replaces the old single-formula approach (pickup_date at 8am minus 18hr buffer)
CREATE OR REPLACE FUNCTION calculate_order_item_expiration(
  p_pickup_date DATE,
  p_vertical_id TEXT DEFAULT NULL,
  p_created_at TIMESTAMPTZ DEFAULT NOW()
) RETURNS TIMESTAMPTZ AS $$
BEGIN
  -- FT: 24 hours from order creation (vendor must accept quickly)
  IF p_vertical_id = 'food_trucks' THEN
    RETURN p_created_at + INTERVAL '24 hours';
  END IF;

  -- FM and all others: 24 hours after start of pickup window
  -- Pickup window assumed to start at 8am on pickup_date
  IF p_pickup_date IS NOT NULL THEN
    RETURN (p_pickup_date + TIME '08:00:00') + INTERVAL '24 hours';
  END IF;

  -- No pickup date fallback: 7 days from now
  RETURN NOW() + INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

-- Update the trigger function to look up vertical from orders table
CREATE OR REPLACE FUNCTION set_order_item_expiration()
RETURNS TRIGGER AS $$
DECLARE
  v_vertical_id TEXT;
  v_created_at TIMESTAMPTZ;
BEGIN
  -- Only set expiration if not already set and item is in initial state
  IF NEW.expires_at IS NULL AND NEW.status = 'pending' THEN
    -- Look up vertical and creation time from the parent order
    SELECT o.vertical_id, o.created_at
      INTO v_vertical_id, v_created_at
      FROM orders o
      WHERE o.id = NEW.order_id;

    NEW.expires_at := calculate_order_item_expiration(NEW.pickup_date, v_vertical_id, v_created_at);
  END IF;

  -- If pickup_date changed, recalculate expiration (unless already confirmed)
  IF TG_OP = 'UPDATE'
     AND OLD.pickup_date IS DISTINCT FROM NEW.pickup_date
     AND NEW.status = 'pending' THEN
    SELECT o.vertical_id, o.created_at
      INTO v_vertical_id, v_created_at
      FROM orders o
      WHERE o.id = NEW.order_id;

    NEW.expires_at := calculate_order_item_expiration(NEW.pickup_date, v_vertical_id, v_created_at);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger already exists from migration 005, no need to recreate
-- DROP TRIGGER IF EXISTS trigger_set_order_item_expiration ON order_items;
-- CREATE TRIGGER trigger_set_order_item_expiration
--   BEFORE INSERT OR UPDATE ON order_items
--   FOR EACH ROW
--   EXECUTE FUNCTION set_order_item_expiration();

-- ============================================================================
-- END MIGRATION
-- ============================================================================
