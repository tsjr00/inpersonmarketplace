-- ============================================================================
-- Migration 124: Bi-Weekly Market Box Pickup Frequency
-- ============================================================================
-- Adds vendor-level pickup frequency setting (weekly/biweekly).
-- Bi-weekly subscriptions create half the pickups at 14-day intervals.
-- Same term lengths (4/8 weeks), fewer pickups, same price per pickup.
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. Add frequency column to vendor_profiles (vendor-level setting)
-- -----------------------------------------------------------------------------
ALTER TABLE vendor_profiles
  ADD COLUMN IF NOT EXISTS market_box_frequency text NOT NULL DEFAULT 'weekly';

ALTER TABLE vendor_profiles
  DROP CONSTRAINT IF EXISTS ck_vendor_market_box_frequency;

ALTER TABLE vendor_profiles
  ADD CONSTRAINT ck_vendor_market_box_frequency
  CHECK (market_box_frequency IN ('weekly', 'biweekly'));

COMMENT ON COLUMN vendor_profiles.market_box_frequency IS 'Pickup frequency for market box offerings: weekly (every 7 days) or biweekly (every 14 days)';

-- -----------------------------------------------------------------------------
-- 2. Add frequency column to market_box_subscriptions (captures at subscribe time)
-- -----------------------------------------------------------------------------
ALTER TABLE market_box_subscriptions
  ADD COLUMN IF NOT EXISTS pickup_frequency text NOT NULL DEFAULT 'weekly';

ALTER TABLE market_box_subscriptions
  DROP CONSTRAINT IF EXISTS ck_subscription_pickup_frequency;

ALTER TABLE market_box_subscriptions
  ADD CONSTRAINT ck_subscription_pickup_frequency
  CHECK (pickup_frequency IN ('weekly', 'biweekly'));

COMMENT ON COLUMN market_box_subscriptions.pickup_frequency IS 'Frequency at time of subscription. Decoupled from vendor setting so existing subs are unaffected by future changes.';

-- -----------------------------------------------------------------------------
-- 3. Update pickup generation trigger to support bi-weekly
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_market_box_pickups()
RETURNS TRIGGER AS $$
DECLARE
  v_pickup_date DATE;
  v_num_pickups INTEGER;
  v_interval INTEGER;
BEGIN
  -- Read frequency from the subscription row (set at subscribe time)
  IF NEW.pickup_frequency = 'biweekly' THEN
    v_num_pickups := COALESCE(NEW.term_weeks, 4) / 2;
    v_interval := 14;
  ELSE
    v_num_pickups := COALESCE(NEW.term_weeks, 4);
    v_interval := 7;
  END IF;

  -- Create pickup records
  FOR i IN 1..v_num_pickups LOOP
    v_pickup_date := NEW.start_date + ((i - 1) * v_interval);
    INSERT INTO market_box_pickups (subscription_id, week_number, scheduled_date, status, is_extension)
    VALUES (NEW.id, i, v_pickup_date, 'scheduled', false);
  END LOOP;

  -- Set the original_end_date on the subscription
  UPDATE market_box_subscriptions
  SET original_end_date = NEW.start_date + ((v_num_pickups - 1) * v_interval)
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger (idempotent)
DROP TRIGGER IF EXISTS trigger_create_market_box_pickups ON market_box_subscriptions;
CREATE TRIGGER trigger_create_market_box_pickups
  AFTER INSERT ON market_box_subscriptions
  FOR EACH ROW EXECUTE FUNCTION create_market_box_pickups();

-- -----------------------------------------------------------------------------
-- 4. Fix completion trigger — count actual pickups, not term_weeks
--    (term_weeks=4 creates 4 weekly pickups but only 2 bi-weekly pickups)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_subscription_completion()
RETURNS TRIGGER AS $$
DECLARE
  completed_count INTEGER;
  total_required INTEGER;
BEGIN
  IF NEW.status IN ('picked_up', 'missed', 'skipped') AND OLD.status != NEW.status THEN
    -- Count ALL pickups for this subscription (base + extensions)
    SELECT COUNT(*) INTO total_required
    FROM market_box_pickups
    WHERE subscription_id = NEW.subscription_id;

    -- Count resolved pickups
    SELECT COUNT(*) INTO completed_count
    FROM market_box_pickups
    WHERE subscription_id = NEW.subscription_id
      AND status IN ('picked_up', 'missed', 'skipped', 'rescheduled');

    IF completed_count >= total_required THEN
      UPDATE market_box_subscriptions
      SET status = 'completed',
          weeks_completed = completed_count,
          completed_at = NOW(),
          updated_at = NOW()
      WHERE id = NEW.subscription_id;
    ELSE
      UPDATE market_box_subscriptions
      SET weeks_completed = completed_count, updated_at = NOW()
      WHERE id = NEW.subscription_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger (idempotent)
