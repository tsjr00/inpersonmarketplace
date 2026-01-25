-- Migration: Add market_id to order_items for tracking pickup locations
-- Purpose: Track which market/location each order item will be picked up from

-- Add market_id column to order_items
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS market_id UUID REFERENCES markets(id) ON DELETE SET NULL;

COMMENT ON COLUMN order_items.market_id IS 'The market/location where buyer will pick up this item';

-- Create index for market_id lookups
CREATE INDEX IF NOT EXISTS idx_order_items_market ON order_items(market_id);
