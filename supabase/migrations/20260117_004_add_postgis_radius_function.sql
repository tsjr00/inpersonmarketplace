-- ============================================================================
-- Migration: Add PostGIS Function for Radius-Based Market Queries
-- Created: 2026-01-17
-- Purpose: Efficient 25-mile radius filtering using PostGIS
-- ============================================================================

-- Ensure PostGIS extension is enabled (should already be)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create function to get markets within a radius of a point
-- Uses PostGIS for efficient geographic calculations
CREATE OR REPLACE FUNCTION get_markets_within_radius(
  user_lat DECIMAL,
  user_lng DECIMAL,
  radius_meters DECIMAL,
  vertical_filter TEXT DEFAULT NULL,
  market_type_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  market_type TEXT,
  vertical_id TEXT,
  status TEXT,
  active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  distance_miles DECIMAL
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.name,
    m.description,
    m.address,
    m.city,
    m.state,
    m.zip_code,
    m.latitude,
    m.longitude,
    m.market_type,
    m.vertical_id,
    m.status,
    m.active,
    m.created_at,
    m.updated_at,
    -- Convert meters to miles (1 mile = 1609.344 meters)
    ROUND(
      (ST_Distance(
        ST_SetSRID(ST_MakePoint(m.longitude::float, m.latitude::float), 4326)::geography,
        ST_SetSRID(ST_MakePoint(user_lng::float, user_lat::float), 4326)::geography
      ) / 1609.344)::numeric,
      1
    ) as distance_miles
  FROM markets m
  WHERE
    m.latitude IS NOT NULL
    AND m.longitude IS NOT NULL
    AND m.status = 'active'
    AND (vertical_filter IS NULL OR m.vertical_id = vertical_filter)
    AND (market_type_filter IS NULL OR m.market_type = market_type_filter)
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(m.longitude::float, m.latitude::float), 4326)::geography,
      ST_SetSRID(ST_MakePoint(user_lng::float, user_lat::float), 4326)::geography,
      radius_meters::float
    )
  ORDER BY distance_miles ASC;
END;
$$;

-- Create similar function for vendors within radius
CREATE OR REPLACE FUNCTION get_vendors_within_radius(
  user_lat DECIMAL,
  user_lng DECIMAL,
  radius_meters DECIMAL,
  vertical_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  business_name TEXT,
  description TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  vertical_id TEXT,
  status TEXT,
  tier TEXT,
  created_at TIMESTAMPTZ,
  distance_miles DECIMAL
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.id,
    v.user_id,
    v.business_name,
    v.description,
    v.address,
    v.city,
    v.state,
    v.zip_code,
    v.latitude,
    v.longitude,
    v.vertical_id,
    v.status,
    v.tier,
    v.created_at,
    ROUND(
      (ST_Distance(
        ST_SetSRID(ST_MakePoint(v.longitude::float, v.latitude::float), 4326)::geography,
        ST_SetSRID(ST_MakePoint(user_lng::float, user_lat::float), 4326)::geography
      ) / 1609.344)::numeric,
      1
    ) as distance_miles
  FROM vendor_profiles v
  WHERE
    v.latitude IS NOT NULL
    AND v.longitude IS NOT NULL
    AND v.status = 'approved'
    AND (vertical_filter IS NULL OR v.vertical_id = vertical_filter)
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(v.longitude::float, v.latitude::float), 4326)::geography,
      ST_SetSRID(ST_MakePoint(user_lng::float, user_lat::float), 4326)::geography,
      radius_meters::float
    )
  ORDER BY distance_miles ASC;
END;
$$;

-- Add spatial indexes for faster queries
-- These use the geography type for accurate distance calculations
CREATE INDEX IF NOT EXISTS idx_markets_geography ON markets
  USING GIST (ST_SetSRID(ST_MakePoint(longitude::float, latitude::float), 4326)::geography)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vendor_profiles_geography ON vendor_profiles
  USING GIST (ST_SetSRID(ST_MakePoint(longitude::float, latitude::float), 4326)::geography)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- ============================================================================
-- END MIGRATION
-- ============================================================================
