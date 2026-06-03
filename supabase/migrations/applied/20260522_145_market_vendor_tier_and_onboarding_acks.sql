-- Migration 145: market_vendors.inventory_id + onboarding ack columns
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- To revert this migration on any environment, run as a single transaction:
--
--   BEGIN;
--   DROP TRIGGER IF EXISTS trg_market_vendor_inventory_market ON market_vendors;
--   DROP FUNCTION IF EXISTS check_market_vendor_inventory_market();
--   ALTER TABLE market_vendors DROP COLUMN IF EXISTS inventory_id;
--   ALTER TABLE markets
--     DROP COLUMN IF EXISTS onboarding_no_existing_vendors_ack,
--     DROP COLUMN IF EXISTS onboarding_no_placeholders_ack;
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
--
-- Risk profile:
--   PRE-application or DEV-only: zero data loss; safe.
--   POST-application with manager-set tier values populated: ROLLBACK
--     drops the tier column and loses those assignments. Markets that
--     already had bookings continue to work (tier is informational; the
--     booking flow doesn't depend on this column). Coordinate before
--     running on Prod.
--
-- Dependencies:
--   - mig 001 (market_vendors, markets — both pre-existing)
--   - mig 134 (market_booth_inventory — FK target)
--   - mig 135 (placeholder same-market trigger pattern — we mirror it here)
-- =============================================================================
--
-- What this migration does:
--
-- 1. Adds `market_vendors.inventory_id UUID NULL REFERENCES
--    market_booth_inventory(id) ON DELETE SET NULL` — declares which
--    booth size tier each on-platform vendor occupies at the market.
--    Today the system has `booth_number` (free-form text) but no link
--    to a size tier, so capacity math + occupancy grid don't know
--    which tier each existing vendor is in. Same-market integrity
--    enforced by trigger below.
--
-- 2. Adds same-market integrity trigger `check_market_vendor_inventory_market`
--    mirroring mig 135's pattern for placeholders. Prevents cross-market
--    inventory_id assignment if the API layer is bypassed.
--
-- 3. Adds two onboarding ack columns to `markets`:
--      - `onboarding_no_existing_vendors_ack BOOLEAN NOT NULL DEFAULT FALSE`
--      - `onboarding_no_placeholders_ack BOOLEAN NOT NULL DEFAULT FALSE`
--    These let the manager explicitly skip the "existing vendors" and
--    "off-platform placeholders" steps during onboarding by checking
--    a box that says "I have none of these at my market yet." Without
--    the ack the step counts as incomplete (the manager must add at
--    least one row OR ack the skip).
--
-- Note on backward compat: existing market_vendors rows get inventory_id
-- NULL. UI shows "tier not set" warning. Manager fills in over time.
-- Booking flow + RPC continue to work — they don't query this column.

-- ----------------------------------------------------------------------------
-- 1. New column on market_vendors
-- ----------------------------------------------------------------------------

ALTER TABLE market_vendors
  ADD COLUMN IF NOT EXISTS inventory_id UUID
    REFERENCES market_booth_inventory(id) ON DELETE SET NULL;

COMMENT ON COLUMN market_vendors.inventory_id IS
  'Optional link to the market_booth_inventory size tier this vendor occupies. ON DELETE SET NULL preserves the vendor row if the manager removes the tier. Same-market integrity enforced by trigger.';

-- Index for "vendors in tier X at market Y" lookups
CREATE INDEX IF NOT EXISTS idx_market_vendors_inventory
  ON market_vendors(inventory_id)
  WHERE inventory_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Same-market integrity trigger (mirrors mig 135 pattern)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_market_vendor_inventory_market()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.inventory_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM market_booth_inventory
      WHERE id = NEW.inventory_id
        AND market_id = NEW.market_id
    ) THEN
      RAISE EXCEPTION 'market_vendors.inventory_id % does not belong to market %',
        NEW.inventory_id, NEW.market_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_market_vendor_inventory_market ON market_vendors;
CREATE TRIGGER trg_market_vendor_inventory_market
  BEFORE INSERT OR UPDATE OF market_id, inventory_id
  ON market_vendors
  FOR EACH ROW
  EXECUTE FUNCTION check_market_vendor_inventory_market();

-- ----------------------------------------------------------------------------
-- 3. Onboarding ack columns on markets
-- ----------------------------------------------------------------------------

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS onboarding_no_existing_vendors_ack BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS onboarding_no_placeholders_ack BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN markets.onboarding_no_existing_vendors_ack IS
  'Manager-confirmed acknowledgment: "I have no existing on-platform vendors at this market yet." When TRUE, the onboarding "vendors" step counts as complete even with zero market_vendors rows. Manager checks the box explicitly during onboarding.';

COMMENT ON COLUMN markets.onboarding_no_placeholders_ack IS
  'Manager-confirmed acknowledgment: "I have no off-platform vendor placeholders at this market yet." When TRUE, the onboarding "placeholders" step counts as complete even with zero market_booth_placeholders rows.';

NOTIFY pgrst, 'reload schema';
