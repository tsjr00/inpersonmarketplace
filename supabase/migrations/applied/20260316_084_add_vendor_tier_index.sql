-- Add composite index for vendor_profiles (vertical_id, tier)
-- Supports admin vendor filtering by tier within a vertical,
-- and browse page tier-based sorting queries.
-- The companion index (vertical_id, status) already exists.

CREATE INDEX IF NOT EXISTS idx_vendor_profiles_vertical_tier
  ON vendor_profiles(vertical_id, tier);

NOTIFY pgrst, 'reload schema';
