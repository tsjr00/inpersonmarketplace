-- ZIP Codes Table for Geographic Lookups
-- Supports: Fast ZIP-to-coordinates lookup, partner territory management, regional grouping
-- Reference: https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html

-- Create the zip_codes table
CREATE TABLE IF NOT EXISTS public.zip_codes (
  zip VARCHAR(5) PRIMARY KEY,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(2) NOT NULL,
  state_name VARCHAR(50),
  county VARCHAR(100),
  latitude DECIMAL(9,6) NOT NULL,
  longitude DECIMAL(9,6) NOT NULL,
  timezone VARCHAR(50),
  population INTEGER,
  -- Partner territory management
  region_code VARCHAR(20),  -- e.g., 'TX-CENTRAL', 'TX-GULF', 'CA-BAY'
  active_market_area BOOLEAN DEFAULT FALSE,  -- Flag for areas with active markets/partners
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_zip_codes_state ON public.zip_codes(state);
CREATE INDEX IF NOT EXISTS idx_zip_codes_region ON public.zip_codes(region_code) WHERE region_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_zip_codes_active_market ON public.zip_codes(active_market_area) WHERE active_market_area = TRUE;
CREATE INDEX IF NOT EXISTS idx_zip_codes_city_state ON public.zip_codes(city, state);

-- Spatial index for coordinate-based lookups (if PostGIS is available)
-- This allows finding nearby ZIP codes efficiently
CREATE INDEX IF NOT EXISTS idx_zip_codes_coords ON public.zip_codes(latitude, longitude);

-- RLS Policies - ZIP codes are public reference data
ALTER TABLE public.zip_codes ENABLE ROW LEVEL SECURITY;

-- Anyone can read ZIP codes (public reference data)
DROP POLICY IF EXISTS "zip_codes_public_read" ON public.zip_codes;
CREATE POLICY "zip_codes_public_read" ON public.zip_codes
  FOR SELECT
  USING (true);

-- Only admins can modify ZIP codes
DROP POLICY IF EXISTS "zip_codes_admin_all" ON public.zip_codes;
CREATE POLICY "zip_codes_admin_all" ON public.zip_codes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_id = (SELECT auth.uid())
      AND role = 'admin'
    )
  );

-- Helper function: Get coordinates for a ZIP code
CREATE OR REPLACE FUNCTION public.get_zip_coordinates(zip_code VARCHAR(5))
RETURNS TABLE(latitude DECIMAL(9,6), longitude DECIMAL(9,6), city VARCHAR(100), state VARCHAR(2))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT z.latitude, z.longitude, z.city, z.state
  FROM public.zip_codes z
  WHERE z.zip = zip_code;
END;
$$;

-- Helper function: Find ZIP codes near coordinates (for reverse geocoding)
CREATE OR REPLACE FUNCTION public.get_nearby_zip_codes(
  user_lat DECIMAL(9,6),
  user_lng DECIMAL(9,6),
  limit_count INTEGER DEFAULT 5
)
RETURNS TABLE(
  zip VARCHAR(5),
  city VARCHAR(100),
  state VARCHAR(2),
  distance_miles DECIMAL(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    z.zip,
    z.city,
    z.state,
    -- Haversine formula for distance in miles
    ROUND(
      (3959 * acos(
        cos(radians(user_lat)) * cos(radians(z.latitude)) *
        cos(radians(z.longitude) - radians(user_lng)) +
        sin(radians(user_lat)) * sin(radians(z.latitude))
      ))::DECIMAL(10,2),
      2
    ) AS distance_miles
  FROM public.zip_codes z
  ORDER BY
    -- Use bounding box first for efficiency, then actual distance
    (z.latitude - user_lat)^2 + (z.longitude - user_lng)^2
  LIMIT limit_count;
END;
$$;

-- Helper function: Get all ZIP codes in a region (for partner territories)
CREATE OR REPLACE FUNCTION public.get_region_zip_codes(region VARCHAR(20))
RETURNS TABLE(
  zip VARCHAR(5),
  city VARCHAR(100),
  state VARCHAR(2),
  latitude DECIMAL(9,6),
  longitude DECIMAL(9,6)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT z.zip, z.city, z.state, z.latitude, z.longitude
  FROM public.zip_codes z
  WHERE z.region_code = region
  ORDER BY z.city, z.zip;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_zip_coordinates(VARCHAR) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_nearby_zip_codes(DECIMAL, DECIMAL, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_region_zip_codes(VARCHAR) TO authenticated, anon;

-- Add table comment
COMMENT ON TABLE public.zip_codes IS 'US ZIP codes with coordinates for geographic lookups and partner territory management';
COMMENT ON COLUMN public.zip_codes.region_code IS 'Partner territory identifier, e.g., TX-CENTRAL, TX-GULF, CA-BAY';
COMMENT ON COLUMN public.zip_codes.active_market_area IS 'Flag indicating areas with active markets or partners';

-- Note: ZIP code data should be seeded separately due to volume (~42,000 records)
-- See: supabase/seed/zip_codes_seed.sql or use Census Bureau Gazetteer files
