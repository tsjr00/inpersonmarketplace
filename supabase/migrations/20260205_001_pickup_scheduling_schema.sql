-- =====================================================
-- Migration: Pickup Scheduling Schema Enhancement
-- Purpose: Enable buyers to select specific pickup dates
-- Date: 2026-02-05
--
-- CONTEXT:
-- This migration addresses the issue where buyers select a pickup LOCATION
-- but not a specific pickup DATE. Markets can have multiple pickup days
-- (e.g., Tuesday and Thursday), and each day has its own order cutoff.
--
-- CHANGES:
-- 1. cart_items: Add schedule_id, pickup_date columns
-- 2. order_items: Add schedule_id, pickup_date, pickup_snapshot columns
-- 3. orders: Add parent_order_id, order_suffix for split orders
-- 4. Update unique constraint on cart_items to allow same listing for different dates
-- 5. Fix cutoff_hours for private_pickup markets (should be 10, not 18)
--
-- See: docs/Build_Instructions/Pickup_Scheduling_Comprehensive_Plan.md
-- =====================================================

-- =====================================================
-- 1. Cart Items: Add schedule and date selection
-- =====================================================

-- Add schedule_id column (references the recurring pickup slot)
ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES market_schedules(id) ON DELETE SET NULL;

-- Add pickup_date column (the specific date for pickup)
ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS pickup_date DATE;

COMMENT ON COLUMN cart_items.schedule_id IS 'References the specific recurring pickup slot selected by buyer. Can be NULL if schedule deleted while item in cart.';
COMMENT ON COLUMN cart_items.pickup_date IS 'The specific date buyer wants to pick up. Required for new cart items.';

-- Update unique constraint to allow same listing for different pickup dates
-- Old: (cart_id, listing_id) - only one entry per listing
-- New: (cart_id, listing_id, schedule_id, pickup_date) - one entry per listing per pickup date
ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_cart_id_listing_id_key;

CREATE UNIQUE INDEX cart_items_cart_listing_schedule_date_key
  ON cart_items(cart_id, listing_id, schedule_id, pickup_date)
  WHERE schedule_id IS NOT NULL AND pickup_date IS NOT NULL;

-- Keep a constraint for legacy items without schedule (will be cleaned up)
CREATE UNIQUE INDEX cart_items_cart_listing_legacy_key
  ON cart_items(cart_id, listing_id)
  WHERE schedule_id IS NULL;

-- Index for finding cart items by schedule (for cleanup when schedule deactivated)
CREATE INDEX IF NOT EXISTS idx_cart_items_schedule
  ON cart_items(schedule_id)
  WHERE schedule_id IS NOT NULL;

-- =====================================================
-- 2. Order Items: Add schedule, date, and snapshot
-- =====================================================

-- Add schedule_id column (reference, may become NULL if schedule deleted)
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES market_schedules(id) ON DELETE SET NULL;

-- Add pickup_date column (immutable, the promised pickup date)
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS pickup_date DATE;

-- Add pickup_snapshot column (frozen details at checkout)
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS pickup_snapshot JSONB;

COMMENT ON COLUMN order_items.schedule_id IS 'Reference to schedule at time of order. May be NULL if schedule deleted after order placed. Use pickup_snapshot for display.';
COMMENT ON COLUMN order_items.pickup_date IS 'Immutable: The promised pickup date. This is the commitment to the buyer.';
COMMENT ON COLUMN order_items.pickup_snapshot IS 'Immutable: Frozen pickup details at checkout (market name, address, time). Used for display even if schedule/market changes.';

-- Index for vendor order grouping by pickup date
CREATE INDEX IF NOT EXISTS idx_order_items_vendor_pickup
  ON order_items(vendor_profile_id, pickup_date, schedule_id);

-- Index for finding orders by schedule (for deletion check)
CREATE INDEX IF NOT EXISTS idx_order_items_schedule
  ON order_items(schedule_id)
  WHERE schedule_id IS NOT NULL;

-- =====================================================
-- 3. Orders: Add parent linking for split orders
-- =====================================================

-- Add parent_order_id for linking split orders from same checkout
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS parent_order_id UUID REFERENCES orders(id);

-- Add order_suffix for distinguishing split orders (-A, -B, etc.)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_suffix VARCHAR(5);

COMMENT ON COLUMN orders.parent_order_id IS 'Links split orders from same checkout. Orders with same parent came from one buyer purchase.';
COMMENT ON COLUMN orders.order_suffix IS 'Distinguishes split orders: -A, -B, etc. Combined with order_number for display.';

-- Index for finding related orders
CREATE INDEX IF NOT EXISTS idx_orders_parent
  ON orders(parent_order_id)
  WHERE parent_order_id IS NOT NULL;

-- =====================================================
-- 4. Fix cutoff_hours for private_pickup markets
-- =====================================================

-- Private pickup should have 10-hour cutoff, not 18
-- This fixes the original bug that started this investigation
UPDATE markets
SET cutoff_hours = 10
WHERE market_type = 'private_pickup'
  AND (cutoff_hours IS NULL OR cutoff_hours = 18);

-- Ensure traditional markets have correct default
UPDATE markets
SET cutoff_hours = 18
WHERE market_type = 'traditional'
  AND cutoff_hours IS NULL;

-- =====================================================
-- 5. Clear existing cart items (dev environment)
-- These don't have schedule/date info and will cause issues
-- =====================================================

-- In development, clear carts since they don't have the new required fields
-- This is safe because we're in development with test data
DELETE FROM cart_items WHERE schedule_id IS NULL;

-- =====================================================
-- Migration complete
-- =====================================================
