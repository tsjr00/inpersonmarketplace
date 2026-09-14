-- ============================================================================
-- Migration 244: market bundles (B1 core loop + B2 cause columns)
--                owner decisions 2026-09-05 (market_bundles_build_plan.md —
--                all 8 Q&As recorded; B1+B2 same release per Q8).
-- ============================================================================
-- PASTE-AND-GO class. ADDITIVE tables + columns + 2 RPCs, INERT ON ARRIVAL:
-- market_bundles is empty (no manager UI exists yet to create rows),
-- orders.bundle_margin_cents defaults 0, vendor_profiles.bundles_opt_out
-- defaults false, listings.covered_container defaults false (dormant until B3)
-- — every existing money path reads exactly the numbers it read yesterday.
-- The first bundle can only exist after the manager UI + admin approval ship.
--
-- THE DESIGN KEY (single-order fan-out, locked over 3 rounds 2026-09-04/05):
-- a bundle purchase expands into ORDINARY component order_items at LIVE vendor
-- prices — vendors' pricing/inventory/payout machinery byte-untouched — plus
-- ONE margin addend on the order. The margin is seller-fee-free, buyer fee
-- applies to the full bundle price, and the margin TRANSFERS ONLY AFTER the
-- manager marks the order handed off (bundle_handed_off_at) ⇒ a pre-handoff
-- cancellation never needs a margin clawback. bundle_margin_transfer_id is the
-- done-flag (deterministic Stripe idempotency key bundle-margin:{order_id}).
--
-- B2 (same release): cause_beneficiary_id + cause_pct on the bundle route a %
-- of the margin to a beneficiary via the EXISTING mig-213 cause rails; the
-- split is computed at transfer time, both legs only after handoff.
--
-- RLS enabled, no policies: service-client only (house pattern).
--
-- Post-check:
--   SELECT to_regclass('public.market_bundles');                    -- name
--   SELECT to_regclass('public.market_bundle_components');          -- name
--   SELECT count(*) FROM market_bundles;                            -- 0
--   SELECT proname FROM pg_proc WHERE proname LIKE '%bundle_sold%'; -- 2 rows
--   SELECT column_name, column_default FROM information_schema.columns
--    WHERE table_name='orders' AND column_name LIKE 'bundle%';
--   SELECT column_name, column_default FROM information_schema.columns
--    WHERE table_name='vendor_profiles' AND column_name='bundles_opt_out';
--   SELECT column_name, column_default FROM information_schema.columns
--    WHERE table_name='listings' AND column_name='covered_container';
-- ============================================================================

CREATE TABLE IF NOT EXISTS market_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  -- Margin is FIXED; bundle price is DERIVED (live component sum + margin).
  margin_cents INTEGER NOT NULL CHECK (margin_cents >= 0),
  quantity_limit INTEGER NOT NULL CHECK (quantity_limit > 0),
  quantity_sold INTEGER NOT NULL DEFAULT 0 CHECK (quantity_sold >= 0),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'active', 'archived', 'rejected')),
  -- The manager's value-add explanation shown to the approving admin (Q6:
  -- no code margin bounds — admin approval is the judgment, this is its input).
  justification TEXT,
  -- B1: a bundle is tied to ONE market day (Q2). Multi-day markets may run
  -- multiple bundles per week, each with its own date. NULL while drafting;
  -- required at submit (enforced in code).
  pickup_market_date DATE,
  pickup_notes TEXT,
  -- B2 cause attachment (Q8 same release): % of the MARGIN to a beneficiary
  -- via the mig-213 cause rails. Both NULL = no cause attached.
  cause_beneficiary_id UUID REFERENCES cause_beneficiaries(id),
  cause_pct INTEGER CHECK (cause_pct >= 1 AND cause_pct <= 100),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_bundles_market ON market_bundles(market_id);
CREATE INDEX IF NOT EXISTS idx_market_bundles_active ON market_bundles(market_id, pickup_market_date)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS market_bundle_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES market_bundles(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bundle_id, listing_id)
);

