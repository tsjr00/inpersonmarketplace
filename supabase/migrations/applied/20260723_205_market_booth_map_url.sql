-- Migration 205: markets.booth_map_url — manager-uploaded booth/spot map image
--
-- Feature (2026-07-23, user request): the market manager / park operator uploads
-- a map image (or PDF) showing where booths (FM) / truck spots (FT) are located,
-- as part of the process of assigning spots/booths/tiers. Vendors at that market
-- see it during the booth-rental booking flow and when checking their bookings.
--
-- One nullable column on markets storing the public URL of the uploaded file
-- (image or PDF), mirroring markets.logo_url (mig 140). One map per market/park.
-- Storage: the file lives in the shared `vendor-images` bucket under a
-- `booth-maps/` prefix; this column stores its public URL.
--
-- Companion code (same commit, PRE-MIGRATION SAFE — mirrors mig 192
-- required_docs_note): manager POST/DELETE/GET at
-- market-manager/[marketId]/booth-map, MarketMapCard on both dashboards, and a
-- tolerant getBoothMapUrl() read (missing column -> null) used by the manager
-- dashboard + the FM/FT booking forms + the vendor bookings view, so every
-- surface renders even before this migration applies.

ALTER TABLE markets ADD COLUMN IF NOT EXISTS booth_map_url TEXT;

COMMENT ON COLUMN markets.booth_map_url IS
  'Public URL of the manager-uploaded booth/spot map (image or PDF) in the vendor-images bucket, booth-maps/ prefix. Shown to vendors during the booth-rental flow and on their bookings. One per market. NULL = none.';

NOTIFY pgrst, 'reload schema';

-- ROLLBACK:
-- ALTER TABLE markets DROP COLUMN IF EXISTS booth_map_url;
