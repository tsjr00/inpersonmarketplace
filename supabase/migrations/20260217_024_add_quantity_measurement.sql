-- Migration: Add quantity/measurement fields to listings and market_box_offerings
-- Purpose: Mandatory size/amount disclosure for buyer trust and transparency
-- Applies to: Both farmers_market and food_trucks verticals
--
-- Rules:
--   - quantity_amount + quantity_unit are REQUIRED for publishing (CHECK constraint)
--   - Existing published listings are NOT affected (grace approach)
--   - Vendors must add quantity when they next edit a listing
--   - Draft/paused listings can be saved without quantity

-- ============================================================================
-- STEP 1: Add columns to listings
-- ============================================================================

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS quantity_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS quantity_unit TEXT;

COMMENT ON COLUMN listings.quantity_amount IS 'Size/amount of the item (e.g., 1, 5, 12). Required for publishing.';
COMMENT ON COLUMN listings.quantity_unit IS 'Unit of measurement (e.g., lb, oz, dozen, pack, feeds). Required for publishing.';

-- ============================================================================
-- STEP 2: Add columns to market_box_offerings (Chef Boxes)
-- ============================================================================

ALTER TABLE market_box_offerings
  ADD COLUMN IF NOT EXISTS quantity_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS quantity_unit TEXT;

COMMENT ON COLUMN market_box_offerings.quantity_amount IS 'Size/amount of the offering (e.g., feeds 4, 5 lbs). Required for active offerings.';
COMMENT ON COLUMN market_box_offerings.quantity_unit IS 'Unit of measurement (e.g., lb, oz, feeds, serving).';

-- ============================================================================
-- STEP 3: CHECK constraint — listings must have quantity to be published
-- New listings cannot be published without quantity_amount and quantity_unit.
-- Existing published listings are grandfathered (constraint only applies to
-- future INSERT/UPDATE operations that set status = 'published').
-- ============================================================================

-- First, mark existing published listings so the constraint doesn't block them.
-- We add the constraint as a NOT VALID constraint, then validate only new rows.
ALTER TABLE listings
  ADD CONSTRAINT listings_quantity_required_for_publish
  CHECK (
    status != 'published'
    OR (quantity_amount IS NOT NULL AND quantity_unit IS NOT NULL)
  )
  NOT VALID;

-- Note: NOT VALID means existing rows are not checked, but all new
-- INSERT/UPDATE operations must satisfy the constraint. This implements
-- the "grace approach" — existing published listings stay published,
-- but any edit that touches the row must include quantity to remain published.

-- ============================================================================
-- STEP 4: Indexes for potential future filtering/sorting by unit
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_listings_quantity_unit
  ON listings(quantity_unit)
  WHERE quantity_unit IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_market_box_offerings_quantity_unit
  ON market_box_offerings(quantity_unit)
  WHERE quantity_unit IS NOT NULL;

-- ============================================================================
-- STEP 5: Reload PostgREST schema cache
-- ============================================================================

NOTIFY pgrst, 'reload schema';
