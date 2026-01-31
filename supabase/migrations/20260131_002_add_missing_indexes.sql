-- Migration: Add Missing Performance Indexes
-- Created: 2026-01-31
-- Description: Add indexes identified in security/efficiency audit for query performance
--
-- Issue: ERR_PERF_002 - Missing indexes on frequently queried columns
--        causing full table scans on common operations

-- =============================================================================
-- 1. User Profiles - user_id lookup
-- =============================================================================
-- Used in: Authentication flows, profile lookups, admin verification
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id
ON user_profiles(user_id);

-- =============================================================================
-- 2. Market Schedules - composite index for market/active/day queries
-- =============================================================================
-- Used in: Market schedule displays, availability checks
CREATE INDEX IF NOT EXISTS idx_market_schedules_market_active
ON market_schedules(market_id, active, day_of_week);

-- =============================================================================
-- 3. Market Box Offerings - vendor active lookup
-- =============================================================================
-- Used in: Vendor dashboard, market box displays, availability filtering
CREATE INDEX IF NOT EXISTS idx_market_box_offerings_vendor_active
ON market_box_offerings(vendor_profile_id, active);

-- =============================================================================
-- 4. Additional high-impact indexes based on common query patterns
-- =============================================================================

-- Listings by vendor and status (vendor dashboard queries)
CREATE INDEX IF NOT EXISTS idx_listings_vendor_status
ON listings(vendor_profile_id, status)
WHERE deleted_at IS NULL;

-- Orders by buyer (order history queries)
CREATE INDEX IF NOT EXISTS idx_orders_buyer_created
ON orders(buyer_user_id, created_at DESC);

-- Order items by order (order detail queries)
CREATE INDEX IF NOT EXISTS idx_order_items_order
ON order_items(order_id);

-- Vendor profiles by vertical and status (admin/browse queries)
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_vertical_status
ON vendor_profiles(vertical_id, status);

-- Market vendors by market and approval status (market detail queries)
CREATE INDEX IF NOT EXISTS idx_market_vendors_market_approved
ON market_vendors(market_id, approved);

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- To verify indexes were created, run:
-- SELECT indexname, tablename FROM pg_indexes
-- WHERE indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;
