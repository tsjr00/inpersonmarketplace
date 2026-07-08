-- ============================================================================
-- Migration 172: park_spot_bookings + book_park_spot_atomic (FT Park-Manager P2a)
-- ============================================================================
-- The date-native paid booking record — the FT "wedge". One row = a truck
-- books ONE spot for ONE calendar date (design: ft_park_manager_design.md P2).
-- Fuses reservation + (later) attendance signal + payment. NOT week-grained;
-- NOT the FM season/group/settlement stack.
--
-- KEY MODEL POINTS (user-confirmed 2026-07-01):
--   - A CANCELLATION frees a spot+date for rebooking; a NO-SHOW does not — a
--     paid row stays 'paid' even if the truck skips the day (they keep what they
--     paid for). This is why the uniqueness is a PARTIAL index over
--     status IN ('pending_payment','paid') — a 'cancelled' row releases the slot.
--   - Individual spots (mig 171), so each (spot, date) is a single slot: the
--     partial-unique index IS the concurrency guard (no count-recount / advisory
--     lock needed, unlike the FM booth RPC).
--   - price_cents is a per-DAY snapshot of park_spots.base_price_cents.
--   - agreement_acceptance_id is nullable + UNUSED in P2 (FT agreement statements
--     are P5).
--   - booking_group_id ties a prepay-week bundle (a lightweight payment group,
--     NOT booth_booking_groups).
--
-- Money path (checkout + webhook) is P2b — this migration touches NO money code.
--
-- RLS: enabled, NO policies — default-deny except service_role. The booking
--   route (P2b) uses the service client with auth verified upstream.
--
-- Additive, no backfill.
-- ============================================================================
-- ROLLBACK (single transaction):
--   BEGIN;
--     DROP FUNCTION IF EXISTS book_park_spot_atomic(uuid, uuid, uuid, date[], uuid, uuid);
--     DROP TABLE IF EXISTS park_spot_bookings CASCADE;
--     NOTIFY pgrst, 'reload schema';
--   COMMIT;
--   Risk: PRE-application / DEV-only = zero data loss. POST-application on an env
--   with real bookings = DROP TABLE loses booking history (no money rows depend
--   on it in P2a — checkout arrives in P2b). Coordinate before Staging/Prod.
--
-- Dependencies: mig 001 (markets, vendor_profiles), mig 171 (park_spots),
--   mig 138 (vendor_market_agreement_acceptances), mig 160 (shared
--   update_updated_at_column fn).
-- ============================================================================

