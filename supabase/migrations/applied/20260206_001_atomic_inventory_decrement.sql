-- Atomic inventory decrement function
-- Prevents race condition where two concurrent checkouts read the same quantity
-- and both write back the same decremented value (losing one decrement).
--
-- Uses UPDATE ... RETURNING to atomically decrement in a single operation.
-- Returns the new quantity after decrement.

CREATE OR REPLACE FUNCTION atomic_decrement_inventory(
  p_listing_id UUID,
  p_quantity INTEGER
)
RETURNS TABLE(new_quantity INTEGER) AS $$
BEGIN
  RETURN QUERY
  UPDATE listings
  SET quantity = GREATEST(0, quantity - p_quantity),
      updated_at = NOW()
  WHERE id = p_listing_id
    AND quantity IS NOT NULL
  RETURNING quantity AS new_quantity;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute to authenticated users (called via service client in checkout/success)
GRANT EXECUTE ON FUNCTION atomic_decrement_inventory(UUID, INTEGER) TO service_role;
