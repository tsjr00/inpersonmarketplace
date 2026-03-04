-- Migration 066: Schedule conflict prevention trigger
--
-- Adds a BEFORE INSERT OR UPDATE trigger on vendor_market_schedules that prevents
-- single-truck vendors from having overlapping schedules at different markets
-- on the same day of the week.
--
-- This is a safety net behind the API-level validation in
-- /api/vendor/markets/[id]/schedules (PATCH + PUT routes).
--
-- Vendors with profile_data->>'multiple_trucks' = 'true' bypass this check.

-- ── Function ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_vendor_schedule_conflict()
RETURNS TRIGGER AS $$
DECLARE
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

-- ── Trigger ──────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_check_vendor_schedule_conflict ON public.vendor_market_schedules;

CREATE TRIGGER trg_check_vendor_schedule_conflict
  BEFORE INSERT OR UPDATE ON public.vendor_market_schedules
  FOR EACH ROW
  EXECUTE FUNCTION check_vendor_schedule_conflict();

-- ── Notify PostgREST ─────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
