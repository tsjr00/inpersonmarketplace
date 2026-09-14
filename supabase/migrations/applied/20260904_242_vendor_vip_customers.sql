-- ============================================================================
-- Migration 242: vendor_vip_customers — VIP designation core (A2)
--                owner decisions 2026-09-04 (decisions.md "VIP buildout
--                unblocked + perk-menu model") + Q1 slots free 0/pro 10/boss 25
-- ============================================================================
-- PASTE-AND-GO class. ADDITIVE new table, empty on arrival, INERT until a
-- vendor tags their first VIP through the Your Customers report.
--
-- WHY
-- Pro/Boss vendors tag their best customers as VIPs (recognition first — the
-- buyer is notified, the vendor sees a star at pickup and keeps private
-- notes). Perks attach in Phase B (vendor-toggled menu: punch card +
-- spend-threshold discount, VIP-only for the feedback round). VIP was
-- unblocked from flash sales 2026-09-04; slot caps live in vendor-limits.ts
-- (TierLimits.vipCustomers), enforced by the add route — not by the schema,
-- so a tier downgrade never deletes rows (existing VIPs keep their status;
-- the cap gates ADDING).
--
-- RLS enabled, no policies: service-client only (the house pattern for
-- vendor-relationship tables — routes do their own auth + scoping).
--
-- Post-check:
--   SELECT to_regclass('public.vendor_vip_customers');  -- expect the name
--   SELECT count(*) FROM vendor_vip_customers;          -- expect 0
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendor_vip_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  buyer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The vendor's private notes about this customer ("always orders the
  -- brisket", "works Fridays"). Never shown to the buyer.
  notes TEXT,
  UNIQUE (vendor_profile_id, buyer_user_id)
);

CREATE INDEX IF NOT EXISTS idx_vip_customers_vendor ON vendor_vip_customers(vendor_profile_id);
CREATE INDEX IF NOT EXISTS idx_vip_customers_buyer ON vendor_vip_customers(buyer_user_id);

ALTER TABLE vendor_vip_customers ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE vendor_vip_customers IS
  'VIP designation (mig 242, A2 of vip_loyalty_buildout_plan.md): a vendor''s hand-picked best customers. Slot caps = TierLimits.vipCustomers (0/10/25), enforced at add time in the route. Phase B perks (punch card, spend-threshold discount) key off these rows.';

-- ROLLBACK: DROP TABLE vendor_vip_customers;
