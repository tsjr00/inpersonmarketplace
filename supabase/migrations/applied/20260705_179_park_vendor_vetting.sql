-- ============================================================================
-- Migration 179: FT park vendor vetting (book-then-vet) — B3
-- ============================================================================
-- Enforcement layer for the book-then-vet model. Booking is NEVER blocked on
-- docs; the operator vets and, at their discretion, can:
--   (1) BLOCK a truck from future bookings — GENERAL-PURPOSE (any reason).
--   (2) BAR a specific paid booking — the paid row STAYS (status unchanged) so
--       the slot is NOT resold (the operator does not profit twice); no refund.
-- ADDITIVE. No backfill. Mirrors the park tables' service-only RLS posture.
-- ============================================================================
-- Dependencies: markets, vendor_profiles, park_spot_bookings (mig 172),
-- shared update_updated_at_column().
-- ROLLBACK at bottom.
-- ============================================================================

-- 1) Per (park, truck) vetting state + general-purpose block.
CREATE TABLE IF NOT EXISTS park_vendor_vetting (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  docs_reviewed_at TIMESTAMPTZ NULL,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','reviewed','flagged')),
  blocked BOOLEAN NOT NULL DEFAULT false,
  block_reason TEXT NULL,
  blocked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (market_id, vendor_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_park_vendor_vetting_market ON park_vendor_vetting (market_id);
-- Fast "is this truck blocked at this park?" lookup for the booking gate.
CREATE INDEX IF NOT EXISTS idx_park_vendor_vetting_blocked
  ON park_vendor_vetting (market_id, vendor_profile_id) WHERE blocked = true;

ALTER TABLE park_vendor_vetting ENABLE ROW LEVEL SECURITY;
-- No policies: service-client only, behind isMarketManager / vendor-self checks
-- (mirrors park_spots / park_spot_bookings / park_standing_reservations).

CREATE TRIGGER trg_park_vendor_vetting_updated_at
  BEFORE UPDATE ON park_vendor_vetting
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2) Per-booking bar. The booking row is NOT cancelled (status stays 'paid'),
--    so the partial-unique index keeps holding the slot — it is never reopened
--    for resale. These columns just mark the truck as barred from attending.
ALTER TABLE park_spot_bookings ADD COLUMN IF NOT EXISTS manager_barred_at TIMESTAMPTZ NULL;
ALTER TABLE park_spot_bookings ADD COLUMN IF NOT EXISTS bar_reason TEXT NULL;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK:
--   ALTER TABLE park_spot_bookings DROP COLUMN IF EXISTS bar_reason;
--   ALTER TABLE park_spot_bookings DROP COLUMN IF EXISTS manager_barred_at;
--   DROP TABLE IF EXISTS park_vendor_vetting CASCADE;
-- ============================================================================