-- Reverse lookup: "which bundles contain this listing" (auto-unavailable on
-- stockout / vendor opt-out reads this direction).
CREATE INDEX IF NOT EXISTS idx_market_bundle_components_listing
  ON market_bundle_components(listing_id);

ALTER TABLE market_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_bundle_components ENABLE ROW LEVEL SECURITY;

-- Global per-vendor consent (Q from design round 3: DEFAULT-IN, global not
-- per-item; vendors get a one-time intro notification + email with the toggle).
ALTER TABLE vendor_profiles
  ADD COLUMN IF NOT EXISTS bundles_opt_out BOOLEAN NOT NULL DEFAULT false;

-- FT container rule (Q3): listing-level checkbox, DORMANT in B1 — composition
-- enforcement arrives with B3 (FT date-night).
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS covered_container BOOLEAN NOT NULL DEFAULT false;

-- Bundle order plumbing. bundle_margin_transfer_id doubles as the
-- margin-paid flag; bundle_handed_off_at is the transfer gate.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS bundle_id UUID REFERENCES market_bundles(id),
  ADD COLUMN IF NOT EXISTS bundle_margin_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bundle_handed_off_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bundle_margin_transfer_id TEXT;

-- Manager run-sheet + margin-transfer queries read orders by bundle.
CREATE INDEX IF NOT EXISTS idx_orders_bundle ON orders(bundle_id)
  WHERE bundle_id IS NOT NULL;

-- Oversell guard, same race posture as atomic_decrement_inventory (mig
-- 20260206_001 + C-1 raise-on-insufficient): the WHERE clause is the atomic
-- check — two concurrent checkouts cannot both claim the last bundle.
CREATE OR REPLACE FUNCTION atomic_increment_bundle_sold(p_bundle_id UUID, p_quantity INTEGER)
RETURNS TABLE(new_quantity_sold INTEGER)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  UPDATE market_bundles
     SET quantity_sold = quantity_sold + p_quantity,
         updated_at = NOW()
   WHERE id = p_bundle_id
     AND status = 'active'
     AND quantity_sold + p_quantity <= quantity_limit
  RETURNING quantity_sold;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bundle % is sold out or not active', p_bundle_id;
  END IF;
END;
$$;

-- Unwind for cancelled/expired bundle orders (mirrors atomic_restore_inventory:
-- floor at 0, never fails).
CREATE OR REPLACE FUNCTION atomic_release_bundle_sold(p_bundle_id UUID, p_quantity INTEGER)
RETURNS TABLE(new_quantity_sold INTEGER)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  UPDATE market_bundles
     SET quantity_sold = GREATEST(0, quantity_sold - p_quantity),
         updated_at = NOW()
   WHERE id = p_bundle_id
  RETURNING quantity_sold;
END;
$$;

-- Service-role-only execution (house pattern for money-adjacent RPCs).
REVOKE EXECUTE ON FUNCTION atomic_increment_bundle_sold(UUID, INTEGER) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION atomic_release_bundle_sold(UUID, INTEGER) FROM anon, authenticated;

COMMENT ON TABLE market_bundles IS
  'Manager-curated bundles (mig 244, market_bundles_build_plan.md): a bundle checkout expands into ordinary component order_items at live vendor prices plus ONE fixed margin to markets.stripe_account_id. Margin is seller-fee-free, buyer fee applies to the full bundle price, and the margin transfers ONLY after bundle_handed_off_at is set (no-clawback invariant). cause_beneficiary_id/cause_pct route a % of the margin via the mig-213 cause rails.';

-- ROLLBACK: DROP FUNCTION atomic_increment_bundle_sold(UUID, INTEGER);
--           DROP FUNCTION atomic_release_bundle_sold(UUID, INTEGER);
--           ALTER TABLE orders DROP COLUMN bundle_margin_transfer_id,
--             DROP COLUMN bundle_handed_off_at, DROP COLUMN bundle_margin_cents,
--             DROP COLUMN bundle_id;
--           ALTER TABLE listings DROP COLUMN covered_container;
--           ALTER TABLE vendor_profiles DROP COLUMN bundles_opt_out;
--           DROP TABLE market_bundle_components;
--           DROP TABLE market_bundles;
