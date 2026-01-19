-- Migration: Add Performance Indexes
-- Created: 2026-01-19
-- Purpose: Add composite indexes for common query patterns to improve performance

-- ============================================================================
-- LISTINGS INDEXES
-- ============================================================================

-- Index for browse page queries (vertical + status + created_at sorting)
CREATE INDEX IF NOT EXISTS idx_listings_vertical_status_created
  ON listings(vertical_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

-- Index for vendor listings lookup
CREATE INDEX IF NOT EXISTS idx_listings_vendor_created
  ON listings(vendor_profile_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- VENDOR PROFILES INDEXES
-- ============================================================================

-- Index for vendor listing by vertical and status (admin pages, browse)
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_vertical_status
  ON vendor_profiles(vertical_id, status);

-- Index for user's vendor profiles lookup
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_user
  ON vendor_profiles(user_id);

-- ============================================================================
-- ORDERS & TRANSACTIONS INDEXES
-- ============================================================================

-- Index for vendor order queries
CREATE INDEX IF NOT EXISTS idx_order_items_vendor
  ON order_items(vendor_profile_id, created_at DESC);

-- Index for buyer order history
CREATE INDEX IF NOT EXISTS idx_orders_buyer_created
  ON orders(buyer_user_id, created_at DESC);

-- Index for transactions by vendor (analytics)
CREATE INDEX IF NOT EXISTS idx_transactions_vendor_created
  ON transactions(vendor_profile_id, created_at DESC);

-- ============================================================================
-- MARKET BOX INDEXES
-- ============================================================================

-- Index for subscription lookups by offering
CREATE INDEX IF NOT EXISTS idx_market_box_subscriptions_offering_status
  ON market_box_subscriptions(offering_id, status);

-- Index for user's subscriptions
CREATE INDEX IF NOT EXISTS idx_market_box_subscriptions_user
  ON market_box_subscriptions(buyer_user_id, status);

-- ============================================================================
-- MARKETS INDEXES
-- ============================================================================

-- Index for market queries by vertical and status
CREATE INDEX IF NOT EXISTS idx_markets_vertical_status
  ON markets(vertical_id, status);

-- ============================================================================
-- LISTING_MARKETS INDEXES (junction table)
-- ============================================================================

-- Index for finding listings at a market
CREATE INDEX IF NOT EXISTS idx_listing_markets_market
  ON listing_markets(market_id);

-- Note: idx_listing_markets_listing already exists from 20260118_003
