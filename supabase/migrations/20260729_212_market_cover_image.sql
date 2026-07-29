-- Migration 212: markets.cover_image_url (park/market photo, distinct from logo)
--
-- Tester finding 2026-07-28: FT park operators want a SECOND image on their park
-- profile — a photo of the park/lot itself — separate from their square logo.
-- This adds the storage column; the file is uploaded from the park-setup Branding
-- card (POST /api/market-manager/[marketId]/cover-image) into the shared
-- vendor-images bucket under a market-covers/ prefix, and rendered as a banner on
-- the public market profile page.
--
-- Additive, nullable, no backfill. Mirrors vendor_profiles.cover_image_url
-- (mig 097). DATA-SAFE: no existing rows change.
--
-- ROLLBACK:
--   ALTER TABLE markets DROP COLUMN IF EXISTS cover_image_url;
--   NOTIFY pgrst, 'reload schema';

ALTER TABLE markets ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- PostgREST must reload so the new column is queryable via the API immediately.
NOTIFY pgrst, 'reload schema';
