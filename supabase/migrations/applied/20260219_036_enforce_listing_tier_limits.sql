-- Migration 036: Enforce listing count limits at DB level
-- H7 FIX: Prevent vendors from exceeding their tier's listing limit
-- Currently only enforced in UI (canCreateListing) — direct Supabase writes bypass it

-- Tier listing limits:
-- FM: standard=5, premium/featured=15
-- FT: free=4, basic=8, pro=20, boss=45

CREATE OR REPLACE FUNCTION enforce_listing_tier_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_tier TEXT;
  v_vertical TEXT;
  v_current_count INTEGER;
  v_max_listings INTEGER;
BEGIN
  -- Only enforce on status change to 'active' (allows creating drafts freely)
  IF NEW.status != 'active' THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, skip if status didn't change to active
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
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

  -- Count current active listings (exclude this one on UPDATE)
  SELECT COUNT(*) INTO v_current_count
  FROM listings
  WHERE vendor_profile_id = NEW.vendor_profile_id
    AND status = 'active'
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000');

  IF v_current_count >= v_max_listings THEN
    RAISE EXCEPTION 'Listing limit reached: % of % active listings for your tier. Upgrade to add more.',
      v_current_count, v_max_listings;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop if exists (idempotent)
DROP TRIGGER IF EXISTS enforce_listing_limit_trigger ON listings;

CREATE TRIGGER enforce_listing_limit_trigger
  BEFORE INSERT OR UPDATE ON listings
  FOR EACH ROW
  EXECUTE FUNCTION enforce_listing_tier_limit();
