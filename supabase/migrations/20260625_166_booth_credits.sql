-- Migration 166: booth_credits — Phase E settlement/cancel credit ledger
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
--   DROP TABLE IF EXISTS booth_credits CASCADE;
--   NOTIFY pgrst, 'reload schema';
-- COMMIT;
--
-- Risk: additive (new table). No data loss on rollback unless credits exist.
-- Dependencies: vendor_profiles, markets (mig 001), booth_booking_groups (mig 164).
-- =============================================================================
--
-- Phase E credit ledger. A vendor's booth credit at a market is the SUM of rows
-- here (positive = granted, negative = redeemed). Credit is the credit-first
-- settlement currency (O4/O5): money never moves backward through Stripe — the
-- manager already holds it from the destination charge — so a cancel/settlement
-- grants a claim against future booth bookings at THIS market instead of a refund.
--
-- source:
--   season_settlement   — granted at season end when cancelled days > cap (O4)
--   vendor_cancel_pre    — vendor self-cancel BEFORE season start = full credit (O5)
--   vendor_cancel_post   — vendor self-cancel AFTER start = remaining value − penalty (O5)
--   redeemed             — negative row when credit is applied to a future booking

CREATE TABLE IF NOT EXISTS booth_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE RESTRICT,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,  -- positive = granted, negative = redeemed
  source TEXT NOT NULL CHECK (source IN ('season_settlement','vendor_cancel_pre','vendor_cancel_post','redeemed')),
  related_group_id UUID REFERENCES booth_booking_groups(id) ON DELETE SET NULL,
  note TEXT,
  expires_at TIMESTAMPTZ,           -- reserved; NULL = no expiry in v1
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE booth_credits IS
  'Phase E credit ledger (credit-first settlement, O4/O5). Vendor balance at a market = SUM(amount_cents) for (vendor_profile_id, market_id). Positive = granted, negative = redeemed. No money moves through Stripe — credit is a claim against future booth bookings at this market.';

-- Balance lookup: SUM amount_cents per (vendor, market).
CREATE INDEX IF NOT EXISTS idx_booth_credits_vendor_market
  ON booth_credits(vendor_profile_id, market_id);

-- RLS default-deny, NO policies: service-client only (routes gate vendor-self /
-- isMarketManager upstream — migs 137/164 pattern).
ALTER TABLE booth_credits ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