CREATE TABLE IF NOT EXISTS park_spot_bookings (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id                  UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  vendor_profile_id          UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE RESTRICT,
  spot_id                    UUID NOT NULL REFERENCES park_spots(id) ON DELETE RESTRICT,
  booking_date               DATE NOT NULL,
  price_cents                INTEGER NOT NULL CHECK (price_cents >= 0),
  status                     TEXT NOT NULL DEFAULT 'pending_payment'
                               CHECK (status IN ('pending_payment','paid','cancelled','completed')),
  booking_group_id           UUID NULL,                    -- prepay-week bundle (not booth_booking_groups)
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id   TEXT,
  agreement_acceptance_id    UUID REFERENCES vendor_market_agreement_acceptances(id),  -- P5; nullable/unused in P2
  booked_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at                    TIMESTAMPTZ,
  cancelled_at               TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE park_spot_bookings IS
  'FT park-manager: a truck books one spot for one calendar date. price_cents = per-day snapshot of park_spots.base_price_cents. PARTIAL-unique on active status so a cancelled booking frees the slot (a no-show does NOT — the paid row stays). agreement_acceptance_id nullable (P5). booking_group_id = prepay-week bundle. RLS default-deny; service client behind auth.';

-- Concurrency + business guards. PARTIAL (only active rows occupy a slot):
CREATE UNIQUE INDEX uq_park_spot_booking_active
  ON park_spot_bookings(spot_id, booking_date)
  WHERE status IN ('pending_payment','paid');            -- one truck per spot per day
CREATE UNIQUE INDEX uq_park_spot_vendor_active
  ON park_spot_bookings(vendor_profile_id, market_id, booking_date)
  WHERE status IN ('pending_payment','paid');            -- one spot per truck per park per day

-- Lookup indexes.
CREATE INDEX idx_park_spot_bookings_market_date ON park_spot_bookings(market_id, booking_date);
CREATE INDEX idx_park_spot_bookings_vendor_date ON park_spot_bookings(vendor_profile_id, booking_date);
CREATE INDEX idx_park_spot_bookings_group ON park_spot_bookings(booking_group_id)
  WHERE booking_group_id IS NOT NULL;

-- Same-market integrity: spot_id must belong to this row's market_id
-- (mirrors mig 139's check_weekly_booth_rental_inventory_market).
CREATE OR REPLACE FUNCTION check_park_spot_booking_market()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM park_spots
    WHERE id = NEW.spot_id AND market_id = NEW.market_id
  ) THEN
    RAISE EXCEPTION 'spot_id % does not belong to market_id %', NEW.spot_id, NEW.market_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_park_spot_booking_market ON park_spot_bookings;
CREATE TRIGGER trg_park_spot_booking_market
  BEFORE INSERT OR UPDATE OF market_id, spot_id ON park_spot_bookings
  FOR EACH ROW EXECUTE FUNCTION check_park_spot_booking_market();

DROP TRIGGER IF EXISTS trg_park_spot_bookings_updated_at ON park_spot_bookings;
CREATE TRIGGER trg_park_spot_bookings_updated_at
  BEFORE UPDATE ON park_spot_bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE park_spot_bookings ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- book_park_spot_atomic — all-or-nothing multi-date booking for ONE spot.
-- ----------------------------------------------------------------------------
-- Single date = array of one. Prepay-week = the operating dates that week (the
-- caller enumerates them). Inserts every date in ONE transaction; ANY partial-
-- unique conflict RAISEs and rolls the whole bundle back (true all-or-nothing,
-- mirrors book_season_atomic). No advisory lock needed — the partial-unique
-- index is the guard (each spot+date is a single slot). Snapshots the spot's
-- current base_price_cents (active + in-market) onto every row. The caller
-- computes fee totals from the returned per-date prices via pricing.ts.
CREATE OR REPLACE FUNCTION book_park_spot_atomic(
  p_vendor_profile_id UUID,
  p_market_id         UUID,
  p_spot_id           UUID,
  p_booking_dates     DATE[],
  p_group_id          UUID,           -- nullable: NULL for a single-date booking
  p_acceptance_id     UUID            -- nullable (P5)
)
RETURNS TABLE (
  booking_id           UUID,
  booked_date          DATE,
  booking_price_cents  INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date  DATE;
  v_price INTEGER;
  v_id    UUID;
BEGIN
  IF array_length(p_booking_dates, 1) IS NULL THEN
    RAISE EXCEPTION 'NO_DATES' USING ERRCODE = 'P0006';
  END IF;

  SELECT ps.base_price_cents INTO v_price
    FROM park_spots ps
    WHERE ps.id = p_spot_id AND ps.market_id = p_market_id AND ps.active = true;
  IF v_price IS NULL THEN
    RAISE EXCEPTION 'SPOT_NOT_FOUND' USING ERRCODE = 'P0003';
  END IF;

  FOREACH v_date IN ARRAY p_booking_dates LOOP
    BEGIN
      INSERT INTO park_spot_bookings (
        market_id, vendor_profile_id, spot_id, booking_date,
        price_cents, status, booking_group_id, agreement_acceptance_id
      ) VALUES (
        p_market_id, p_vendor_profile_id, p_spot_id, v_date,
        v_price, 'pending_payment', p_group_id, p_acceptance_id
      )
      RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      -- Either the spot is taken that day, or this vendor already holds a spot
      -- that day. Name the date so the caller can tell the truck which to drop.
      RAISE EXCEPTION 'SPOT_DATE_TAKEN date=%', to_char(v_date, 'YYYY-MM-DD')
        USING ERRCODE = 'P0001';
    END;

    booking_id := v_id;
    booked_date := v_date;
    booking_price_cents := v_price;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION book_park_spot_atomic IS
  'FT park-manager P2a: all-or-nothing booking of ONE spot across N dates (single date = array of 1; prepay-week = the week''s operating dates). Inserts all in one tx; any partial-unique conflict RAISEs SPOT_DATE_TAKEN (naming the date) and rolls back the whole bundle. Snapshots park_spots.base_price_cents onto each row. Caller: /api/vendor/markets/[id]/book-park-spot via service client. Fee totals computed by pricing.ts.';

-- Lock down: SECURITY DEFINER + default PUBLIC grant would expose to anon.
-- Mirror book_season_atomic (migs 165): REVOKE FROM PUBLIC + anon; grant service_role.
REVOKE EXECUTE ON FUNCTION
  book_park_spot_atomic(uuid, uuid, uuid, date[], uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION
  book_park_spot_atomic(uuid, uuid, uuid, date[], uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION
  book_park_spot_atomic(uuid, uuid, uuid, date[], uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION (run after apply):
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name='park_spot_bookings';   -- expect 1
-- SELECT proname FROM pg_proc WHERE proname='book_park_spot_atomic';    -- expect 1
-- SELECT indexname FROM pg_indexes WHERE tablename='park_spot_bookings'; -- expect 5
-- ============================================================================
