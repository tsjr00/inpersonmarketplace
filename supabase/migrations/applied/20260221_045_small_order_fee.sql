-- Migration 045: Small order fee vertical config
-- Column (orders.small_order_fee_cents) already added by migration 053.
-- This adds the fee config to verticals.config JSONB for data parity.

UPDATE verticals
SET config = config || '{"small_order_fee_threshold_cents": 500, "small_order_fee_cents": 50}'::jsonb
WHERE vertical_id IN ('farmers_market', 'food_trucks', 'fire_works');
