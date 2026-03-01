-- Migration 061: Add FM free tier + update tier limits for both verticals
-- 1. Update enforce_listing_tier_limit() with new FM/FT limits
-- 2. Generalize set_ft_default_tier → set_default_vendor_tier (both verticals get 'free')
-- Existing FM vendors at 'standard' are GRANDFATHERED (no data migration)

-- ============================================================
-- 1. Update listing tier limit trigger with new limits
-- FM: free=5, standard=10, premium=20, featured=30
-- FT: free=5, basic=10, pro=20, boss=45
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_listing_tier_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_tier TEXT;
  v_vertical TEXT;
  v_current_count INTEGER;
  v_max_listings INTEGER;
BEGIN
  -- Only enforce on status change to 'published' (allows creating drafts freely)
  IF NEW.status != 'published' THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, skip if status didn't change to active
  IF TG_OP = 'UPDATE' AND OLD.status = 'published' THEN
    RETURN NEW;
  END IF;

  -- Get vendor tier and vertical
  SELECT tier, vertical_id INTO v_tier, v_vertical
  FROM vendor_profiles
  WHERE id = NEW.vendor_profile_id;

  -- Determine max listings based on vertical + tier
  IF v_vertical = 'food_trucks' THEN
    CASE COALESCE(LOWER(v_tier), 'free')
      WHEN 'boss' THEN v_max_listings := 45;
      WHEN 'pro' THEN v_max_listings := 20;
      WHEN 'basic' THEN v_max_listings := 10;
      ELSE v_max_listings := 5; -- free
    END CASE;
  ELSE
    -- Farmers market / other
    CASE COALESCE(LOWER(v_tier), 'free')
      WHEN 'featured' THEN v_max_listings := 30;
      WHEN 'premium' THEN v_max_listings := 20;
      WHEN 'standard' THEN v_max_listings := 10;
      ELSE v_max_listings := 5; -- free
    END CASE;
  END IF;

  -- Count current active listings (exclude this one on UPDATE)
  SELECT COUNT(*) INTO v_current_count
  FROM listings
  WHERE vendor_profile_id = NEW.vendor_profile_id
    AND status = 'published'
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000');

  IF v_current_count >= v_max_listings THEN
    RAISE EXCEPTION 'Listing limit reached: % of % active listings for your tier. Upgrade to add more.',
      v_current_count, v_max_listings;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 2. Generalize default tier trigger — ALL new vendors get 'free'
-- Replaces FT-only trigger from migration 033
-- ============================================================

CREATE OR REPLACE FUNCTION set_default_vendor_tier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tier IS NULL OR NEW.tier = '' THEN
    NEW.tier := 'free';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Drop old FT-only trigger and create universal one
DROP TRIGGER IF EXISTS set_ft_default_tier_trigger ON vendor_profiles;
DROP TRIGGER IF EXISTS set_default_vendor_tier_trigger ON vendor_profiles;
CREATE TRIGGER set_default_vendor_tier_trigger
  BEFORE INSERT ON vendor_profiles
  FOR EACH ROW EXECUTE FUNCTION set_default_vendor_tier();

NOTIFY pgrst, 'reload schema';
