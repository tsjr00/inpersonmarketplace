-- Migration: Create market_vendor_counts view
-- Purpose: Calculate true vendor counts per market based on listing_markets
-- (not market_vendors which may be empty)

-- Create view for market vendor counts based on listing_markets
-- This counts distinct vendors who have published listings at each market
CREATE OR REPLACE VIEW market_vendor_counts AS
SELECT
  lm.market_id,
  COUNT(DISTINCT l.vendor_profile_id) as vendor_count
FROM listing_markets lm
JOIN listings l ON l.id = lm.listing_id
WHERE l.status = 'published'
  AND l.deleted_at IS NULL
GROUP BY lm.market_id;

-- Grant read access to authenticated users and anon
GRANT SELECT ON market_vendor_counts TO authenticated;
GRANT SELECT ON market_vendor_counts TO anon;

-- Add comment for documentation
COMMENT ON VIEW market_vendor_counts IS 'Calculates vendor counts per market based on published listings in listing_markets table';
