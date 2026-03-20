-- Fix: atomic_complete_order_if_ready() — type mismatch bug
-- v_completed was declared as boolean but ROW_COUNT returns integer.
-- Comparison boolean > 0 always threw error, silently caught by callers.
-- This function has NEVER successfully completed an order since creation.
-- Session 61 — discovered via FM order FA-2026-52543632 stuck at 'paid'
-- despite both buyer_confirmed_at and vendor_confirmed_at being set.

CREATE OR REPLACE FUNCTION atomic_complete_order_if_ready(p_order_id uuid)
RETURNS boolean AS $$
DECLARE
  v_row_count integer := 0;
BEGIN
  -- Only update to 'completed' if ALL non-cancelled items have both confirmations
  -- and the order is not already completed (prevents double-trigger)
  UPDATE orders
  SET status = 'completed', updated_at = NOW()
  WHERE id = p_order_id
    AND status != 'completed'
    AND NOT EXISTS (
      -- Find any active item that is NOT fully confirmed
      SELECT 1
      FROM order_items oi
      WHERE oi.order_id = p_order_id
        AND oi.cancelled_at IS NULL
        AND (oi.buyer_confirmed_at IS NULL OR oi.vendor_confirmed_at IS NULL)
    )
    AND EXISTS (
      -- Ensure at least one active (non-cancelled) item exists
      SELECT 1
      FROM order_items oi
      WHERE oi.order_id = p_order_id
        AND oi.cancelled_at IS NULL
    );

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
