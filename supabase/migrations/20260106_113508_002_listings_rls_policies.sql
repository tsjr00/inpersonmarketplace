-- =============================================================================
-- Migration: RLS policies for listings table
-- =============================================================================
-- Created: 2026-01-06 11:35:08 CST
-- Author: Claude Code
--
-- Purpose:
-- Implements Row Level Security for listings table:
-- - Vendors can CRUD their own listings
-- - Public can read published listings
-- - Service role has full access
--
-- Dependencies:
-- Requires listings table and vendor_profiles table
--
-- Applied to:
-- [x] Dev (vawpviatqalicckkqchs) - Date: 2026-01-06
-- [ ] Staging (vfknvsxfgcwqmlkuzhnq) - Date: ___________
--
-- Rollback:
-- DROP POLICY IF EXISTS "Vendors can view own listings" ON listings;
-- DROP POLICY IF EXISTS "Vendors can create listings" ON listings;
-- DROP POLICY IF EXISTS "Vendors can update own listings" ON listings;
-- DROP POLICY IF EXISTS "Vendors can delete own listings" ON listings;
-- DROP POLICY IF EXISTS "Public can view active listings" ON listings;
-- =============================================================================

-- Enable RLS on listings table
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

-- Policy: Vendors can view their own listings (including drafts)
CREATE POLICY "Vendors can view own listings"
ON listings
FOR SELECT
TO authenticated
USING (
  vendor_profile_id IN (
    SELECT id FROM vendor_profiles
    WHERE user_id = auth.uid()
  )
);

-- Policy: Vendors can create listings for their vendor profile
CREATE POLICY "Vendors can create listings"
ON listings
FOR INSERT
TO authenticated
WITH CHECK (
  vendor_profile_id IN (
    SELECT id FROM vendor_profiles
    WHERE user_id = auth.uid()
  )
);

-- Policy: Vendors can update their own listings
CREATE POLICY "Vendors can update own listings"
ON listings
FOR UPDATE
TO authenticated
USING (
  vendor_profile_id IN (
    SELECT id FROM vendor_profiles
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  vendor_profile_id IN (
    SELECT id FROM vendor_profiles
    WHERE user_id = auth.uid()
  )
);

-- Policy: Vendors can soft-delete their own listings
CREATE POLICY "Vendors can delete own listings"
ON listings
FOR DELETE
TO authenticated
USING (
  vendor_profile_id IN (
    SELECT id FROM vendor_profiles
    WHERE user_id = auth.uid()
  )
);

-- Policy: Anyone can view published listings (for public browsing)
-- Note: listing_status enum values are: draft, published, paused, archived
CREATE POLICY "Public can view active listings"
ON listings
FOR SELECT
TO anon, authenticated
USING (
  status = 'published'
  AND deleted_at IS NULL
);
