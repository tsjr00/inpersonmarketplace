-- Add certifications column to vendor_profiles
-- Stores an array of certification objects with type, label, number, state, etc.
-- Structure:
-- {
--   "type": "cottage_goods" | "organic" | "regenerative" | "other",
--   "label": "Cottage Food License",
--   "registration_number": "CA-2024-1234",
--   "state": "CA",
--   "expires_at": "2025-12-31" (optional),
--   "verified": false (for future admin verification)
-- }

ALTER TABLE vendor_profiles
ADD COLUMN IF NOT EXISTS certifications jsonb DEFAULT '[]'::jsonb;

-- Add index for searching vendors by certification type
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_certifications
ON vendor_profiles USING gin (certifications);

-- Add a comment explaining the structure
COMMENT ON COLUMN vendor_profiles.certifications IS 'Array of certification objects. Each object contains: type (cottage_goods|organic|regenerative|other), label, registration_number, state, expires_at (optional), verified (boolean)';
