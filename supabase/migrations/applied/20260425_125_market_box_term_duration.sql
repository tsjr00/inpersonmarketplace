-- ============================================================================
-- Migration 125: Market box term duration semantics (Option A)
-- ============================================================================
-- The subscription's "end date" now matches the named term length (4-week
-- subscription = 28 days, 8-week = 56 days) regardless of cadence. Pickup
-- dates are unchanged. Only original_end_date moves forward.
--
-- Pickup-count framing UX: buyer sees "1 Month · 2 bi-weekly pickups"
-- which means a 4-week subscription with 2 pickups, lasting 4 weeks total.
-- The last pickup happens at day 14 (biweekly) or day 21 (weekly), and the
-- subscription officially ends at day 28 in either case.
--
-- No backfill — staging and prod have zero biweekly subscriptions; existing
-- weekly subscriptions continue under the old semantic (end_date = last
-- pickup date) until they complete naturally. Only new subscriptions get
-- the term-duration semantic.
-- ============================================================================

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

  -- Create pickup records (unchanged from migration 124)
  FOR i IN 1..v_num_pickups LOOP
    v_pickup_date := NEW.start_date + ((i - 1) * v_interval);
    INSERT INTO market_box_pickups (subscription_id, week_number, scheduled_date, status, is_extension)
    VALUES (NEW.id, i, v_pickup_date, 'scheduled', false);
  END LOOP;

  -- Option A: original_end_date matches the named term length (term_weeks * 7
  -- days), regardless of cadence. Buyer mental model: "I subscribed for 1
  -- month, I'll get N pickups during that month." Last pickup may be before
  -- this date — completion is driven by pickup-row status (see
  -- check_subscription_completion), not by end_date.
  UPDATE market_box_subscriptions
  SET original_end_date = NEW.start_date + (COALESCE(NEW.term_weeks, 4) * 7)
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger registration is idempotent — drop and recreate to ensure latest
-- function definition is bound.
DROP TRIGGER IF EXISTS trigger_create_market_box_pickups ON market_box_subscriptions;
CREATE TRIGGER trigger_create_market_box_pickups
  AFTER INSERT ON market_box_subscriptions
  FOR EACH ROW EXECUTE FUNCTION create_market_box_pickups();

-- Defensive: function signature unchanged, but reload PostgREST cache
-- to pick up the new function body.
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- END MIGRATION 125
-- ============================================================================
