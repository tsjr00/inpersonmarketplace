-- ============================================================================
-- Migration 163: create_market_box_pickups() skips manager-cancelled dates
--                (Session 92 cont. — Growth Phase C, Option B)
-- ============================================================================
-- The market-box pickup-generation trigger (mig 125) laid pickups on a fixed
-- cadence (start_date + i*interval) with NO awareness of market_date_overrides.
-- So a subscription created AFTER a manager cancelled a date could be assigned
-- a pickup ON that cancelled date. (Existing subscriptions are already handled
-- at cancel time by the cancel-date cascade via vendor_skip_week.)
--
-- Fix (skip-and-keep-N, user-confirmed 2026-06-21): walk the cadence and SKIP
-- any candidate date that has a market_date_overrides cancelled row for the
-- offering's pickup market, advancing by one interval, until the full N valid
-- pickups are placed. The buyer always gets all N pickups; the series slides
-- past cancelled dates. week_number is the sequential 1..N of placed pickups.
--
-- Body is mig 125 VERBATIM except the generation LOOP (marked PHASE C). A guard
-- bounds the loop. original_end_date stays the nominal term (completion is
-- driven by pickup-row status, not end_date — see mig 125 comment).
--
-- ROLLBACK: re-apply migration 125's body.
-- ============================================================================

CREATE OR REPLACE FUNCTION create_market_box_pickups()
RETURNS TRIGGER AS $$
DECLARE
  v_pickup_date DATE;
  v_num_pickups INTEGER;
  v_interval INTEGER;
  v_market_id UUID;
  v_placed INTEGER := 0;
  v_guard INTEGER := 0;
  v_guard_max INTEGER;
BEGIN
  -- Read frequency from the subscription row (set at subscribe time)
  IF NEW.pickup_frequency = 'biweekly' THEN
    v_num_pickups := COALESCE(NEW.term_weeks, 4) / 2;
    v_interval := 14;
  ELSE
    v_num_pickups := COALESCE(NEW.term_weeks, 4);
    v_interval := 7;
  END IF;

  -- PHASE C (mig 163): the offering's pickup market, for cancelled-date checks.
  SELECT pickup_market_id INTO v_market_id
  FROM market_box_offerings
  WHERE id = NEW.offering_id;

  -- PHASE C (mig 163): place N pickups, skipping any cancelled-override date.
  -- Guard caps the walk so a pathological run of cancellations can't loop away.
  v_guard_max := (v_num_pickups * 3) + 10;
  v_pickup_date := NEW.start_date;
  WHILE v_placed < v_num_pickups AND v_guard < v_guard_max LOOP
    v_guard := v_guard + 1;
    IF v_market_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM market_date_overrides o
      WHERE o.market_id = v_market_id
        AND o.override_date = v_pickup_date
        AND o.status = 'cancelled'
    ) THEN
      v_placed := v_placed + 1;
      INSERT INTO market_box_pickups (subscription_id, week_number, scheduled_date, status, is_extension)
      VALUES (NEW.id, v_placed, v_pickup_date, 'scheduled', false);
    END IF;
    v_pickup_date := v_pickup_date + v_interval;
  END LOOP;

  -- Option A: original_end_date matches the named term length (term_weeks * 7
  -- days), regardless of cadence. Buyer mental model: "I subscribed for 1
  -- month, I'll get N pickups during that month." Last pickup may be before
  -- OR (with skipped cancelled dates) after this date — completion is driven
  -- by pickup-row status (see check_subscription_completion), not end_date.
  UPDATE market_box_subscriptions
  SET original_end_date = NEW.start_date + (COALESCE(NEW.term_weeks, 4) * 7)
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_market_box_pickups IS
  'Trigger fn: generates N market_box_pickups on the subscription cadence, skipping any market_date_overrides cancelled date for the offering pickup market (Phase C mig 163, skip-and-keep-N). Buyer always gets full N pickups.';

-- Trigger binding is by name and unchanged; CREATE OR REPLACE FUNCTION rebinds.
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION (after apply): subscribe a test market box at a market with a
-- cancelled date inside its first N weeks; confirm no pickup row lands on the
-- cancelled date and COUNT(*) = N scheduled pickups.
-- ============================================================================
