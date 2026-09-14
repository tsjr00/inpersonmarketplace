-- ============================================================================
-- Migration 243: vendor_offers + discount plumbing columns (Phase B1)
--                owner decisions 2026-09-04 (decisions.md "VIP buildout
--                unblocked + perk-menu model" #2/#5): vendor-funded VIP perks,
--                chunk-D gate re-opened for vendor-funded only.
-- ============================================================================
-- PASTE-AND-GO class. ADDITIVE table + columns, INERT ON ARRIVAL: vendor_offers
-- is empty (no perk UI exists yet to create rows), order_items.discount_cents
-- defaults 0 and orders.discount_cents defaults 0 — every existing money path
-- reads exactly the numbers it read yesterday. The first discount can only
-- happen after a vendor enables a perk in the Phase B UI.
--
-- THE DESIGN KEY (loyalty_program_research.md "store subtotal NET"):
-- `order_items.subtotal_cents` is stored as the POST-DISCOUNT amount;
-- `unit_price_cents` keeps the list price; `discount_cents` + `offer_id` are
-- the record. Every refund path (reject, resolve-issue, expire-orders,
-- cancel-date-cascade) RECOMPUTES buyer-paid from subtotal_cents — storing net
-- means they are all correct BY CONSTRUCTION, zero edits. Fees compute on the
-- post-discount price (owner 2026-08-25) and sales tax (chunk D) will read the
-- same net number — "we want taxes to be clean and easy" (owner 2026-09-04).
--
-- vendor_offers = the perk MENU (owner: "we need to pick some benefits and
-- they turn them off or on"). One row per (vendor, kind); VENDOR-FUNDED only
-- (platform-funded stays behind chunk D). VIP-only for the feedback round —
-- eligibility is checked against vendor_vip_customers at checkout.
--   kind 'punch_card':      config {"visits": int, "reward_pct": int}
--   kind 'spend_threshold': config {"threshold_cents": int, "pct": int}
-- Bounds are enforced in code (vendor-offers route) from named constants —
-- Q5/Q6 owner answers land there, not in a CHECK, so tuning needs no migration.
--
-- RLS enabled, no policies: service-client only (house pattern).
--
-- Post-check:
--   SELECT to_regclass('public.vendor_offers');                    -- name
--   SELECT count(*) FROM vendor_offers;                            -- 0
--   SELECT column_name, column_default FROM information_schema.columns
--    WHERE table_name='order_items' AND column_name IN ('discount_cents','offer_id');
--   SELECT column_name, column_default FROM information_schema.columns
--    WHERE table_name='orders' AND column_name='discount_cents';
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendor_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  vertical_id TEXT NOT NULL REFERENCES verticals(vertical_id),
  kind TEXT NOT NULL CHECK (kind IN ('punch_card', 'spend_threshold')),
  enabled BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vendor_profile_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_vendor_offers_vendor ON vendor_offers(vendor_profile_id) WHERE enabled = true;

ALTER TABLE vendor_offers ENABLE ROW LEVEL SECURITY;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS discount_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS offer_id UUID REFERENCES vendor_offers(id) ON DELETE SET NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_cents INTEGER NOT NULL DEFAULT 0;

COMMENT ON TABLE vendor_offers IS
  'VIP perk menu (mig 243, Phase B of vip_loyalty_buildout_plan.md): vendor-funded, vendor-toggled benefits for their VIP customers. subtotal_cents on order_items is stored NET of these discounts (unit_price_cents keeps list; discount_cents+offer_id are the record) so refunds, fees, reports and future tax all read the true amount with no path edits.';

-- ROLLBACK: ALTER TABLE orders DROP COLUMN discount_cents;
--           ALTER TABLE order_items DROP COLUMN offer_id, DROP COLUMN discount_cents;
--           DROP TABLE vendor_offers;
