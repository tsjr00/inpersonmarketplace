-- Migration 045: Add small order fee column + vertical config
-- Instead of blocking orders below minimum, charge a $0.50 small order fee

-- Add column to orders table
ALTER TABLE orders ADD COLUMN small_order_fee_cents INTEGER NOT NULL DEFAULT 0;

-- Add small order fee config to each vertical's config JSONB
UPDATE verticals
SET config = config || '{"small_order_fee_threshold_cents": 500, "small_order_fee_cents": 50}'::jsonb
WHERE vertical_id IN ('farmers_market', 'food_trucks', 'fire_works');

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
