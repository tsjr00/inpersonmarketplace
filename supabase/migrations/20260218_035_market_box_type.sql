-- Migration 035: Add box_type column to market_box_offerings
-- Purpose: Food truck "Chef Boxes" need a category type (weekly_dinner, family_kit, etc.)
-- FM offerings leave this null; FT form requires it client-side + API validates for FT vendors.

ALTER TABLE market_box_offerings ADD COLUMN box_type TEXT;

NOTIFY pgrst, 'reload schema';
