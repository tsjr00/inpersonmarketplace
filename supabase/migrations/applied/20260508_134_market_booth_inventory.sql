-- Migration 134: Market booth inventory
--
-- Adds the per-market booth inventory table that backs Phase 2 of the
-- market manager v2 plan (manager onboarding step "Booth inventory" +
-- the weekly booth rental flow).
--
-- Each row represents a booth size tier within a market: how many of
-- that size exist, the dimensions, and the per-week rental price. A
-- market with all-same-size booths is a single row; a market with
-- multiple sizes (e.g., 10x10 vs 10x20) is multiple rows.
--
-- Booth-to-vendor assignment lives in `market_vendors.booth_number`
-- (existing column from migration 001). This inventory table is the
-- "what booths exist and what they cost" side; the vendors junction is
-- the "who is assigned where" side.
--
-- Off-platform-vendor placeholder tracking ("booth N is occupied by a
-- vendor not on our platform") is a separate concern, deferred to a
-- later migration alongside the manager onboarding UI.
--
-- RLS: not enabled in this migration. Route-layer auth via
-- isMarketManager() helper enforces access. Adding RLS becomes
-- mandatory only if/when client-side queries hit the table directly.

CREATE TABLE IF NOT EXISTS market_booth_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  size_label TEXT NOT NULL,
  dimensions TEXT,
  count INTEGER NOT NULL CHECK (count >= 0),
  weekly_price_cents INTEGER NOT NULL CHECK (weekly_price_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (market_id, size_label)
);

COMMENT ON TABLE market_booth_inventory IS
  'Per-market booth size tiers. Manager sets count + weekly_price_cents per size during onboarding. Booth assignment to vendors lives on market_vendors.booth_number.';

COMMENT ON COLUMN market_booth_inventory.size_label IS
  'Human-readable size identifier set by manager (e.g., "10x10", "Standard", "Premium"). Unique within a market.';

COMMENT ON COLUMN market_booth_inventory.dimensions IS
  'Optional human-readable dimensions display (e.g., "10ft × 10ft"). Free-form text; not used for matching.';

COMMENT ON COLUMN market_booth_inventory.weekly_price_cents IS
  'Per-week rental price the vendor pays for this booth size. The 6.5% markup model applies on both sides at the booth-rental transaction (vendor pays 1.065×, manager receives 0.935×, platform keeps the spread).';

-- Lookup index — manager dashboard queries booth inventory by market_id
-- on every dashboard load that includes booth-related surfaces.
CREATE INDEX IF NOT EXISTS idx_market_booth_inventory_market
  ON market_booth_inventory(market_id);

-- Auto-update `updated_at` on row mutation (matches the pattern used by
-- market_vendors and other tables across the schema).
CREATE OR REPLACE FUNCTION update_market_booth_inventory_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_market_booth_inventory_updated_at ON market_booth_inventory;
CREATE TRIGGER trg_market_booth_inventory_updated_at
  BEFORE UPDATE ON market_booth_inventory
  FOR EACH ROW
  EXECUTE FUNCTION update_market_booth_inventory_updated_at();

NOTIFY pgrst, 'reload schema';
