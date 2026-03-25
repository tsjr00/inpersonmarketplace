-- Migration 037: Support market box per-pickup vendor payouts
-- F2 FIX: vendor_payouts.order_item_id is NOT NULL, preventing market box
-- per-pickup payout tracking (market box pickups are not order_items)

-- Make order_item_id nullable (all existing rows have it set)
ALTER TABLE vendor_payouts
  ALTER COLUMN order_item_id DROP NOT NULL;

-- Add market box pickup reference
ALTER TABLE vendor_payouts
  ADD COLUMN market_box_pickup_id UUID REFERENCES market_box_pickups(id);

-- Ensure at least one reference exists
ALTER TABLE vendor_payouts
  ADD CONSTRAINT vendor_payouts_has_reference
  CHECK (order_item_id IS NOT NULL OR market_box_pickup_id IS NOT NULL);

-- Index for market box payout lookups
CREATE INDEX idx_payouts_market_box_pickup
  ON vendor_payouts(market_box_pickup_id)
  WHERE market_box_pickup_id IS NOT NULL;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
