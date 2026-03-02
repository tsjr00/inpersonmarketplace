-- Migration 063: Fix original_end_date in create_market_box_pickups trigger
-- GAP 7: Migration 20260130 rewrote this trigger and dropped the UPDATE
-- that sets original_end_date on market_box_subscriptions.
-- New subscriptions since then have NULL for original_end_date.

-- Step 1: Fix the trigger function to set original_end_date
CREATE OR REPLACE FUNCTION create_market_box_pickups()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pickup_date DATE;
  num_weeks INTEGER;
BEGIN
  -- Use term_weeks if available, default to 4
  num_weeks := COALESCE(NEW.term_weeks, 4);

  FOR i IN 1..num_weeks LOOP
    pickup_date := NEW.start_date + ((i - 1) * 7);
    INSERT INTO market_box_pickups (subscription_id, week_number, scheduled_date, status)
    VALUES (NEW.id, i, pickup_date, 'scheduled');
  END LOOP;

  -- Set the original end date (before any skip-a-week extensions)
  UPDATE market_box_subscriptions
  SET original_end_date = NEW.start_date + ((num_weeks - 1) * 7)
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_market_box_pickups IS 'SECURITY DEFINER: Creates pickup records when subscription is created. Sets original_end_date. Bypasses RLS since pickups should only be created by system triggers.';

-- Step 2: Backfill existing subscriptions that have NULL original_end_date
UPDATE market_box_subscriptions
SET original_end_date = start_date + ((COALESCE(term_weeks, 4) - 1) * 7)
WHERE original_end_date IS NULL
  AND start_date IS NOT NULL;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
