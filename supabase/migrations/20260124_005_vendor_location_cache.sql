-- Migration: Create vendor_location_cache for fast geographic queries
-- This pre-computes vendor locations for efficient bounding box filtering

-- Table to store pre-computed vendor locations
CREATE TABLE IF NOT EXISTS vendor_location_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  location_source TEXT NOT NULL CHECK (location_source IN ('direct', 'market')),
  source_market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  vertical_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index to prevent duplicate entries per vendor+market combo
-- Uses COALESCE to treat NULL source_market_id as a known value for uniqueness
CREATE UNIQUE INDEX idx_vlc_vendor_market_unique
ON vendor_location_cache(vendor_profile_id, COALESCE(source_market_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Indexes for fast bounding box queries
CREATE INDEX idx_vlc_lat ON vendor_location_cache(latitude);
CREATE INDEX idx_vlc_lng ON vendor_location_cache(longitude);
CREATE INDEX idx_vlc_coords ON vendor_location_cache(latitude, longitude);
CREATE INDEX idx_vlc_vendor ON vendor_location_cache(vendor_profile_id);
CREATE INDEX idx_vlc_vertical ON vendor_location_cache(vertical_id);

-- RLS Policies
ALTER TABLE vendor_location_cache ENABLE ROW LEVEL SECURITY;

-- Everyone can read (it's public location data for searching)
CREATE POLICY "Anyone can view vendor locations"
ON vendor_location_cache FOR SELECT
TO public
USING (true);

-- Function to refresh all vendor locations
CREATE OR REPLACE FUNCTION refresh_all_vendor_locations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Clear existing cache
  DELETE FROM vendor_location_cache;

  -- Insert direct vendor coordinates
  INSERT INTO vendor_location_cache (vendor_profile_id, latitude, longitude, location_source, vertical_id)
  SELECT id, latitude, longitude, 'direct', vertical_id
  FROM vendor_profiles
  WHERE status = 'approved'
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL;

  -- Insert market-based locations (from listing_markets)
  INSERT INTO vendor_location_cache (vendor_profile_id, latitude, longitude, location_source, source_market_id, vertical_id)
  SELECT DISTINCT
    l.vendor_profile_id,
    m.latitude::decimal(10,8),
    m.longitude::decimal(11,8),
    'market',
    m.id,
    vp.vertical_id
  FROM listing_markets lm
  JOIN listings l ON l.id = lm.listing_id
  JOIN markets m ON m.id = lm.market_id
  JOIN vendor_profiles vp ON vp.id = l.vendor_profile_id
  WHERE l.status = 'published'
    AND l.deleted_at IS NULL
    AND m.latitude IS NOT NULL
    AND m.longitude IS NOT NULL
    AND vp.status = 'approved'
  ON CONFLICT DO NOTHING;
END;
$$;

-- Function to refresh a single vendor's locations
CREATE OR REPLACE FUNCTION refresh_vendor_location(p_vendor_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete old entries for this vendor
  DELETE FROM vendor_location_cache WHERE vendor_profile_id = p_vendor_id;

  -- Insert direct coordinates if available
  INSERT INTO vendor_location_cache (vendor_profile_id, latitude, longitude, location_source, vertical_id)
  SELECT id, latitude, longitude, 'direct', vertical_id
  FROM vendor_profiles
  WHERE id = p_vendor_id
    AND status = 'approved'
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL;

  -- Insert market locations from listing_markets
  INSERT INTO vendor_location_cache (vendor_profile_id, latitude, longitude, location_source, source_market_id, vertical_id)
  SELECT DISTINCT
    l.vendor_profile_id,
    m.latitude::decimal(10,8),
    m.longitude::decimal(11,8),
    'market',
    m.id,
    vp.vertical_id
  FROM listing_markets lm
  JOIN listings l ON l.id = lm.listing_id
  JOIN markets m ON m.id = lm.market_id
  JOIN vendor_profiles vp ON vp.id = l.vendor_profile_id
  WHERE l.vendor_profile_id = p_vendor_id
    AND l.status = 'published'
    AND l.deleted_at IS NULL
    AND m.latitude IS NOT NULL
    AND m.longitude IS NOT NULL
    AND vp.status = 'approved'
  ON CONFLICT DO NOTHING;
END;
$$;

-- Trigger function to auto-refresh on vendor changes
CREATE OR REPLACE FUNCTION trg_refresh_vendor_location()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_id UUID;
BEGIN
  -- Determine the vendor ID based on which table triggered this
  IF TG_TABLE_NAME = 'vendor_profiles' THEN
    v_vendor_id := COALESCE(NEW.id, OLD.id);
  ELSIF TG_TABLE_NAME = 'listings' THEN
    v_vendor_id := COALESCE(NEW.vendor_profile_id, OLD.vendor_profile_id);
  ELSIF TG_TABLE_NAME = 'listing_markets' THEN
    -- Need to look up the vendor from the listing
    IF NEW IS NOT NULL THEN
      SELECT vendor_profile_id INTO v_vendor_id FROM listings WHERE id = NEW.listing_id;
    ELSE
      SELECT vendor_profile_id INTO v_vendor_id FROM listings WHERE id = OLD.listing_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'markets' THEN
    -- Market location changed - refresh all vendors at this market
    -- This is handled separately below
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Refresh this vendor's locations
  IF v_vendor_id IS NOT NULL THEN
    PERFORM refresh_vendor_location(v_vendor_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS trg_vlc_vendor_change ON vendor_profiles;
CREATE TRIGGER trg_vlc_vendor_change
AFTER INSERT OR UPDATE OF latitude, longitude, status, vertical_id OR DELETE
ON vendor_profiles
FOR EACH ROW EXECUTE FUNCTION trg_refresh_vendor_location();

DROP TRIGGER IF EXISTS trg_vlc_listing_change ON listings;
CREATE TRIGGER trg_vlc_listing_change
AFTER INSERT OR UPDATE OF vendor_profile_id, status, deleted_at OR DELETE
ON listings
FOR EACH ROW EXECUTE FUNCTION trg_refresh_vendor_location();

DROP TRIGGER IF EXISTS trg_vlc_listing_market_change ON listing_markets;
CREATE TRIGGER trg_vlc_listing_market_change
AFTER INSERT OR DELETE
ON listing_markets
FOR EACH ROW EXECUTE FUNCTION trg_refresh_vendor_location();

-- Initial population of the cache
SELECT refresh_all_vendor_locations();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION refresh_all_vendor_locations() TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_vendor_location(UUID) TO authenticated;
