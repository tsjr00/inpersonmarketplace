-- ============================================================================
-- Migration 053: Add small_order_fee_cents to orders
-- ============================================================================
-- The small order fee feature was added in Session 43 (checkout refactor)
-- but the column was never created. Code references it in:
--   checkout/session/route.ts, checkout/external/route.ts
-- Without this column, checkout INSERT fails with schema cache error.
-- ============================================================================

ALTER TABLE orders ADD COLUMN small_order_fee_cents INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN orders.small_order_fee_cents IS 'Small order surcharge in cents (applied when subtotal below vertical minimum)';

NOTIFY pgrst, 'reload schema';
