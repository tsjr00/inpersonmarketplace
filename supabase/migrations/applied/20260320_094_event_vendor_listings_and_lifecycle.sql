-- =============================================================================
-- Migration 094: Event vendor listings + event lifecycle statuses
-- =============================================================================
-- Created: 2026-03-20 (Session 62)
-- Author: Claude Code
--
-- Changes:
-- 1. New table: event_vendor_listings — per-event menu selections by vendors
-- 2. Update catering_requests status CHECK to include ready, active, review
-- 3. Indexes for efficient queries
-- =============================================================================

-- 1. Create event_vendor_listings table
CREATE TABLE IF NOT EXISTS public.event_vendor_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  vendor_profile_id UUID NOT NULL REFERENCES public.vendor_profiles(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each listing can only appear once per event
  CONSTRAINT event_vendor_listings_unique UNIQUE (market_id, listing_id)
);

-- Index for per-vendor queries (which items did this vendor select for this event?)
CREATE INDEX idx_event_vendor_listings_market_vendor
  ON event_vendor_listings(market_id, vendor_profile_id);

-- Index for per-listing queries (which events include this listing?)
CREATE INDEX idx_event_vendor_listings_listing
  ON event_vendor_listings(listing_id);

-- RLS
ALTER TABLE event_vendor_listings ENABLE ROW LEVEL SECURITY;

-- Vendors can see and manage their own event listings
CREATE POLICY event_vendor_listings_vendor_select ON event_vendor_listings
  FOR SELECT USING (
    vendor_profile_id IN (
      SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY event_vendor_listings_vendor_insert ON event_vendor_listings
  FOR INSERT WITH CHECK (
    vendor_profile_id IN (
      SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY event_vendor_listings_vendor_delete ON event_vendor_listings
  FOR DELETE USING (
    vendor_profile_id IN (
      SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
    )
  );

-- Public can read event listings (for event detail page)
CREATE POLICY event_vendor_listings_public_select ON event_vendor_listings
  FOR SELECT USING (true);

-- Admin can manage all
CREATE POLICY event_vendor_listings_admin_all ON event_vendor_listings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = (SELECT auth.uid())
      AND ('admin' = ANY(roles) OR role = 'admin')
    )
  );

-- 2. Update catering_requests status CHECK constraint
-- Drop existing and recreate with new values
ALTER TABLE catering_requests DROP CONSTRAINT IF EXISTS catering_requests_status_check;
ALTER TABLE catering_requests ADD CONSTRAINT catering_requests_status_check
  CHECK (status IN ('new', 'reviewing', 'approved', 'declined', 'ready', 'active', 'review', 'completed'));

-- 3. Add max_event_listings config (5 for FT, can be adjusted per vertical)
COMMENT ON TABLE event_vendor_listings IS
'Per-event menu selections by vendors. FT vendors limited to 5 items per event (enforced in application code). Vendors select items when accepting an event invitation.';

NOTIFY pgrst, 'reload schema';
