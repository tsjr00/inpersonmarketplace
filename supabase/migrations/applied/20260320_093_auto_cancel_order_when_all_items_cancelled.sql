-- =============================================================================
-- Migration 093: Auto-cancel order when all items are cancelled
-- =============================================================================
-- Created: 2026-03-20
-- Author: Claude Code (Session 62)
--
-- Problem: Multiple cancellation paths (buyer cancel, vendor reject,
-- resolve-issue refund, cancel-nonpayment) each independently check if
-- all items are cancelled and update order status. If any path forgets
-- this check, the order stays in 'pending'/'paid' with all items cancelled,
-- causing phantom "active orders" in dashboard counts.
--
-- Fix: DB trigger on order_items that fires AFTER UPDATE when an item
-- becomes cancelled. Checks if all sibling items are also cancelled.
-- If so, updates orders.status to 'cancelled'. This is the safety net —
-- application code should still do its own check, but if it misses,
-- the trigger catches it.
-- =============================================================================

CREATE OR REPLACE FUNCTION auto_cancel_order_if_all_items_cancelled()
RETURNS TRIGGER AS $$
DECLARE
  v_remaining_count INTEGER;
BEGIN
  -- Only fire when item was just cancelled
  IF NEW.cancelled_at IS NOT NULL AND (OLD.cancelled_at IS NULL OR TG_OP = 'INSERT') THEN
    -- Count non-cancelled items in same order
    SELECT COUNT(*) INTO v_remaining_count
    FROM order_items
    WHERE order_id = NEW.order_id
      AND cancelled_at IS NULL
      AND id != NEW.id;

    -- If no remaining active items, cancel the order
    IF v_remaining_count = 0 THEN
      UPDATE orders
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = NEW.order_id
        AND status NOT IN ('cancelled', 'refunded', 'completed');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION auto_cancel_order_if_all_items_cancelled() IS
'Safety net trigger: when an order item is cancelled, checks if all items in the order are now cancelled. If so, updates orders.status to cancelled. Prevents phantom active orders in dashboard counts.';

-- Drop if exists (idempotent)
DROP TRIGGER IF EXISTS trg_auto_cancel_order ON order_items;

CREATE TRIGGER trg_auto_cancel_order
  AFTER UPDATE ON order_items
  FOR EACH ROW
  WHEN (NEW.cancelled_at IS NOT NULL AND OLD.cancelled_at IS NULL)
  EXECUTE FUNCTION auto_cancel_order_if_all_items_cancelled();

NOTIFY pgrst, 'reload schema';
