-- ============================================================================
-- Migration 241: event_vendor_listings.host_status — host menu pare-down (P1)
--                owner decisions 2026-09-03 (decisions.md "Host menu pare-down")
-- ============================================================================
-- PASTE-AND-GO class. ADDITIVE column, default 'approved'. INERT ON ARRIVAL:
-- every existing row (and every row the accept route inserts) defaults to
-- 'approved', which is byte-identical behavior to today. The first 'declined'
-- is written by code (the organizer select route), never by this file.
--
-- WHY
-- A truck proposes its event menu at acceptance; the ORGANIZER may pare it to
-- a subset before the shopping page publishes (all organizers; minimum 2 kept
-- items; only the FIRST selection round pares; activated backups are never
-- pared). "The organizer of the event gets to decide what gets sold" — and the
-- sequence protects fee vendors: paring locks at selection, payment only arms
-- AFTER selection, so a pared vendor sees their final menu before paying.
--
-- MECHANISM (the pair — never change one side alone):
--   event_vendor_listings.host_status  = the DISPLAY half (shop/roster menus)
--   listing_markets link               = the SELL half (cart validates here)
-- A pare sets host_status='declined' AND deletes that item's listing_markets
-- link for the event market. Admin event-restore rebuilds links from APPROVED
-- rows only. Cleanup paths (admin cancel, complete-event) keep deleting by ALL
-- evl rows — deleting an already-removed link is a no-op.
--
-- Post-check:
--   SELECT column_name, column_default FROM information_schema.columns
--    WHERE table_name = 'event_vendor_listings' AND column_name = 'host_status';
--   -- expect one row, default 'approved'::text
--   SELECT count(*) FROM event_vendor_listings WHERE host_status <> 'approved';
--   -- expect 0 at apply time
-- ============================================================================

ALTER TABLE event_vendor_listings
  ADD COLUMN IF NOT EXISTS host_status TEXT NOT NULL DEFAULT 'approved'
  CHECK (host_status IN ('approved', 'declined'));

COMMENT ON COLUMN event_vendor_listings.host_status IS
  'Host menu pare-down (mig 241, owner 2026-09-03): approved = sellable at the event; declined = organizer pared it before the shop published. The paired listing_markets link is removed at pare and rebuilt from approved rows on event restore.';

-- ROLLBACK: ALTER TABLE event_vendor_listings DROP COLUMN host_status;
