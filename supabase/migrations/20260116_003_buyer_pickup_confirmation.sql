-- ============================================================================
-- Migration: Buyer Pickup Confirmation
-- Created: 2026-01-16
-- Purpose: Add buyer confirmation field to order_items for two-way handoff
-- ============================================================================

-- Add buyer confirmation timestamp to order_items
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS buyer_confirmed_at TIMESTAMPTZ;

COMMENT ON COLUMN order_items.buyer_confirmed_at IS 'When buyer confirmed they received the item';

-- Create index for querying confirmed items
CREATE INDEX IF NOT EXISTS idx_order_items_buyer_confirmed
  ON order_items(buyer_confirmed_at)
  WHERE buyer_confirmed_at IS NOT NULL;

-- Add RLS policy for buyers to update their own order items (for confirmation)
DROP POLICY IF EXISTS order_items_buyer_update ON order_items;
CREATE POLICY order_items_buyer_update ON order_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id AND o.buyer_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id AND o.buyer_user_id = auth.uid()
    )
  );

-- ============================================================================
-- END MIGRATION
-- ============================================================================
