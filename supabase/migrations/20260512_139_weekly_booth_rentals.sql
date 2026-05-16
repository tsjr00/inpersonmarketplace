-- Migration 139: weekly_booth_rentals
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- To revert this migration on any environment, run as a single transaction:
--
--   BEGIN;
--   DROP TRIGGER IF EXISTS trg_wbr_inventory_market ON weekly_booth_rentals;
--   DROP TRIGGER IF EXISTS trg_wbr_updated_at ON weekly_booth_rentals;
--   DROP FUNCTION IF EXISTS check_weekly_booth_rental_inventory_market();
--   DROP FUNCTION IF EXISTS update_weekly_booth_rentals_updated_at();
--   DROP TABLE IF EXISTS weekly_booth_rentals CASCADE;
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
--
-- Risk profile:
--   PRE-application or DEV-only: zero data loss; safe.
--   POST-application on Staging/Prod where vendors have placed bookings:
--     ROLLBACK DELETES ALL BOOKING HISTORY. Coordinate with the user
--     before running — there is no undo for the booking record loss.
--   The CASCADE handles Phase C dependents (Stripe column data, etc.).
--
-- Dependency: mig 138 (vendor_market_agreement_acceptances) MUST be
--   applied first — agreement_acceptance_id FK below depends on it.
-- =============================================================================
--
-- Tracks weekly booth rental bookings (vendor → market → week → booth
-- inventory tier). Per Market Manager v2 plan §5 — foundation for the
-- Phase B booking flow + Phase C payment integration.
--
-- One row per booking. A vendor can book at most one week × market slot
-- per booking (UNIQUE constraint). Re-booking the same slot would fail —
-- to change the booth size, the vendor cancels and re-books.
--
-- price_cents is a SNAPSHOT of the inventory price at booking time. The
-- manager can change market_booth_inventory.weekly_price_cents later
-- without affecting existing bookings. This is intentional — once a
-- vendor sees a price and commits, that price is locked in.
--
-- status uses a CHECK constraint (not a PG enum) for ease of evolution.
-- Adding new states later doesn't require ALTER TYPE.
--
-- agreement_acceptance_id links each booking to which vendor_market_agreement
-- acceptance row was current at booking time. This is the "signed
-- agreement at time of payment" record per v2 plan §7.
--
-- The same-market integrity trigger prevents inventory_id from referring
-- to a tier at a different market — matches mig 135's pattern for
-- market_booth_placeholders.
--
-- Stripe columns are present but UNUSED in this migration. They'll be
-- populated in Phase C when Stripe Connect for managers ships.
--
-- RLS: enabled with NO POLICIES — default-deny except service_role. API
-- routes use service client with auth verified upstream (isMarketManager
-- for manager reads; vendor-self for vendor reads).

CREATE TABLE IF NOT EXISTS weekly_booth_rentals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE RESTRICT,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  inventory_id UUID NOT NULL REFERENCES market_booth_inventory(id) ON DELETE RESTRICT,
  -- Assigned by manager post-booking. Null = needs assignment.
  booth_number TEXT,
  -- Snapshot at booking time. Locks in price even if manager later changes
  -- market_booth_inventory.weekly_price_cents.
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','paid','cancelled','completed')),
  -- Stripe Connect plumbing — populated in Phase C.
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  -- Links to the agreement acceptance current at booking time.
  agreement_acceptance_id UUID REFERENCES vendor_market_agreement_acceptances(id),
  booked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One booking per vendor per market per week.
  UNIQUE (vendor_profile_id, market_id, week_start_date)
);

COMMENT ON TABLE weekly_booth_rentals IS
  'Weekly booth rental bookings. Vendor → market → week → inventory tier. price_cents is a snapshot. status: pending_payment | paid | cancelled | completed.';

COMMENT ON COLUMN weekly_booth_rentals.price_cents IS
  'Snapshot of market_booth_inventory.weekly_price_cents at booking time. Manager can change inventory pricing later without affecting existing bookings.';

COMMENT ON COLUMN weekly_booth_rentals.agreement_acceptance_id IS
  'FK to vendor_market_agreement_acceptances. Links each booking to the agreement snapshot the vendor signed at booking time.';

-- Manager view: "this week's bookings"
CREATE INDEX idx_wbr_market_week ON weekly_booth_rentals(market_id, week_start_date);

-- Vendor view: "my upcoming/past bookings"
CREATE INDEX idx_wbr_vendor_week ON weekly_booth_rentals(vendor_profile_id, week_start_date);

-- Manager filtered view: "this week's paid bookings"
CREATE INDEX idx_wbr_market_week_status ON weekly_booth_rentals(market_id, week_start_date, status);

-- Same-market integrity: inventory_id MUST belong to this row's market_id.
-- Mirrors mig 135's pattern for market_booth_placeholders → inventory.
CREATE OR REPLACE FUNCTION check_weekly_booth_rental_inventory_market()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.inventory_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM market_booth_inventory
    WHERE id = NEW.inventory_id AND market_id = NEW.market_id
  ) THEN
    RAISE EXCEPTION 'inventory_id % does not belong to market_id %', NEW.inventory_id, NEW.market_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wbr_inventory_market ON weekly_booth_rentals;
CREATE TRIGGER trg_wbr_inventory_market
  BEFORE INSERT OR UPDATE OF market_id, inventory_id ON weekly_booth_rentals
  FOR EACH ROW
  EXECUTE FUNCTION check_weekly_booth_rental_inventory_market();

-- Updated-at trigger (matches mig 134's pattern).
CREATE OR REPLACE FUNCTION update_weekly_booth_rentals_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wbr_updated_at ON weekly_booth_rentals;
CREATE TRIGGER trg_wbr_updated_at
  BEFORE UPDATE ON weekly_booth_rentals
  FOR EACH ROW
  EXECUTE FUNCTION update_weekly_booth_rentals_updated_at();

-- RLS default-deny (matches mig 137 pattern). API routes use service client.
ALTER TABLE weekly_booth_rentals ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
