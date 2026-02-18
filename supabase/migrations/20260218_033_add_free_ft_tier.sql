-- Migration 033: Add 'free' tier to vendor_profiles CHECK constraint + auto-set trigger
-- Expands the tier CHECK to include 'free' for food truck free tier
-- Adds trigger to auto-set new FT vendors to 'free' (DB default is 'standard' which is FM-only)

-- 1. Expand CHECK to include 'free'
ALTER TABLE vendor_profiles DROP CONSTRAINT vendor_profiles_tier_check;
ALTER TABLE vendor_profiles ADD CONSTRAINT vendor_profiles_tier_check
  CHECK (tier = ANY (ARRAY['standard', 'premium', 'featured', 'free', 'basic', 'pro', 'boss']));

-- 2. Auto-set new FT vendors to 'free' tier
-- The DB default for tier is 'standard' (FM). This trigger catches FT inserts and sets them to 'free'.
-- Existing FT vendors (already 'basic' from migration 027) are unaffected.
CREATE OR REPLACE FUNCTION set_ft_default_tier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.vertical_id = 'food_trucks' AND (NEW.tier IS NULL OR NEW.tier = 'standard') THEN
    NEW.tier := 'free';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS set_ft_default_tier_trigger ON vendor_profiles;
CREATE TRIGGER set_ft_default_tier_trigger
  BEFORE INSERT ON vendor_profiles
  FOR EACH ROW EXECUTE FUNCTION set_ft_default_tier();

NOTIFY pgrst, 'reload schema';