DROP TRIGGER IF EXISTS trigger_check_subscription_completion ON market_box_pickups;
CREATE TRIGGER trigger_check_subscription_completion
  AFTER UPDATE ON market_box_pickups
  FOR EACH ROW EXECUTE FUNCTION check_subscription_completion();

-- -----------------------------------------------------------------------------
-- 5. Update vendor_skip_week to use frequency-aware interval
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION vendor_skip_week(
  p_pickup_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(
  skipped_pickup_id UUID,
  extension_pickup_id UUID,
  new_scheduled_date DATE,
  new_extended_weeks INTEGER
) AS $$
DECLARE
  v_subscription_id UUID;
  v_current_status market_box_pickup_status;
  v_is_extension BOOLEAN;
  v_current_max_week INTEGER;
  v_last_date DATE;
  v_new_pickup_id UUID;
  v_current_extended INTEGER;
  v_frequency TEXT;
  v_interval INTEGER;
BEGIN
  -- Get pickup and subscription info
  SELECT p.subscription_id, p.status, p.is_extension
  INTO v_subscription_id, v_current_status, v_is_extension
  FROM market_box_pickups p
  WHERE p.id = p_pickup_id;

  -- Validate pickup exists
  IF v_subscription_id IS NULL THEN
    RAISE EXCEPTION 'Pickup not found';
  END IF;

  -- Can only skip scheduled or ready pickups
  IF v_current_status NOT IN ('scheduled', 'ready') THEN
    RAISE EXCEPTION 'Can only skip scheduled or ready pickups';
  END IF;

  -- Cannot skip extension pickups (already makeup weeks)
  IF v_is_extension THEN
    RAISE EXCEPTION 'Cannot skip extension pickups';
  END IF;

  -- Get frequency from subscription for correct interval
  SELECT pickup_frequency INTO v_frequency
  FROM market_box_subscriptions
  WHERE id = v_subscription_id;

  v_interval := CASE WHEN v_frequency = 'biweekly' THEN 14 ELSE 7 END;

  -- Mark the pickup as skipped
  UPDATE market_box_pickups
  SET status = 'skipped',
      skipped_by_vendor_at = NOW(),
      skip_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_pickup_id;

  -- Get the current max week number and last scheduled date
  SELECT MAX(week_number), MAX(scheduled_date)
  INTO v_current_max_week, v_last_date
  FROM market_box_pickups
  WHERE subscription_id = v_subscription_id;

  -- Create extension pickup using frequency-aware interval
  INSERT INTO market_box_pickups (
    subscription_id,
    week_number,
    scheduled_date,
    status,
    is_extension,
    vendor_notes
  )
  VALUES (
    v_subscription_id,
    v_current_max_week + 1,
    v_last_date + v_interval,
    'scheduled',
    true,
    'Extension week added due to skip'
  )
  RETURNING id INTO v_new_pickup_id;

  -- Update subscription extended_weeks
  UPDATE market_box_subscriptions
  SET extended_weeks = COALESCE(extended_weeks, 0) + 1,
      updated_at = NOW()
  WHERE id = v_subscription_id
  RETURNING extended_weeks INTO v_current_extended;

  RETURN QUERY SELECT
    p_pickup_id,
    v_new_pickup_id,
    v_last_date + v_interval,
    v_current_extended;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION vendor_skip_week IS 'Skip a scheduled pickup and extend the subscription by one period (7 days weekly, 14 days bi-weekly)';

-- -----------------------------------------------------------------------------
-- 6. Update atomic subscribe RPC to accept and store frequency
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION subscribe_to_market_box_if_capacity(
  p_offering_id UUID,
  p_buyer_user_id UUID,
  p_order_id UUID,
  p_total_paid_cents INTEGER,
  p_start_date DATE,
  p_term_weeks INTEGER,
  p_stripe_payment_intent_id TEXT,
  p_pickup_frequency TEXT DEFAULT 'weekly'
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

  -- Insert subscription with frequency
  INSERT INTO market_box_subscriptions (
    offering_id, buyer_user_id, order_id, total_paid_cents,
    start_date, term_weeks, status, weeks_completed,
    stripe_payment_intent_id, pickup_frequency
  ) VALUES (
    p_offering_id, p_buyer_user_id, p_order_id, p_total_paid_cents,
    p_start_date, p_term_weeks, 'active', 0,
    p_stripe_payment_intent_id, p_pickup_frequency
  ) RETURNING id INTO v_new_id;

  RETURN json_build_object('success', true, 'id', v_new_id, 'already_existed', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- END MIGRATION 124
-- ============================================================================
