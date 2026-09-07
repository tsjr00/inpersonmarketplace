-- Migration 247: scope the vms schedule-conflict trigger to FOOD TRUCKS
--
-- Staging finding 2026-09-07 (#12): an FM vendor toggling attendance at a
-- NEW market got a bare "Failed to update schedule" at every market. Cause:
-- the API layer deliberately exempts FM from cross-market same-day conflict
-- checks (schedules route PUT + PATCH: "FM vendors exempt; cross-market
-- product conflicts are caught at listing-publish time") — but this trigger
-- (mig 066, March, pre-dating that policy) still RAISES for ALL verticals.
-- An FM vendor already active anywhere on a weekday can never join another
-- market on that weekday; the RAISE surfaces as a masked 500.
--
-- Fix: the trigger returns early for non-food_trucks markets. FT behavior
-- byte-identical (including the multiple_trucks skip). One added lookup +
-- early return; everything else is mig 066's text verbatim.
--
-- PASTE-AND-GO, function replace only, no table/data changes.
-- ROLLBACK: re-apply applied/20260303_066_schedule_conflict_trigger.sql.

CREATE OR REPLACE FUNCTION check_vendor_schedule_conflict()
RETURNS TRIGGER AS $$
DECLARE
  v_vertical TEXT;
  v_multiple_trucks BOOLEAN;
  v_day_of_week INTEGER;
  v_start TIME;
  v_end TIME;
  conflict_market_name TEXT;
BEGIN
  -- Only check when activating a schedule
  IF NOT NEW.is_active THEN
    RETURN NEW;
  END IF;

  -- Mig 247: cross-market same-day conflicts are an FT rule only. FM booths
  -- are staffed teams, not a single truck — the API layer already exempts
  -- FM; the database now agrees.
  SELECT vertical_id INTO v_vertical FROM markets WHERE id = NEW.market_id;
  IF v_vertical IS DISTINCT FROM 'food_trucks' THEN
    RETURN NEW;
  END IF;

  -- Check if vendor has multiple_trucks enabled (skip conflict check)
  SELECT COALESCE((profile_data->>'multiple_trucks')::boolean, false)
    INTO v_multiple_trucks
    FROM vendor_profiles
    WHERE id = NEW.vendor_profile_id;

  IF v_multiple_trucks IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Get the day_of_week and times for the schedule being activated
  SELECT day_of_week, start_time, end_time
    INTO v_day_of_week, v_start, v_end
    FROM market_schedules
    WHERE id = NEW.schedule_id;

  -- Use vendor-specific times if provided, otherwise market schedule times
  IF NEW.vendor_start_time IS NOT NULL THEN
    v_start := NEW.vendor_start_time;
  END IF;
  IF NEW.vendor_end_time IS NOT NULL THEN
    v_end := NEW.vendor_end_time;
  END IF;

  -- Check for overlapping active schedules at OTHER markets on the same day
  SELECT m.name INTO conflict_market_name
  FROM vendor_market_schedules vms
  JOIN market_schedules ms ON ms.id = vms.schedule_id
  JOIN markets m ON m.id = vms.market_id
  WHERE vms.vendor_profile_id = NEW.vendor_profile_id
    AND vms.is_active = true
    AND vms.market_id != NEW.market_id
    AND ms.day_of_week = v_day_of_week
    AND vms.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (
      COALESCE(vms.vendor_start_time, ms.start_time) < v_end
      AND v_start < COALESCE(vms.vendor_end_time, ms.end_time)
    )
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Schedule conflict: overlapping times with "%" on the same day. Deactivate the other schedule first or enable Multiple Trucks in your profile.', conflict_market_name;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

NOTIFY pgrst, 'reload schema';
