-- Migration: Create listing_markets junction table
-- Purpose: Support many-to-many relationship between listings and markets
-- A listing can be available at multiple markets (for premium vendors)
-- Created: 2026-01-18

-- ============================================================================
-- LISTING_MARKETS JUNCTION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS listing_markets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(listing_id, market_id)
);

COMMENT ON TABLE listing_markets IS 'Junction table linking listings to markets (many-to-many)';
COMMENT ON COLUMN listing_markets.listing_id IS 'References listings(id)';
COMMENT ON COLUMN listing_markets.market_id IS 'References markets(id)';

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_listing_markets_listing ON listing_markets(listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_markets_market ON listing_markets(market_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE listing_markets ENABLE ROW LEVEL SECURITY;

-- Public can view listing_markets for published listings
CREATE POLICY "listing_markets_select_published" ON listing_markets
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM listings
            WHERE id = listing_id AND status = 'published' AND deleted_at IS NULL
        )
    );

-- Vendors can manage their own listing_markets
CREATE POLICY "listing_markets_vendor_manage" ON listing_markets
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM listings l
            JOIN vendor_profiles vp ON l.vendor_profile_id = vp.id
            WHERE l.id = listing_id AND vp.user_id = auth.uid()
        )
    );

-- Admins can manage all listing_markets
CREATE POLICY "listing_markets_admin_all" ON listing_markets
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid()
            AND (role = 'admin' OR 'admin' = ANY(roles))
        )
    );

-- ============================================================================
-- MIGRATE EXISTING DATA
-- ============================================================================

-- Populate listing_markets from existing listings.market_id
INSERT INTO listing_markets (listing_id, market_id)
SELECT id, market_id FROM listings
WHERE market_id IS NOT NULL
ON CONFLICT (listing_id, market_id) DO NOTHING;
