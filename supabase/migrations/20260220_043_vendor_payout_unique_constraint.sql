-- Migration: Add unique constraint on vendor_payouts(order_item_id)
-- Created: 2026-02-20
-- Description: Prevents duplicate payouts for the same order item at the
--   database level. Application code already checks for existing payouts
--   before inserting, but this adds a safety net.
--
-- Issue: C4 from Session 41 audit — no DB-level uniqueness enforcement
--
-- Uses a partial unique index so failed payouts can be retried (a new
-- payout row with a different status can be created after a failed one).
--
-- Applied to:
-- [ ] Staging
-- [ ] Production
-- [ ] Dev

-- Only one non-failed payout per order item
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_payouts_order_item_unique
  ON vendor_payouts (order_item_id)
  WHERE status NOT IN ('failed', 'cancelled');
