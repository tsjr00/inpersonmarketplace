-- Migration: Unified vendor tier limits (Free / Pro / Boss)
-- Session 61 — Consolidate 4 tiers to 3 across both verticals
--
-- Changes:
-- 1. Recreate enforce_listing_tier_limit() with unified limits:
--    free=20, pro=50, boss=100 (legacy names basic/standard/premium/featured → free)
-- 2. Ensure CHECK constraint includes all valid tier values
--
-- Code-side normalization via normalizeTier() handles existing DB values,
-- so we do NOT migrate existing vendor tier values in this migration.

-- ══════════════════════════════════════════════════════════════════════
-- 1. Recreate the listing tier limit trigger function
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION enforce_listing_tier_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_vendor vendor_profiles%ROWTYPE;
  v_active_count INTEGER;
  v_max_listings INTEGER;
BEGIN
  -- Only fire when status changes to 'active' (published)
  IF NEW.status <> 'active' THEN
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
    RETURN NEW; -- No vendor profile, allow (shouldn't happen)
  END IF;

  -- Determine max listings based on unified tier system
  -- Legacy tier names (basic, standard, premium, featured) map to free limits
  v_max_listings := CASE LOWER(COALESCE(v_vendor.tier, 'free'))
    WHEN 'boss' THEN 100
    WHEN 'pro' THEN 50
    -- All legacy names + free get 20
    ELSE 20
  END;

  -- Count current active listings (excluding this one if UPDATE)
  SELECT COUNT(*) INTO v_active_count
  FROM listings
  WHERE vendor_profile_id = NEW.vendor_profile_id
    AND status = 'active'
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

-- ══════════════════════════════════════════════════════════════════════
-- 2. Ensure CHECK constraint includes all tier values
-- ══════════════════════════════════════════════════════════════════════

-- Drop the existing constraint and recreate with all valid values
-- (includes legacy names so existing data doesn't violate the constraint)
DO $$
BEGIN
  -- Drop existing check constraint(s) on tier column
  ALTER TABLE vendor_profiles DROP CONSTRAINT IF EXISTS vendor_profiles_tier_check;
  ALTER TABLE vendor_profiles DROP CONSTRAINT IF EXISTS vendor_profiles_tier_check1;

  -- Recreate with unified + legacy values
  ALTER TABLE vendor_profiles ADD CONSTRAINT vendor_profiles_tier_check
    CHECK (tier = ANY (ARRAY['free', 'pro', 'boss', 'standard', 'premium', 'featured', 'basic']));
END $$;

-- ══════════════════════════════════════════════════════════════════════
-- 3. Reload PostgREST schema cache
-- ══════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';
