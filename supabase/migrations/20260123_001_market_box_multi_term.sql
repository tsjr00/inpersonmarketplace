-- ============================================================================
-- Migration: Market Box Multi-Term & Skip Week
-- Created: 2026-01-23
-- Purpose: Add 1-month/2-month term options and vendor skip week capability
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. Add term-specific pricing to market_box_offerings
-- -----------------------------------------------------------------------------
ALTER TABLE market_box_offerings
  ADD COLUMN IF NOT EXISTS price_4week_cents INTEGER,
  ADD COLUMN IF NOT EXISTS price_8week_cents INTEGER;

-- Migrate existing price_cents to price_4week_cents
UPDATE market_box_offerings
SET price_4week_cents = price_cents
WHERE price_4week_cents IS NULL;

-- Make price_4week_cents NOT NULL after migration
ALTER TABLE market_box_offerings
  ALTER COLUMN price_4week_cents SET NOT NULL;

COMMENT ON COLUMN market_box_offerings.price_4week_cents IS 'Total price for 4-week (1 month) term';
COMMENT ON COLUMN market_box_offerings.price_8week_cents IS 'Total price for 8-week (2 month) term. NULL = 8-week option not offered';

-- -----------------------------------------------------------------------------
-- 2. Add term tracking to market_box_subscriptions
-- -----------------------------------------------------------------------------
ALTER TABLE market_box_subscriptions
  ADD COLUMN IF NOT EXISTS term_weeks INTEGER DEFAULT 4,
  ADD COLUMN IF NOT EXISTS original_end_date DATE,
  ADD COLUMN IF NOT EXISTS extended_weeks INTEGER DEFAULT 0;

-- Add constraint for valid term values
ALTER TABLE market_box_subscriptions
  DROP CONSTRAINT IF EXISTS market_box_subscriptions_term_weeks_check;
ALTER TABLE market_box_subscriptions
  ADD CONSTRAINT market_box_subscriptions_term_weeks_check CHECK (term_weeks IN (4, 8));

-- Set term_weeks NOT NULL after adding default
UPDATE market_box_subscriptions SET term_weeks = 4 WHERE term_weeks IS NULL;
ALTER TABLE market_box_subscriptions ALTER COLUMN term_weeks SET NOT NULL;

-- Calculate original_end_date for existing subscriptions
UPDATE market_box_subscriptions
SET original_end_date = start_date + ((term_weeks - 1) * 7)
WHERE original_end_date IS NULL;

COMMENT ON COLUMN market_box_subscriptions.term_weeks IS 'Subscription term: 4 (1 month) or 8 (2 months) weeks';
COMMENT ON COLUMN market_box_subscriptions.original_end_date IS 'Original calculated end date before any extensions';
COMMENT ON COLUMN market_box_subscriptions.extended_weeks IS 'Number of weeks added due to vendor skips';

-- -----------------------------------------------------------------------------
-- 3. Add 'skipped' status to market_box_pickup_status enum
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'skipped'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'market_box_pickup_status')
  ) THEN
    ALTER TYPE market_box_pickup_status ADD VALUE 'skipped';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Add skip tracking columns to market_box_pickups
-- -----------------------------------------------------------------------------
ALTER TABLE market_box_pickups
  ADD COLUMN IF NOT EXISTS is_extension BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS skipped_by_vendor_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS skip_reason TEXT;

-- Remove the week_number 1-4 constraint to allow extension weeks
ALTER TABLE market_box_pickups
  DROP CONSTRAINT IF EXISTS market_box_pickups_week_number_check;

-- Add new constraint allowing weeks 1-16 (max 8 weeks + 8 extensions)
ALTER TABLE market_box_pickups
  ADD CONSTRAINT market_box_pickups_week_number_check CHECK (week_number BETWEEN 1 AND 16);

COMMENT ON COLUMN market_box_pickups.is_extension IS 'True if this pickup was created as an extension (due to vendor skip)';
COMMENT ON COLUMN market_box_pickups.skipped_by_vendor_at IS 'When vendor marked this week as skipped';
COMMENT ON COLUMN market_box_pickups.skip_reason IS 'Optional reason for vendor skip (e.g., weather, holiday)';

-- -----------------------------------------------------------------------------
-- 5. Update trigger to create variable number of pickup records
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_market_box_pickups()
RETURNS TRIGGER AS $$
DECLARE
  pickup_date DATE;
  total_weeks INTEGER;
BEGIN
  -- Use the term_weeks from the subscription (default 4 for backward compatibility)
  total_weeks := COALESCE(NEW.term_weeks, 4);

  FOR i IN 1..total_weeks LOOP
    pickup_date := NEW.start_date + ((i - 1) * 7);
    INSERT INTO market_box_pickups (subscription_id, week_number, scheduled_date, status, is_extension)
    VALUES (NEW.id, i, pickup_date, 'scheduled', false);
  END LOOP;

  -- Set the original_end_date on the subscription
  UPDATE market_box_subscriptions
  SET original_end_date = NEW.start_date + ((total_weeks - 1) * 7)
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
DROP TRIGGER IF EXISTS trigger_create_market_box_pickups ON market_box_subscriptions;
CREATE TRIGGER trigger_create_market_box_pickups
  AFTER INSERT ON market_box_subscriptions
  FOR EACH ROW EXECUTE FUNCTION create_market_box_pickups();

-- -----------------------------------------------------------------------------
-- 6. Update completion trigger to handle variable terms + extensions
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_subscription_completion()
RETURNS TRIGGER AS $$
DECLARE
  completed_count INTEGER;
  total_required INTEGER;
  sub_record RECORD;
BEGIN
  IF NEW.status IN ('picked_up', 'missed', 'skipped') AND OLD.status != NEW.status THEN
    -- Get subscription details
    SELECT term_weeks, extended_weeks INTO sub_record
    FROM market_box_subscriptions
    WHERE id = NEW.subscription_id;

    total_required := sub_record.term_weeks + COALESCE(sub_record.extended_weeks, 0);

    -- Count completed pickups (picked_up, missed, skipped all count as "resolved")
    SELECT COUNT(*) INTO completed_count
    FROM market_box_pickups
    WHERE subscription_id = NEW.subscription_id
      AND status IN ('picked_up', 'missed', 'skipped', 'rescheduled');

    IF completed_count >= total_required THEN
      UPDATE market_box_subscriptions
      SET status = 'completed',
          weeks_completed = total_required,
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

-- Recreate trigger
DROP TRIGGER IF EXISTS trigger_check_subscription_completion ON market_box_pickups;
CREATE TRIGGER trigger_check_subscription_completion
  AFTER UPDATE ON market_box_pickups
  FOR EACH ROW EXECUTE FUNCTION check_subscription_completion();

-- -----------------------------------------------------------------------------
-- 7. Function for vendor to skip a week
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

  -- Create extension pickup
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
    v_last_date + 7,
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
    v_last_date + 7,
    v_current_extended;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION vendor_skip_week IS 'Skip a scheduled pickup and extend the subscription by one week';

-- ============================================================================
-- END MIGRATION
-- ============================================================================
