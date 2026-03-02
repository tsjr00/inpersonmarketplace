-- Migration 064: Enforce market box offering limits at DB level
-- GAP 6: Unlike listings (enforce_listing_tier_limit), market box offerings
-- have no DB-level guard. Direct Supabase writes bypass API limits.
-- Belt-and-suspenders approach to match the listing trigger pattern.

-- Tier limits for active market box offerings (from vendor-limits.ts):
-- FM: free=1, standard=2, premium=4, featured=8
-- FT: free=0, basic=2, pro=4, boss=8

CREATE OR REPLACE FUNCTION enforce_market_box_tier_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_tier TEXT;
  v_vertical TEXT;
  v_current_count INTEGER;
  v_max_active INTEGER;
BEGIN
  -- Only enforce when activating an offering
  IF NEW.active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, skip if already active (no change)
  IF TG_OP = 'UPDATE' AND OLD.active IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Get vendor tier and vertical
  SELECT tier, vertical_id INTO v_tier, v_vertical
  FROM vendor_profiles
  WHERE id = NEW.vendor_profile_id;

  -- Determine max active market box offerings based on vertical + tier
  IF v_vertical = 'food_trucks' THEN
    CASE COALESCE(LOWER(v_tier), 'free')
      WHEN 'boss' THEN v_max_active := 8;
      WHEN 'pro' THEN v_max_active := 4;
      WHEN 'basic' THEN v_max_active := 2;
      ELSE v_max_active := 0; -- free FT vendors cannot have market boxes
    END CASE;
  ELSE
    -- Farmers market / other verticals
    CASE COALESCE(LOWER(v_tier), 'free')
      WHEN 'featured' THEN v_max_active := 8;
      WHEN 'premium' THEN v_max_active := 4;
      WHEN 'standard' THEN v_max_active := 2;
      ELSE v_max_active := 1; -- free
    END CASE;
  END IF;

  -- Count current active offerings (exclude this one on UPDATE)
  SELECT COUNT(*) INTO v_current_count
  FROM market_box_offerings
  WHERE vendor_profile_id = NEW.vendor_profile_id
    AND active = TRUE
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000');

  IF v_current_count >= v_max_active THEN
    RAISE EXCEPTION 'Market box limit reached: % of % active offerings for your tier. Upgrade to add more.',
      v_current_count, v_max_active;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create the trigger
DROP TRIGGER IF EXISTS enforce_market_box_limit_trigger ON market_box_offerings;
CREATE TRIGGER enforce_market_box_limit_trigger
  BEFORE INSERT OR UPDATE ON market_box_offerings
  FOR EACH ROW
  EXECUTE FUNCTION enforce_market_box_tier_limit();

COMMENT ON FUNCTION enforce_market_box_tier_limit IS 'Enforces per-tier limits on active market box offerings. Matches pattern of enforce_listing_tier_limit for listings.';

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
