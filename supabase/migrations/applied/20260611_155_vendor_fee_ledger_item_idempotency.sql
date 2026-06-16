-- ============================================================================
-- Migration 155: vendor_fee_ledger per-item idempotency (Session 92, F1)
-- ============================================================================
-- PROBLEM: recordExternalPaymentFee() is a bare INSERT and vendor_fee_ledger
-- has no uniqueness — every retry path could double-bill a vendor:
--   1. Cron Phase 3.6 (expire-orders) recorded fees BEFORE flipping the order
--      to paid; a failure between the two re-billed on the next hourly run.
--   2. confirm-external-payment recorded fees BEFORE its atomic claim; two
--      concurrent clicks both passed the "already confirmed?" check and both
--      recorded fees.
-- The ledger drives real deductions from Stripe payouts (calculateAutoDeductAmount),
-- so duplicate debits cost vendors real money.
--
-- FIX (this migration + companion code, same commit):
--   - New nullable column order_item_id referencing order_items. All three
--     recordExternalPaymentFee callers record fees per ORDER ITEM, so the item
--     id is the natural idempotency key. Existing rows stay NULL (no backfill —
--     historical rows cannot be reliably attributed to items).
--   - Partial unique index: at most ONE debit per order item. Code treats
--     23505 as a benign no-op. Credits are unaffected (type = 'credit' rows
--     may repeat per item/order legitimately).
--   - Companion code: claim-first reordering in cron Phase 3.6 and
--     confirm-external-payment, recordExternalPaymentFee(orderItemId) param.
--
-- SEQUENCING: apply to Dev + Staging BEFORE deploying the companion code
-- (the code inserts order_item_id; without the column the insert fails and
-- fee recording breaks). Same for Prod before the prod push.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS uq_vendor_fee_ledger_debit_item;
--   ALTER TABLE vendor_fee_ledger DROP COLUMN IF EXISTS order_item_id;
--   (Code must be reverted first — it passes the orderItemId param.)
-- ============================================================================

ALTER TABLE vendor_fee_ledger
  ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL;

COMMENT ON COLUMN vendor_fee_ledger.order_item_id IS
  'Order item this fee debit belongs to. Idempotency key: partial unique index allows at most one debit per item. NULL on rows predating mig 155 and on credits not tied to an item.';

-- One debit per order item, ever. Credits and legacy NULL rows unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_fee_ledger_debit_item
  ON vendor_fee_ledger (order_item_id)
  WHERE type = 'debit' AND order_item_id IS NOT NULL;

-- Lookup support for the FK (mirrors existing idx_vendor_fee_ledger_order)
CREATE INDEX IF NOT EXISTS idx_vendor_fee_ledger_order_item
  ON vendor_fee_ledger (order_item_id)
  WHERE order_item_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION (run after apply):
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'vendor_fee_ledger'
--    AND column_name = 'order_item_id';
-- -- expect: order_item_id | uuid | YES
-- SELECT indexname FROM pg_indexes
--  WHERE tablename = 'vendor_fee_ledger' AND indexname LIKE '%order_item%';
-- -- expect: uq_vendor_fee_ledger_debit_item, idx_vendor_fee_ledger_order_item
-- ============================================================================
