-- Migration: Add flag for whether vendor sells at the market they're referring
-- Date: 2026-01-22
-- Purpose: Allow vendors to refer markets they don't sell at (leads for platform growth)

-- ============================================
-- Add column to track if vendor sells at this market
-- ============================================

ALTER TABLE markets
ADD COLUMN IF NOT EXISTS vendor_sells_at_market BOOLEAN DEFAULT TRUE;

-- ============================================
-- Comments
-- ============================================
COMMENT ON COLUMN markets.vendor_sells_at_market IS
    'For vendor-submitted markets: TRUE if vendor sells at this market, FALSE if just a referral/lead';
