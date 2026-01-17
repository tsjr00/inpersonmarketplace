-- Migration: Add home_market_id to vendor_profiles
-- Purpose: Track the designated "home market" for standard tier vendors
-- Standard vendors are limited to 1 traditional market (their home market)

-- Add the home_market_id column (nullable - will be set when vendor first selects a market)
ALTER TABLE vendor_profiles
ADD COLUMN IF NOT EXISTS home_market_id UUID REFERENCES markets(id) ON DELETE SET NULL;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_home_market_id ON vendor_profiles(home_market_id);

-- Add comment for documentation
COMMENT ON COLUMN vendor_profiles.home_market_id IS 'The designated home market for standard tier vendors. Standard vendors can only have listings/boxes at this market. Premium vendors can use multiple markets.';

-- Auto-populate home_market_id for existing vendors based on their first market usage
-- This finds the first traditional market each vendor is using and sets it as their home market
UPDATE vendor_profiles vp
SET home_market_id = (
  SELECT COALESCE(
    -- First try to get from listings (via listing_markets junction table)
    (
      SELECT lm.market_id
      FROM listings l
      JOIN listing_markets lm ON l.id = lm.listing_id
      JOIN markets m ON lm.market_id = m.id
      WHERE l.vendor_profile_id = vp.id
        AND m.market_type != 'private_pickup'
        AND l.status = 'published'
      ORDER BY l.created_at ASC
      LIMIT 1
    ),
    -- Then try from market boxes
    (
      SELECT mbo.pickup_market_id
      FROM market_box_offerings mbo
      JOIN markets m ON mbo.pickup_market_id = m.id
      WHERE mbo.vendor_profile_id = vp.id
        AND m.market_type != 'private_pickup'
        AND mbo.active = true
      ORDER BY mbo.created_at ASC
      LIMIT 1
    )
  )
)
WHERE vp.home_market_id IS NULL
  AND vp.tier = 'standard';
