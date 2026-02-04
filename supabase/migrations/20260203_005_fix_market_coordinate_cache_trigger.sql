-- Migration: Add trigger to refresh vendor_location_cache when market coordinates change
-- This fixes the issue where vendors don't appear in browse after adding coordinates to their market

-- First, update the trigger function to handle market coordinate changes
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
    -- Market coordinates changed - refresh all vendors who have listings at this market
    -- This is critical for private pickup locations
    FOR v_vendor_id IN
      SELECT DISTINCT l.vendor_profile_id
      FROM listings l
      JOIN listing_markets lm ON lm.listing_id = l.id
      WHERE lm.market_id = COALESCE(NEW.id, OLD.id)
        AND l.status = 'published'
        AND l.deleted_at IS NULL
    LOOP
      PERFORM refresh_vendor_location(v_vendor_id);
    END LOOP;
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Refresh this vendor's locations
  IF v_vendor_id IS NOT NULL THEN
    PERFORM refresh_vendor_location(v_vendor_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Add trigger on markets table for coordinate changes
DROP TRIGGER IF EXISTS trg_vlc_market_coords_change ON markets;
CREATE TRIGGER trg_vlc_market_coords_change
AFTER UPDATE OF latitude, longitude
ON markets
FOR EACH ROW
WHEN (
  (OLD.latitude IS DISTINCT FROM NEW.latitude) OR
  (OLD.longitude IS DISTINCT FROM NEW.longitude)
)
EXECUTE FUNCTION trg_refresh_vendor_location();

-- Also refresh cache when market becomes active/inactive
DROP TRIGGER IF EXISTS trg_vlc_market_status_change ON markets;
CREATE TRIGGER trg_vlc_market_status_change
AFTER UPDATE OF active, status
ON markets
FOR EACH ROW
WHEN (
  (OLD.active IS DISTINCT FROM NEW.active) OR
  (OLD.status IS DISTINCT FROM NEW.status)
)
EXECUTE FUNCTION trg_refresh_vendor_location();

-- Now, let's also run a one-time refresh to fix any vendors currently missing from cache
-- This will populate the cache for all vendors who have listings at markets with coordinates
DO $$
DECLARE
  v_id UUID;
BEGIN
  -- Find all vendors with published listings at markets that have coordinates
  FOR v_id IN
    SELECT DISTINCT l.vendor_profile_id
    FROM listings l
    JOIN listing_markets lm ON lm.listing_id = l.id
    JOIN markets m ON m.id = lm.market_id
    JOIN vendor_profiles vp ON vp.id = l.vendor_profile_id
    WHERE l.status = 'published'
      AND l.deleted_at IS NULL
      AND m.latitude IS NOT NULL
      AND m.longitude IS NOT NULL
      AND vp.status = 'approved'
  LOOP
    PERFORM refresh_vendor_location(v_id);
  END LOOP;
END;
$$;

-- Add comment explaining the triggers
COMMENT ON TRIGGER trg_vlc_market_coords_change ON markets IS
  'Refreshes vendor_location_cache when market coordinates change, ensuring vendors appear in location-based searches';

COMMENT ON TRIGGER trg_vlc_market_status_change ON markets IS
  'Refreshes vendor_location_cache when market status changes (active/inactive)';
