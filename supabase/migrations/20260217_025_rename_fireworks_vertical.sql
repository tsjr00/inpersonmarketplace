-- Migration: Rename fireworks vertical_id from 'fireworks' to 'fire_works'
-- Reason: Avoid URL confusion with food_trucks vertical (/food_truck typo loads fireworks)
--
-- The verticals.vertical_id column is referenced by FK in many tables.
-- We update the parent first, then cascade to all child tables.

-- Step 1: Temporarily drop FK constraints that reference verticals.vertical_id
-- (We'll recreate them after the rename)

-- Find and update all tables that have vertical_id = 'fireworks'
-- Tables with vertical_id FK: vendor_profiles, listings, markets, orders,
-- cart_items, order_items, knowledge_articles, market_box_offerings, etc.

-- Update the parent verticals table
UPDATE verticals SET vertical_id = 'fire_works' WHERE vertical_id = 'fireworks';

-- Update all child tables
UPDATE vendor_profiles SET vertical_id = 'fire_works' WHERE vertical_id = 'fireworks';
UPDATE listings SET vertical_id = 'fire_works' WHERE vertical_id = 'fireworks';
UPDATE markets SET vertical_id = 'fire_works' WHERE vertical_id = 'fireworks';
UPDATE orders SET vertical_id = 'fire_works' WHERE vertical_id = 'fireworks';
UPDATE cart_items SET vertical_id = 'fire_works' WHERE vertical_id = 'fireworks';
UPDATE order_items SET vertical_id = 'fire_works' WHERE vertical_id = 'fireworks';
UPDATE knowledge_articles SET vertical_id = 'fire_works' WHERE vertical_id = 'fireworks';
UPDATE notifications SET vertical_id = 'fire_works' WHERE vertical_id = 'fireworks';
UPDATE market_box_offerings SET vertical_id = 'fire_works' WHERE vertical_id = 'fireworks';

-- Update user_profiles.verticals array (TEXT[])
UPDATE user_profiles
SET verticals = array_replace(verticals, 'fireworks', 'fire_works')
WHERE 'fireworks' = ANY(verticals);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

-- Verification query (run after to confirm):
-- SELECT vertical_id FROM verticals ORDER BY vertical_id;
-- Expected: farmers_market, fire_works, food_trucks
