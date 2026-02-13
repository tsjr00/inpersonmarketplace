-- Atomic market box subscription with capacity check
-- Prevents race condition where two buyers can over-subscribe past max_subscribers
-- Uses FOR UPDATE row lock on the offering to serialize concurrent inserts

CREATE OR REPLACE FUNCTION subscribe_to_market_box_if_capacity(
  p_offering_id UUID,
  p_buyer_user_id UUID,
  p_order_id UUID,
  p_total_paid_cents INTEGER,
  p_start_date DATE,
  p_term_weeks INTEGER,
  p_stripe_payment_intent_id TEXT
) RETURNS JSON AS $$
DECLARE
  v_max_subscribers INTEGER;
  v_active_count INTEGER;
  v_existing_id UUID;
  v_new_id UUID;
BEGIN
  -- Idempotent: check if subscription already exists for this order
  SELECT id INTO v_existing_id
  FROM market_box_subscriptions
  WHERE offering_id = p_offering_id
    AND buyer_user_id = p_buyer_user_id
    AND order_id = p_order_id;

  IF v_existing_id IS NOT NULL THEN
    RETURN json_build_object('success', true, 'id', v_existing_id, 'already_existed', true);
  END IF;

  -- Lock the offering row to prevent concurrent inserts
  SELECT max_subscribers INTO v_max_subscribers
  FROM market_box_offerings
  WHERE id = p_offering_id
  FOR UPDATE;

  -- Count active subscribers
  SELECT COUNT(*) INTO v_active_count
  FROM market_box_subscriptions
  WHERE offering_id = p_offering_id
    AND status = 'active';

  -- Check capacity (null means unlimited)
  IF v_max_subscribers IS NOT NULL AND v_active_count >= v_max_subscribers THEN
    RETURN json_build_object(
      'success', false,
      'error', 'at_capacity',
      'active_count', v_active_count,
      'max', v_max_subscribers
    );
  END IF;

  -- Insert subscription
  INSERT INTO market_box_subscriptions (
    offering_id, buyer_user_id, order_id, total_paid_cents,
    start_date, term_weeks, status, weeks_completed, stripe_payment_intent_id
  ) VALUES (
    p_offering_id, p_buyer_user_id, p_order_id, p_total_paid_cents,
    p_start_date, p_term_weeks, 'active', 0, p_stripe_payment_intent_id
  ) RETURNING id INTO v_new_id;

  RETURN json_build_object('success', true, 'id', v_new_id, 'already_existed', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
