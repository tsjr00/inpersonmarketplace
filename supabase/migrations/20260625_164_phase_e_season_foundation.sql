-- Migration 164: Phase E foundation — season prepay + booth booking groups
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
--   ALTER TABLE weekly_booth_rentals DROP COLUMN IF EXISTS group_id;
--   ALTER TABLE markets DROP COLUMN IF EXISTS schedule_confirmed_at;
--   DROP TABLE IF EXISTS booth_booking_groups CASCADE;
--   DROP TABLE IF EXISTS market_seasons CASCADE;
--   DROP FUNCTION IF EXISTS check_booth_group_market_integrity();
--   NOTIFY pgrst, 'reload schema';
-- COMMIT;
--
-- Risk: ADDITIVE ONLY. Pre-application or Dev-only: zero data loss.
--   Post-application with live data: rollback DROPs the two new tables (season +
--   group records lost) and the group_id column (group linkage lost) — but child
--   weekly_booth_rentals rows are NOT deleted (group_id is nullable, SET NULL).
--
-- Dependencies: markets (mig 001), vendor_profiles, market_booth_inventory
--   (mig 134), weekly_booth_rentals (mig 139), vendor_market_agreement_acceptances
--   (mig 138). Shared trigger fn update_updated_at_column() (pre-existing; used by
--   mig 160).
-- =============================================================================
--
-- Phase E design doc: apps/web/.claude/phase_e_booth_granularity_prepay_plan.md.
-- This is the FOUNDATION (additive tables + columns). The season/partial booking
-- route, money path, settlement, and booth_credits ledger ship in later steps.
--
-- DESIGN ANCHORS (plan §8 decisions):
--   * O6 — market_seasons is a SEPARATE table (Option B). markets.season_start/end
--     stays the availability gate; this table is the prepay/commitment/settlement
--     record. Presales: manager-flips prepay_open (60-day lead cap enforced in the
--     route), ONE open season per market at a time, auto-close at start_date+14d.
--   * Group model — booth_booking_groups is the parent; each child
--     weekly_booth_rentals row keeps its OWN status (source of truth) and carries
--     group_id. One-off bookings leave group_id NULL → existing flow untouched.

-- ---------------------------------------------------------------------------
-- 1. market_seasons
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  -- O1: derived from market_schedules (minus cancelled overrides), manager-confirmed.
  declared_market_days INTEGER,
  -- O2: floor(10% of declared_market_days), min 1; platform ceiling = 15% (route-enforced).
  refund_cap_days INTEGER NOT NULL DEFAULT 1 CHECK (refund_cap_days >= 0),
  -- O6: manager-flipped; the open-route enforces the <=60-day lead cap.
  prepay_open BOOLEAN NOT NULL DEFAULT false,
  prepay_opened_at TIMESTAMPTZ,
  -- O6: = start_date + 14 days (PRESALE_GRACE_DAYS), or earlier if sold out.
  prepay_closes_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','open','active','ended','settled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT market_seasons_dates_ok CHECK (end_date >= start_date)
);

COMMENT ON TABLE market_seasons IS
  'Phase E: a pre-sellable season window per market (Option B, O6). markets.season_start/end stays the availability gate; this is the prepay/settlement record. prepay_open is manager-flipped (60-day lead cap enforced in the open-route). status: draft|open|active|ended|settled.';

CREATE INDEX IF NOT EXISTS idx_market_seasons_market_start
  ON market_seasons(market_id, start_date);

-- O6: at most ONE open prepay season per market at a time (one-season-ahead rule).
CREATE UNIQUE INDEX IF NOT EXISTS uq_market_seasons_one_open
  ON market_seasons(market_id) WHERE prepay_open = true;

DROP TRIGGER IF EXISTS trg_market_seasons_updated_at ON market_seasons;
CREATE TRIGGER trg_market_seasons_updated_at
  BEFORE UPDATE ON market_seasons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS default-deny, NO policies: service-client only behind isMarketManager
