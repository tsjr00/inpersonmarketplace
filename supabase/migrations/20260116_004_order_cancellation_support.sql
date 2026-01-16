-- ============================================================================
-- Migration: Order Cancellation Support
-- Created: 2026-01-16
-- Purpose: Add cancellation tracking to order_items for partial refunds/cancellations
-- ============================================================================

-- Add cancellation fields to order_items
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT CHECK (cancelled_by IN ('buyer', 'vendor', 'system')),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS refund_amount_cents INTEGER;

COMMENT ON COLUMN order_items.cancelled_at IS 'When the item was cancelled';
COMMENT ON COLUMN order_items.cancelled_by IS 'Who cancelled: buyer, vendor, or system';
COMMENT ON COLUMN order_items.cancellation_reason IS 'Reason for cancellation';
COMMENT ON COLUMN order_items.refund_amount_cents IS 'Amount refunded for this item (may differ from subtotal if partial)';

-- Create index for querying cancelled items
CREATE INDEX IF NOT EXISTS idx_order_items_cancelled
  ON order_items(cancelled_at)
  WHERE cancelled_at IS NOT NULL;

-- ============================================================================
-- END MIGRATION
-- ============================================================================
