-- Migration 044: Add minimum_order_cents to vertical config
-- Each vertical gets its own minimum order threshold
-- These values are read by getMinimumOrderCents() in pricing.ts with hardcoded fallbacks

UPDATE verticals SET config = config || '{"minimum_order_cents": 1000}'::jsonb
WHERE vertical_id = 'farmers_market';

UPDATE verticals SET config = config || '{"minimum_order_cents": 500}'::jsonb
WHERE vertical_id = 'food_trucks';

UPDATE verticals SET config = config || '{"minimum_order_cents": 4000}'::jsonb
WHERE vertical_id = 'fire_works';
