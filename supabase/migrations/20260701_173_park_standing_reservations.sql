-- ============================================================================
-- Migration 173: park_standing_reservations (FT Park-Manager P4a)
-- ============================================================================
-- Standing (recurring) spot reservations — an anchor truck holds ONE spot on
-- ONE day-of-week ("Spot A every Saturday"). Manager-approved (the consistency
-- draw + the abuse gate). Strikes are NOT stored — computed on read (P4c) from
-- missed prepay + no-show check-ins over a rolling 32 days. This migration is
-- the lifecycle backbone only: request → approve → revoke/reinstate.
--
-- park_spots.recurring_eligible (mig 171) already gates which spots are anchorable.
--
-- RLS: enabled, NO policies — service client behind isMarketManager / vendor-self.
-- Additive, no backfill.
-- ============================================================================
-- ROLLBACK (single transaction):
--   BEGIN;
--     DROP TABLE IF EXISTS park_standing_reservations CASCADE;
--     NOTIFY pgrst, 'reload schema';
--   COMMIT;
--   Risk: PRE/DEV-only = none. POST with real tags = loses the standing-hold
--   records (no bookings depend on them — occurrences are normal
--   park_spot_bookings). Coordinate before Staging/Prod.
--
-- Dependencies: mig 001 (markets, vendor_profiles), mig 171 (park_spots),
--   mig 160 (shared update_updated_at_column fn).
-- ============================================================================

CREATE TABLE IF NOT EXISTS park_standing_reservations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id         UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  spot_id           UUID NOT NULL REFERENCES park_spots(id) ON DELETE CASCADE,
  day_of_week       INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),   -- 0=Sun..6=Sat
  status            TEXT NOT NULL DEFAULT 'requested'
                      CHECK (status IN ('requested','active','suspended','revoked')),
  approved_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE park_standing_reservations IS
  'FT park-manager: standing (recurring) spot hold — a truck holds one spot on one day-of-week, manager-approved. Strikes computed on read (not stored). One active/requested holder per (spot, day_of_week). RLS default-deny.';

-- One active/requested holder per spot per DOW (a revoked/suspended tag frees it).
CREATE UNIQUE INDEX uq_park_standing_active
  ON park_standing_reservations(spot_id, day_of_week)
  WHERE status IN ('requested','active');

CREATE INDEX idx_park_standing_market ON park_standing_reservations(market_id);
CREATE INDEX idx_park_standing_vendor ON park_standing_reservations(vendor_profile_id);

-- Same-market integrity: spot_id must belong to market_id (mirrors mig 172).
CREATE OR REPLACE FUNCTION check_park_standing_market()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM park_spots WHERE id = NEW.spot_id AND market_id = NEW.market_id
  ) THEN
    RAISE EXCEPTION 'spot_id % does not belong to market_id %', NEW.spot_id, NEW.market_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_park_standing_market ON park_standing_reservations;
CREATE TRIGGER trg_park_standing_market
  BEFORE INSERT OR UPDATE OF market_id, spot_id ON park_standing_reservations
  FOR EACH ROW EXECUTE FUNCTION check_park_standing_market();

DROP TRIGGER IF EXISTS trg_park_standing_updated_at ON park_standing_reservations;
CREATE TRIGGER trg_park_standing_updated_at
  BEFORE UPDATE ON park_standing_reservations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE park_standing_reservations ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION (run after apply):
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name='park_standing_reservations';  -- 1
-- SELECT indexname FROM pg_indexes WHERE tablename='park_standing_reservations'; -- 4 (pk + 3)
-- ============================================================================
