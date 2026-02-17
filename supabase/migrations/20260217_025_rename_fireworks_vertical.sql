-- Migration: Rename fireworks vertical_id from 'fireworks' to 'fire_works'
-- Reason: Avoid URL confusion with food_trucks vertical (/food_truck typo loads fireworks)
--
-- Tables with vertical_id column (verified from SCHEMA_SNAPSHOT.md):
--   verticals (PK), vendor_profiles, listings, orders, market_box_offerings,
--   knowledge_articles, admin_activity_log, error_reports, transactions,
--   shopper_feedback, vendor_feedback, vertical_admins, carts (FK→verticals.id not vertical_id)
--
-- Tables WITHOUT vertical_id: cart_items, order_items, notifications, markets
-- (carts.vertical_id is FK to verticals.id (UUID), not verticals.vertical_id (TEXT))

-- Update the parent verticals table first
UPDATE verticals SET vertical_id = 'fire_works' WHERE vertical_id = 'fireworks';

-- Update all child tables that have TEXT vertical_id FK
UPDATE vendor_profiles SET vertical_id = 'fire_works' WHERE vertical_id = 'fireworks';
UPDATE listings SET vertical_id = 'fire_works' WHERE vertical_id = 'fireworks';
UPDATE orders SET vertical_id = 'fire_works' WHERE vertical_id = 'fireworks';
UPDATE market_box_offerings SET vertical_id = 'fire_works' WHERE vertical_id = 'fireworks';
UPDATE knowledge_articles SET vertical_id = 'fire_works' WHERE vertical_id = 'fireworks';
UPDATE admin_activity_log SET vertical_id = 'fire_works' WHERE vertical_id = 'fireworks';
UPDATE error_reports SET vertical_id = 'fire_works' WHERE vertical_id = 'fireworks';
UPDATE transactions SET vertical_id = 'fire_works' WHERE vertical_id = 'fireworks';
UPDATE shopper_feedback SET vertical_id = 'fire_works' WHERE vertical_id = 'fireworks';
UPDATE vendor_feedback SET vertical_id = 'fire_works' WHERE vertical_id = 'fireworks';
UPDATE vertical_admins SET vertical_id = 'fire_works' WHERE vertical_id = 'fireworks';

-- Update user_profiles.verticals array (TEXT[])
UPDATE user_profiles
SET verticals = array_replace(verticals, 'fireworks', 'fire_works')
WHERE 'fireworks' = ANY(verticals);

-- Note: carts.vertical_id is a UUID FK to verticals.id (not vertical_id text),
-- so it updates automatically when the verticals row is found by id.
-- markets table does not have a vertical_id column (uses vendor relationship).

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

-- Verification query (run after to confirm):
-- SELECT vertical_id FROM verticals ORDER BY vertical_id;
-- Expected: farmers_market, fire_works, food_trucks
