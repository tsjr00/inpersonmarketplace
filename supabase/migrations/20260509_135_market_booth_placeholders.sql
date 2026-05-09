-- Migration 135: Market booth placeholders (off-platform vendor occupancy)
--
-- Lets a manager mark a booth_number as occupied by a vendor who is NOT on the
-- platform. The placeholder records the booth_number and (optionally) which
-- size tier from market_booth_inventory the booth belongs to. No vendor
-- identity is captured — privacy-respecting, just occupancy tracking.
--
-- This is the manager-tracked equivalent of a market_vendors row for vendors
-- who haven't onboarded yet. Phase A of the Market Manager v2 plan.
--
-- Why a separate table (vs. a flag on market_vendors): off-platform booths
-- don't have a vendor_profile_id, and market_vendors enforces a NOT NULL FK
-- on that column. Forcing nullability there would weaken referential
-- integrity on the platform-vendor side. Separate table is cleaner.
--
-- Why FK on inventory_id (not size_label TEXT): codebase uniformly uses
-- single-column UUID FKs. ON DELETE SET NULL gives predictable behavior if a
-- manager removes a size tier. The same-market trigger below prevents
-- cross-market id spoofing.
--
-- RLS: not enabled — route-layer auth via isMarketManager() helper enforces
-- access. Same pattern as migration 134 (market_booth_inventory).

CREATE TABLE IF NOT EXISTS market_booth_placeholders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  inventory_id UUID REFERENCES market_booth_inventory(id) ON DELETE SET NULL,
  booth_number TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (market_id, booth_number)
);

COMMENT ON TABLE market_booth_placeholders IS
  'Manager-tracked booth occupancy for vendors not on the platform. No vendor identity captured — just booth_number + optional size tier link.';

COMMENT ON COLUMN market_booth_placeholders.inventory_id IS
  'Optional link to a market_booth_inventory row, identifying which size tier this booth belongs to. Same-market integrity enforced by trg_booth_placeholder_inventory_market trigger. ON DELETE SET NULL: if the size tier is deleted, the placeholder remains and the manager can re-link.';

COMMENT ON COLUMN market_booth_placeholders.booth_number IS
  'Manager-set booth identifier (e.g., "12", "A3", "Pavilion-North-12"). Format is free-form to match the format of market_vendors.booth_number for the same market.';

CREATE INDEX IF NOT EXISTS idx_market_booth_placeholders_market
  ON market_booth_placeholders(market_id);

CREATE INDEX IF NOT EXISTS idx_market_booth_placeholders_inventory
  ON market_booth_placeholders(inventory_id)
  WHERE inventory_id IS NOT NULL;

-- Same-market integrity check: inventory_id (when set) must reference a
-- market_booth_inventory row whose market_id matches the placeholder's
-- market_id. Prevents cross-market id spoofing if the API layer is bypassed.
CREATE OR REPLACE FUNCTION check_booth_placeholder_inventory_market()
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
      RAISE EXCEPTION 'market_booth_placeholders.inventory_id % does not belong to market %',
        NEW.inventory_id, NEW.market_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booth_placeholder_inventory_market
  ON market_booth_placeholders;
CREATE TRIGGER trg_booth_placeholder_inventory_market
  BEFORE INSERT OR UPDATE OF market_id, inventory_id
  ON market_booth_placeholders
  FOR EACH ROW
  EXECUTE FUNCTION check_booth_placeholder_inventory_market();

-- Auto-update updated_at on row mutation (matches mig 134 pattern).
CREATE OR REPLACE FUNCTION update_market_booth_placeholders_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_market_booth_placeholders_updated_at
  ON market_booth_placeholders;
CREATE TRIGGER trg_market_booth_placeholders_updated_at
  BEFORE UPDATE ON market_booth_placeholders
  FOR EACH ROW
  EXECUTE FUNCTION update_market_booth_placeholders_updated_at();

NOTIFY pgrst, 'reload schema';
