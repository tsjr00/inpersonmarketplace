-- Migration: Add market_id to cart_items for pickup location selection
-- Purpose: Buyers must select which market/location they want to pick up each item from

-- Add market_id column to cart_items (nullable for backwards compatibility with existing carts)
ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS market_id UUID REFERENCES markets(id) ON DELETE SET NULL;

COMMENT ON COLUMN cart_items.market_id IS 'The market/location where buyer will pick up this item';

-- Create index for market_id lookups
CREATE INDEX IF NOT EXISTS idx_cart_items_market ON cart_items(market_id);

-- Function to validate cart item market selection
-- Ensures the selected market is valid for the listing
CREATE OR REPLACE FUNCTION validate_cart_item_market(
  p_listing_id UUID,
  p_market_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the listing is available at this market
  RETURN EXISTS (
    SELECT 1 FROM listing_markets lm
    WHERE lm.listing_id = p_listing_id
      AND lm.market_id = p_market_id
  );
END;
$$;

COMMENT ON FUNCTION validate_cart_item_market IS 'Returns true if the listing is available at the specified market';

-- Function to get open markets for a listing (markets still accepting orders)
CREATE OR REPLACE FUNCTION get_listing_open_markets(p_listing_id UUID)
RETURNS TABLE (
  market_id UUID,
  market_name TEXT,
  market_type TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  is_accepting BOOLEAN,
  next_pickup_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id as market_id,
    m.name as market_name,
    m.market_type,
    m.address,
    m.city,
    m.state,
    -- Check if market is accepting orders (using existing cutoff logic)
    CASE
      WHEN m.market_type = 'traditional' THEN
        -- Traditional: check next market day with cutoff
        EXISTS (
          SELECT 1 FROM market_schedules ms
          WHERE ms.market_id = m.id
            AND ms.active = true
            AND (
              -- Calculate next occurrence of this schedule
              NOW() + INTERVAL '1 hour' * COALESCE(m.cutoff_hours, 18) <
              (DATE_TRUNC('week', NOW()) + (ms.day_of_week || ' days')::INTERVAL + ms.start_time::INTERVAL)
              OR
              NOW() + INTERVAL '1 hour' * COALESCE(m.cutoff_hours, 18) <
              (DATE_TRUNC('week', NOW()) + INTERVAL '7 days' + (ms.day_of_week || ' days')::INTERVAL + ms.start_time::INTERVAL)
            )
        )
      WHEN m.market_type = 'private_pickup' THEN
        -- Private pickup: check next schedule with cutoff
        EXISTS (
          SELECT 1 FROM market_schedules ms
          WHERE ms.market_id = m.id
            AND ms.active = true
            AND (
              NOW() + INTERVAL '1 hour' * COALESCE(m.cutoff_hours, 10) <
              (DATE_TRUNC('week', NOW()) + (ms.day_of_week || ' days')::INTERVAL + ms.start_time::INTERVAL)
              OR
              NOW() + INTERVAL '1 hour' * COALESCE(m.cutoff_hours, 10) <
              (DATE_TRUNC('week', NOW()) + INTERVAL '7 days' + (ms.day_of_week || ' days')::INTERVAL + ms.start_time::INTERVAL)
            )
        )
      ELSE true
    END as is_accepting,
    -- Get next pickup datetime
    (
      SELECT MIN(
        CASE
          WHEN DATE_TRUNC('week', NOW()) + (ms.day_of_week || ' days')::INTERVAL + ms.start_time::INTERVAL > NOW()
          THEN DATE_TRUNC('week', NOW()) + (ms.day_of_week || ' days')::INTERVAL + ms.start_time::INTERVAL
          ELSE DATE_TRUNC('week', NOW()) + INTERVAL '7 days' + (ms.day_of_week || ' days')::INTERVAL + ms.start_time::INTERVAL
        END
      )
      FROM market_schedules ms
      WHERE ms.market_id = m.id AND ms.active = true
    ) as next_pickup_at
  FROM markets m
  JOIN listing_markets lm ON lm.market_id = m.id
  WHERE lm.listing_id = p_listing_id
    AND m.active = true
  ORDER BY
    -- Open markets first
    CASE WHEN m.market_type = 'traditional' THEN
      EXISTS (
        SELECT 1 FROM market_schedules ms
        WHERE ms.market_id = m.id AND ms.active = true
      )
    ELSE true END DESC,
    m.name;
END;
$$;

COMMENT ON FUNCTION get_listing_open_markets IS 'Returns all markets where a listing is available, with accepting status';
