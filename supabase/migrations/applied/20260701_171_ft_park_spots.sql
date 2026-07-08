-- ============================================================================
-- Migration 171: park_spots + markets.park_mode (FT Park-Manager P1)
-- ============================================================================
-- First data-model piece of the FT park-operator module
-- (apps/web/.claude/ft_park_manager_design.md, Phase P1). Individual,
-- attribute-rich truck spots at a park — NOT count-based size tiers, because
-- parks have ~5-15 real spots differing by length + power/utility. No money
-- path in P1; paid bookings against these spots arrive in P2 (park_spot_bookings).
--
-- markets.park_mode: 'free' = attendance/compliance only (no paid spots);
--   'paid' = spots + bookings. Default 'free' is additive + inert — nothing
--   reads park_mode='paid' until P2, and FM markets ignore it entirely.
--
-- park_spots: FT analog of market_booth_inventory (mig 134), but enumerated
--   individual spots with attributes. base_price_cents is PER DAY (fed to the
--   unit-agnostic pricing.ts calculateBoothRentalFees in P2). recurring_eligible
--   is the manager's lever for which spots can be held as standing reservations
--   (P4).
--
-- RLS: enabled, NO policies — default-deny except service_role. Manager API
--   routes use the service client behind isMarketManager (mirrors mig 139/160).
--
-- Additive, no backfill.
-- ============================================================================
-- ROLLBACK (single transaction):
--   BEGIN;
--     DROP TABLE IF EXISTS park_spots CASCADE;
--     ALTER TABLE markets DROP COLUMN IF EXISTS park_mode;
--     NOTIFY pgrst, 'reload schema';
--   COMMIT;
--   Risk: PRE-application / DEV-only = zero data loss. POST-application where an
--   operator has defined spots = DROP TABLE loses those spot definitions (no
--   bookings depend on them yet in P1). park_mode drop reverts all parks to
--   implicit 'free'. Coordinate before running on Staging/Prod.
--
-- Dependencies: mig 001 (markets), mig 160 (shared update_updated_at_column fn).
-- ============================================================================

-- 1. markets.park_mode -------------------------------------------------------
ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS park_mode TEXT NOT NULL DEFAULT 'free'
    CHECK (park_mode IN ('free','paid'));

COMMENT ON COLUMN markets.park_mode IS
  'FT park operating mode: free (attendance/compliance only) | paid (spots + bookings). Default free. Consumed by the FT park-manager module only.';

-- 2. park_spots --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS park_spots (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id          UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  label              TEXT NOT NULL,
  max_length_ft      INTEGER CHECK (max_length_ft IS NULL OR max_length_ft > 0),
  power              TEXT NOT NULL DEFAULT 'none'
                       CHECK (power IN ('shore','generator_ok','none')),
  has_water          BOOLEAN NOT NULL DEFAULT false,
  base_price_cents   INTEGER NOT NULL CHECK (base_price_cents >= 0),
  recurring_eligible BOOLEAN NOT NULL DEFAULT false,
  active             BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (market_id, label)
);

COMMENT ON TABLE park_spots IS
  'FT park-manager: individual truck spots at a park. Enumerated (not count-tiered like market_booth_inventory). base_price_cents is per DAY. recurring_eligible = manager lever for standing reservations (P4). RLS default-deny; service client behind isMarketManager.';

CREATE INDEX idx_park_spots_market ON park_spots(market_id);

-- updated_at maintenance (shared fn; same one mig 160 uses).
DROP TRIGGER IF EXISTS trg_park_spots_updated_at ON park_spots;
CREATE TRIGGER trg_park_spots_updated_at
  BEFORE UPDATE ON park_spots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE park_spots ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION (run after apply):
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='markets' AND column_name='park_mode';    -- expect 1
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name='park_spots';   -- expect 1
-- ============================================================================
