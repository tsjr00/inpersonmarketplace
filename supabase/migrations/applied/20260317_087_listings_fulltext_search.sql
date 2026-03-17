-- ============================================================================
-- Migration: Add full-text search index on listings
-- Created: 2026-03-17
-- Purpose: Replace 3x ILIKE scans with single GIN-indexed tsvector search.
--          At 5,000+ listings, ILIKE '%term%' scans every row 3 times.
--          tsvector + GIN index is O(log N) regardless of table size.
-- ============================================================================

-- Add generated tsvector column combining title, description, and category
-- Using 'english' config for stemming (e.g., "running" matches "run")
-- coalesce() prevents NULL fields from breaking the vector
ALTER TABLE listings ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(category, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) STORED;

-- GIN index for fast full-text lookups
CREATE INDEX IF NOT EXISTS idx_listings_search_vector
  ON listings USING GIN (search_vector);

-- Also update the get_listings_within_radius RPC to use full-text search
-- when a search_term is provided (replaces 3x ILIKE with single tsquery match)
CREATE OR REPLACE FUNCTION get_listings_within_radius(
  user_lat DECIMAL,
  user_lng DECIMAL,
  radius_miles DECIMAL DEFAULT 25,
  vertical_filter TEXT DEFAULT NULL,
  category_filter TEXT DEFAULT NULL,
  search_term TEXT DEFAULT NULL,
  page_size INT DEFAULT 50,
  page_offset INT DEFAULT 0
)
RETURNS TABLE (
  listing_id UUID,
  title TEXT,
  description TEXT,
  price_cents INT,
  quantity INT,
  quantity_amount NUMERIC,
  quantity_unit TEXT,
  category TEXT,
  created_at TIMESTAMPTZ,
  vendor_profile_id UUID,
  listing_data JSONB,
  premium_window_ends_at TIMESTAMPTZ,
  vendor_id UUID,
  vendor_profile_data JSONB,
  vendor_status TEXT,
  vendor_tier TEXT,
  vendor_tier_started_at TIMESTAMPTZ,
  nearest_market_distance_miles DECIMAL,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  radius_meters DECIMAL;
  user_point geography;
  count_val BIGINT;
  search_query tsquery;
BEGIN
  -- Convert miles to meters for ST_DWithin
  radius_meters := radius_miles * 1609.344;

  -- Build user's geographic point once
  user_point := ST_SetSRID(ST_MakePoint(CAST(user_lng AS float), CAST(user_lat AS float)), 4326)::geography;

  -- Build tsquery from search term (if provided)
  -- plainto_tsquery handles multi-word input safely (no injection risk)
  IF search_term IS NOT NULL AND search_term <> '' THEN
    search_query := plainto_tsquery('english', search_term);
  END IF;

  -- Count total matching listings (for pagination)
  SELECT COUNT(DISTINCT l.id) INTO count_val
  FROM listings l
  INNER JOIN vendor_profiles vp ON l.vendor_profile_id = vp.id
  INNER JOIN listing_markets lm ON l.id = lm.listing_id
  INNER JOIN markets m ON lm.market_id = m.id
  WHERE l.status = 'published'
    AND l.deleted_at IS NULL
    AND l.quantity > 0
    AND vp.status = 'approved'
    AND m.latitude IS NOT NULL
    AND m.longitude IS NOT NULL
    AND m.active = true
    AND (vertical_filter IS NULL OR l.vertical_id = vertical_filter)
    AND (category_filter IS NULL OR l.category = category_filter)
    AND (search_query IS NULL OR l.search_vector @@ search_query)
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(CAST(m.longitude AS float), CAST(m.latitude AS float)), 4326)::geography,
      user_point,
      CAST(radius_meters AS float)
    );

  -- Return matching listings with nearest market distance
  RETURN QUERY
  SELECT
    l.id AS listing_id,
    l.title,
    l.description,
    l.price_cents,
    l.quantity,
    l.quantity_amount,
    l.quantity_unit,
    l.category,
    l.created_at,
    l.vendor_profile_id,
    l.listing_data,
    l.premium_window_ends_at,
    vp.id AS vendor_id,
    vp.profile_data AS vendor_profile_data,
    vp.status AS vendor_status,
    vp.tier AS vendor_tier,
    vp.tier_started_at AS vendor_tier_started_at,
    -- Nearest market distance in miles
    ROUND(
      (MIN(ST_Distance(
        ST_SetSRID(ST_MakePoint(CAST(m.longitude AS float), CAST(m.latitude AS float)), 4326)::geography,
        user_point
      )) / 1609.344)::numeric,
      1
    ) AS nearest_market_distance_miles,
    count_val AS total_count
  FROM listings l
  INNER JOIN vendor_profiles vp ON l.vendor_profile_id = vp.id
  INNER JOIN listing_markets lm ON l.id = lm.listing_id
  INNER JOIN markets m ON lm.market_id = m.id
  WHERE l.status = 'published'
    AND l.deleted_at IS NULL
    AND l.quantity > 0
    AND vp.status = 'approved'
    AND m.latitude IS NOT NULL
    AND m.longitude IS NOT NULL
    AND m.active = true
    AND (vertical_filter IS NULL OR l.vertical_id = vertical_filter)
    AND (category_filter IS NULL OR l.category = category_filter)
    AND (search_query IS NULL OR l.search_vector @@ search_query)
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(CAST(m.longitude AS float), CAST(m.latitude AS float)), 4326)::geography,
      user_point,
      CAST(radius_meters AS float)
    )
  GROUP BY l.id, l.title, l.description, l.price_cents, l.quantity,
           l.quantity_amount, l.quantity_unit, l.category, l.created_at,
           l.vendor_profile_id, l.listing_data, l.premium_window_ends_at,
           vp.id, vp.profile_data, vp.status, vp.tier, vp.tier_started_at
  ORDER BY nearest_market_distance_miles ASC, l.created_at DESC
  LIMIT page_size
  OFFSET page_offset;
END;
$$;

-- Grants (same as migration 086)
GRANT EXECUTE ON FUNCTION get_listings_within_radius TO authenticated;
GRANT EXECUTE ON FUNCTION get_listings_within_radius TO anon;

-- ============================================================================
-- END MIGRATION
-- ============================================================================
