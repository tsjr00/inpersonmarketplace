-- Add grace period tracking to orders for cancellation fee logic
-- Grace period = 1 hour from when order is paid

ALTER TABLE orders ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ;

-- Add cancellation fee tracking to order_items (some columns may already exist)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cancellation_fee_cents INTEGER DEFAULT 0;

-- Backfill grace_period_ends_at for existing paid orders (1 hour after created_at)
UPDATE orders
SET grace_period_ends_at = created_at + INTERVAL '1 hour'
WHERE status != 'pending' AND grace_period_ends_at IS NULL;

-- Index for querying orders within grace period
CREATE INDEX IF NOT EXISTS idx_orders_grace_period ON orders(grace_period_ends_at)
WHERE grace_period_ends_at IS NOT NULL;
