-- M1: Atomic order completion to prevent race condition
-- When both buyer confirm and vendor fulfill happen concurrently,
-- the manual check-then-update pattern can miss the completion update
-- or double-trigger it. This function does it atomically.

CREATE OR REPLACE FUNCTION atomic_complete_order_if_ready(p_order_id uuid)
RETURNS boolean AS $$
DECLARE
  v_completed boolean := false;
BEGIN
  -- Only update to 'completed' if ALL non-cancelled items have both confirmations
  -- and the order is not already completed (prevents double-trigger)
  UPDATE orders
  SET status = 'completed'
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

  GET DIAGNOSTICS v_completed = ROW_COUNT;
  RETURN v_completed > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
