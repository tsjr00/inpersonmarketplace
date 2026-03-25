-- ============================================================================
-- Fix get_or_create_cart: change p_vertical_id from UUID to TEXT
--
-- Migration 017 changed carts.vertical_id from UUID to TEXT, but did not
-- update this function. The type mismatch (text = uuid) causes the function
-- to fail with error 42883 "operator does not exist: text = uuid".
-- ============================================================================

-- Drop the old UUID-signature function
DROP FUNCTION IF EXISTS get_or_create_cart(uuid, uuid);

-- Recreate with TEXT vertical_id parameter
CREATE OR REPLACE FUNCTION get_or_create_cart(
  p_user_id uuid,
  p_vertical_id text
)
RETURNS uuid AS $$
DECLARE
  v_cart_id uuid;
BEGIN
  -- Try to find existing cart
  SELECT id INTO v_cart_id
  FROM public.carts
  WHERE user_id = p_user_id
    AND vertical_id = p_vertical_id;

  -- Create if not found
  IF v_cart_id IS NULL THEN
    INSERT INTO public.carts (user_id, vertical_id)
    VALUES (p_user_id, p_vertical_id)
    RETURNING id INTO v_cart_id;
  END IF;

  RETURN v_cart_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
