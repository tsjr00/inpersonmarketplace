-- Migration: Add market_id to listings
-- Phase: Phase-K-1-Markets-Foundation
-- Created: 2026-01-14
-- Purpose: Add optional market association to listings for pre-sales feature

-- ============================================================================
-- ADD MARKET_ID COLUMN TO LISTINGS
-- ============================================================================

-- Add optional market association
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS market_id UUID REFERENCES markets(id) ON DELETE SET NULL;

COMMENT ON COLUMN listings.market_id IS 'Optional association to a market for pre-sales';

-- ============================================================================
-- INDEX
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_listings_market ON listings(market_id) WHERE market_id IS NOT NULL;
