-- Migration 041: Add tip_on_platform_fee_cents to orders
-- Tracks the portion of a tip that's attributable to the buyer platform fee.
-- Vendor tip = tip_amount - tip_on_platform_fee_cents
-- This column allows the platform to separately account for tip revenue
-- that comes from the fee markup rather than the base food price.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tip_on_platform_fee_cents INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN orders.tip_on_platform_fee_cents IS
  'Portion of tip attributable to buyer platform fee. Vendor tip = tip_amount - tip_on_platform_fee_cents.';

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
