-- Migration: Markets Foundation Tables
-- Phase: Phase-K-1-Markets-Foundation
-- Created: 2026-01-14
-- Purpose: Create tables for markets functionality supporting traditional farmers markets
--          and private pickup locations

-- ============================================================================
-- MARKETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS markets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vertical_id TEXT NOT NULL REFERENCES verticals(vertical_id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('traditional', 'private_pickup')),
    description TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE markets IS 'Farmers markets and private pickup locations';
COMMENT ON COLUMN markets.type IS 'traditional = fixed schedule markets, private_pickup = flexible timing';
COMMENT ON COLUMN markets.vertical_id IS 'References verticals(vertical_id)';

-- ============================================================================
-- MARKET SCHEDULES TABLE (for traditional markets)
-- ============================================================================

CREATE TABLE IF NOT EXISTS market_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE market_schedules IS 'Operating schedules for traditional markets';
COMMENT ON COLUMN market_schedules.day_of_week IS '0=Sunday, 1=Monday, ..., 6=Saturday';

-- ============================================================================
-- MARKET VENDORS TABLE (junction table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS market_vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
    approved BOOLEAN DEFAULT false,
    booth_number TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(market_id, vendor_profile_id)
);

COMMENT ON TABLE market_vendors IS 'Vendor participation in markets';
COMMENT ON COLUMN market_vendors.approved IS 'Admin must approve vendor for market';
COMMENT ON COLUMN market_vendors.booth_number IS 'Assigned booth/stall number';

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_markets_vertical ON markets(vertical_id);
CREATE INDEX IF NOT EXISTS idx_markets_active ON markets(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_markets_type ON markets(type);
CREATE INDEX IF NOT EXISTS idx_markets_city ON markets(city);

CREATE INDEX IF NOT EXISTS idx_market_schedules_market ON market_schedules(market_id);
CREATE INDEX IF NOT EXISTS idx_market_schedules_day ON market_schedules(day_of_week);

CREATE INDEX IF NOT EXISTS idx_market_vendors_market ON market_vendors(market_id);
CREATE INDEX IF NOT EXISTS idx_market_vendors_vendor ON market_vendors(vendor_profile_id);
CREATE INDEX IF NOT EXISTS idx_market_vendors_approved ON market_vendors(approved) WHERE approved = true;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_vendors ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Markets RLS Policies
-- -----------------------------------------------------------------------------

-- Public can view active markets
CREATE POLICY "Markets viewable by all"
    ON markets FOR SELECT
    USING (active = true);

-- Admins can manage all markets
CREATE POLICY "Markets manageable by admins"
    ON markets FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid()
            AND (role = 'admin' OR 'admin' = ANY(roles))
        )
    );

-- -----------------------------------------------------------------------------
-- Market Schedules RLS Policies
-- -----------------------------------------------------------------------------

-- Public can view schedules for active markets
CREATE POLICY "Schedules viewable with active market"
    ON market_schedules FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM markets
            WHERE id = market_id AND active = true
        )
    );

-- Admins can manage schedules
CREATE POLICY "Schedules manageable by admins"
    ON market_schedules FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid()
            AND (role = 'admin' OR 'admin' = ANY(roles))
        )
    );

-- -----------------------------------------------------------------------------
-- Market Vendors RLS Policies
-- -----------------------------------------------------------------------------

-- Vendors can view their own market associations
CREATE POLICY "Vendors view their markets"
    ON market_vendors FOR SELECT
    USING (
        vendor_profile_id IN (
            SELECT id FROM vendor_profiles
            WHERE user_id = (SELECT id FROM user_profiles WHERE user_id = auth.uid())
        )
    );

-- Vendors can apply to markets (insert only, unapproved)
CREATE POLICY "Vendors can apply to markets"
    ON market_vendors FOR INSERT
    WITH CHECK (
        approved = false
        AND vendor_profile_id IN (
            SELECT id FROM vendor_profiles
            WHERE user_id = (SELECT id FROM user_profiles WHERE user_id = auth.uid())
        )
    );

-- Admins can view all market vendors
CREATE POLICY "Admins view all market vendors"
    ON market_vendors FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid()
            AND (role = 'admin' OR 'admin' = ANY(roles))
        )
    );

-- Admins can manage all market vendors
CREATE POLICY "Admins manage market vendors"
    ON market_vendors FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid()
            AND (role = 'admin' OR 'admin' = ANY(roles))
        )
    );

-- Public can view approved vendors for active markets
CREATE POLICY "Public view approved market vendors"
    ON market_vendors FOR SELECT
    USING (
        approved = true
        AND EXISTS (
            SELECT 1 FROM markets
            WHERE id = market_id AND active = true
        )
    );

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

-- Markets trigger
DROP TRIGGER IF EXISTS update_markets_updated_at ON markets;
CREATE TRIGGER update_markets_updated_at
    BEFORE UPDATE ON markets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Market vendors trigger
DROP TRIGGER IF EXISTS update_market_vendors_updated_at ON market_vendors;
CREATE TRIGGER update_market_vendors_updated_at
    BEFORE UPDATE ON market_vendors
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
