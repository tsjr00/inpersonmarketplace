-- ============================================================================
-- Migration 107: Add FK constraint on market_vendors.replaced_vendor_id
-- ============================================================================
-- The replaced_vendor_id column (added in migration 103) tracks which vendor
-- was replaced when a backup vendor is escalated. It had no FK constraint,
-- allowing dangling references if a vendor profile is deleted.
--
-- ON DELETE SET NULL: if the referenced vendor is deleted, the field becomes
-- NULL rather than blocking the delete. The historical context is lost but
-- no process fails silently.
-- ============================================================================

ALTER TABLE market_vendors
  ADD CONSTRAINT fk_market_vendors_replaced_vendor
  FOREIGN KEY (replaced_vendor_id)
  REFERENCES vendor_profiles(id)
  ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
