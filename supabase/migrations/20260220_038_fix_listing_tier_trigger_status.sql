-- Migration 038: Fix listing tier limit trigger — 'active' → 'published'
-- BUG: Migration 036 used 'active' but listing_status enum only has:
--   draft, published, paused, archived
-- This caused: "invalid input value for enum listing_status: active"

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

  -- On UPDATE, skip if status was already published
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
      WHEN 'basic' THEN v_max_listings := 8;
      ELSE v_max_listings := 4; -- free
    END CASE;
  ELSE
    -- Farmers market / other
    CASE COALESCE(LOWER(v_tier), 'standard')
      WHEN 'premium' THEN v_max_listings := 15;
      WHEN 'featured' THEN v_max_listings := 15;
      ELSE v_max_listings := 5; -- standard
    END CASE;
  END IF;

  -- Count current published listings (exclude this one on UPDATE)
  SELECT COUNT(*) INTO v_current_count
  FROM listings
  WHERE vendor_profile_id = NEW.vendor_profile_id
    AND status = 'published'
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000');

  IF v_current_count >= v_max_listings THEN
    RAISE EXCEPTION 'Listing limit reached: % of % published listings for your tier. Upgrade to add more.',
      v_current_count, v_max_listings;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
