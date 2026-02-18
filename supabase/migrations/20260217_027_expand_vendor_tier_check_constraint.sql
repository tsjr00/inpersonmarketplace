-- Expand vendor_profiles.tier CHECK constraint to include food truck tiers
-- Previously only allowed: standard, premium
-- Now also allows: featured, basic, pro, boss

ALTER TABLE vendor_profiles DROP CONSTRAINT vendor_profiles_tier_check;

ALTER TABLE vendor_profiles ADD CONSTRAINT vendor_profiles_tier_check
  CHECK (tier = ANY (ARRAY['standard', 'premium', 'featured', 'basic', 'pro', 'boss']));

-- Migrate existing food truck vendors to 'basic' tier (lowest paid FT tier)
-- FT has no free tier — all vendors must be on basic/pro/boss
UPDATE vendor_profiles
SET tier = 'basic', tier_started_at = NOW()
WHERE vertical_id = 'food_trucks' AND (tier = 'standard' OR tier IS NULL);
