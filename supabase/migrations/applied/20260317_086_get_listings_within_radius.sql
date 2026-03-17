-- ============================================================================
-- Migration: Add PostGIS Function for Radius-Based Listing Queries
-- Created: 2026-03-17
-- Purpose: Move browse page distance filtering from JS Haversine to PostGIS
--          Follows the same pattern as get_markets_within_radius() from 004
-- ============================================================================

-- get_listings_within_radius: Returns published listings that have at least
-- one market within the given radius of a point. Includes all nested data
-- the browse page needs (vendor, markets, images).
--
-- This replaces the pattern: fetch ALL listings → JS Haversine filter → paginate
-- With: PostGIS ST_DWithin at the DB level → return only matching rows → paginate
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
BEGIN
  -- Convert miles to meters for ST_DWithin
  radius_meters := radius_miles * 1609.344;

  -- Build user's geographic point once
  user_point := ST_SetSRID(ST_MakePoint(CAST(user_lng AS float), CAST(user_lat AS float)), 4326)::geography;

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
    AND (search_term IS NULL OR (
      l.title ILIKE '%' || search_term || '%'
      OR l.description ILIKE '%' || search_term || '%'
      OR l.category ILIKE '%' || search_term || '%'
    ))
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
    AND (search_term IS NULL OR (
      l.title ILIKE '%' || search_term || '%'
      OR l.description ILIKE '%' || search_term || '%'
      OR l.category ILIKE '%' || search_term || '%'
    ))
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

-- Grant execute to both authenticated and anonymous users (browse is public)
GRANT EXECUTE ON FUNCTION get_listings_within_radius TO authenticated;
GRANT EXECUTE ON FUNCTION get_listings_within_radius TO anon;

-- ============================================================================
-- END MIGRATION
-- ============================================================================
