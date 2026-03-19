-- Fix: enforce_listing_tier_limit() uses 'active' but enum is 'published'
-- Migration 089 accidentally reverted the fix from migration 038.
-- The listing_status enum has 'published' not 'active'.

CREATE OR REPLACE FUNCTION enforce_listing_tier_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_vendor vendor_profiles%ROWTYPE;
  v_active_count INTEGER;
  v_max_listings INTEGER;
BEGIN
  -- Only fire when status changes to 'published' (was incorrectly 'active' in 089)
  IF NEW.status <> 'published' THEN
    RETURN NEW;
  END IF;

  -- Skip if status didn't change (UPDATE that doesn't touch status)
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Get vendor profile
  SELECT * INTO v_vendor
  FROM vendor_profiles
  WHERE id = NEW.vendor_profile_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Determine max listings based on unified tier system
  -- Legacy tier names (basic, standard, premium, featured) map to free limits
  v_max_listings := CASE LOWER(COALESCE(v_vendor.tier, 'free'))
    WHEN 'boss' THEN 100
    WHEN 'pro' THEN 50
    ELSE 20
  END;

  -- Count current published listings (excluding this one if UPDATE)
  SELECT COUNT(*) INTO v_active_count
  FROM listings
  WHERE vendor_profile_id = NEW.vendor_profile_id
    AND status = 'published'
    AND id <> NEW.id
    AND deleted_at IS NULL;

  -- Enforce limit
  IF v_active_count >= v_max_listings THEN
    RAISE EXCEPTION 'Listing limit reached: % of % allowed for your plan. Upgrade for more listings.',
      v_active_count, v_max_listings;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