-- (mirrors migs 137/157/160/161).
ALTER TABLE market_seasons ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. booth_booking_groups
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS booth_booking_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE RESTRICT,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  inventory_id UUID NOT NULL REFERENCES market_booth_inventory(id) ON DELETE RESTRICT,
  -- NULL for ad-hoc partial purchases not tied to a declared season.
  season_id UUID REFERENCES market_seasons(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('season','partial')),
  week_count INTEGER NOT NULL CHECK (week_count > 0),
  -- Audit totals (sum of per-week calculateBoothRentalFees). The Stripe charge +
  -- destination transfer are derived from the child rows at checkout time.
  total_vendor_cents INTEGER NOT NULL CHECK (total_vendor_cents >= 0),
  total_manager_cents INTEGER NOT NULL CHECK (total_manager_cents >= 0),
  -- O6 late-buyer settlement cutoff: cancellations counted from here forward.
  purchase_date DATE,
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','paid','cancelled')),
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  agreement_acceptance_id UUID REFERENCES vendor_market_agreement_acceptances(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE booth_booking_groups IS
  'Phase E: one row per "vendor bought a set of weeks in one payment" (season or partial). Child weekly_booth_rentals carry group_id; one-off bookings leave it NULL. Each child keeps its own status (source of truth) — this row tracks the payment + group totals.';

CREATE INDEX IF NOT EXISTS idx_booth_groups_vendor
  ON booth_booking_groups(vendor_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booth_groups_market
  ON booth_booking_groups(market_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booth_groups_season
  ON booth_booking_groups(season_id) WHERE season_id IS NOT NULL;

-- Same-market integrity: inventory_id (and season_id, if set) must belong to this
-- row's market_id. Mirrors mig 139's check_weekly_booth_rental_inventory_market.
CREATE OR REPLACE FUNCTION check_booth_group_market_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM market_booth_inventory
    WHERE id = NEW.inventory_id AND market_id = NEW.market_id
  ) THEN
    RAISE EXCEPTION 'inventory_id % does not belong to market_id %', NEW.inventory_id, NEW.market_id;
  END IF;
  IF NEW.season_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM market_seasons
    WHERE id = NEW.season_id AND market_id = NEW.market_id
  ) THEN
    RAISE EXCEPTION 'season_id % does not belong to market_id %', NEW.season_id, NEW.market_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booth_group_market ON booth_booking_groups;
CREATE TRIGGER trg_booth_group_market
  BEFORE INSERT OR UPDATE OF market_id, inventory_id, season_id ON booth_booking_groups
  FOR EACH ROW EXECUTE FUNCTION check_booth_group_market_integrity();

DROP TRIGGER IF EXISTS trg_booth_groups_updated_at ON booth_booking_groups;
CREATE TRIGGER trg_booth_groups_updated_at
  BEFORE UPDATE ON booth_booking_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS default-deny, NO policies: service-client only; routes enforce vendor-self /
-- isMarketManager upstream (mig 137/139 pattern).
ALTER TABLE booth_booking_groups ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. weekly_booth_rentals.group_id (link child rentals to their group)
-- ---------------------------------------------------------------------------
ALTER TABLE weekly_booth_rentals
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES booth_booking_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wbr_group
  ON weekly_booth_rentals(group_id) WHERE group_id IS NOT NULL;

COMMENT ON COLUMN weekly_booth_rentals.group_id IS
  'Phase E: links a per-week rental to its booth_booking_groups parent (season/partial). NULL = standalone one-off booking (pre-Phase-E behavior, unchanged).';

-- ---------------------------------------------------------------------------
-- 4. markets.schedule_confirmed_at (O1: manager confirms schedule accuracy)
-- ---------------------------------------------------------------------------
ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS schedule_confirmed_at TIMESTAMPTZ;

COMMENT ON COLUMN markets.schedule_confirmed_at IS
  'Phase E (O1): when the manager last confirmed their market_schedules are accurate. Season setup requires this set (season day-enumeration derives from market_schedules).';

NOTIFY pgrst, 'reload schema';
