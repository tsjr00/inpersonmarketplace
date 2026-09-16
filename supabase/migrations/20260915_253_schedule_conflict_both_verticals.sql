-- ============================================================================
-- Migration 253: schedule-conflict trigger applies to BOTH verticals
-- ============================================================================
-- ✅ PASTE-AND-GO CLASS — function replace only. No tables, columns, policies,
--    triggers or privileges change. Apply Dev → Staging → Prod. Companion code
--    (schedules route, same push) removes the matching API-layer exemption; the
--    two are independent — either order is safe, both are needed for the rule
--    to hold everywhere.
--
-- OWNER RULING 2026-09-14 (decisions.md): the "I can staff more than one
--   location at the same time" declaration (`profile_data.multiple_trucks`)
--   gates schedule conflicts on BOTH verticals. The farmers-market exemption
--   is REVERSED: "most FM vendors only do one market at a time; those that are
--   large enough to staff more than one market are the exception, not the
--   rule." Owner test TR-044 (2026-09-13): an FM vendor with the box unchecked
--   double-booked a Saturday at two traditional markets.
--
-- THE CHANGE
--   1. The mig-247 early return for non-food_trucks markets is REMOVED. Every
--      other line of the check is unchanged (multiple_trucks exemption, vendor
--      time overrides, overlap predicate, self-exclusion).
--   2. The refusal message no longer says "enable Multiple Trucks" (the FT
--      label); it names the declaration in vertical-neutral words.
--
-- EFFECT: existing rows are untouched (trigger fires on INSERT/UPDATE only).
--   An FM vendor WITHOUT the declaration is refused on their next overlapping
--   activation; one WITH it keeps working. FT behaviour is byte-identical.
--
-- EXEC-GRANT-EXEMPT — Rule M: RETURNS trigger, not PostgREST-callable; the
--   function was already SECURITY DEFINER before this migration (mig 066/247).
--
-- BODY PROVENANCE: `pg_get_functiondef` byte-identical on Dev, Staging AND Prod
--   (owner-run 2026-09-15). This file is that body minus the removed block plus
--   the message change. Columns verified against SCHEMA_SNAPSHOT.md the same day.
--
-- ============================================================================
-- PRE-CHECK (expect the body to contain the string 'food_trucks')
-- ============================================================================
-- SELECT position('food_trucks' IN pg_get_functiondef('public.check_vendor_schedule_conflict()'::regprocedure)) > 0 AS has_fm_exemption;
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_vendor_schedule_conflict()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Mig 253 (owner ruling 2026-09-14): the check applies to BOTH verticals.
  -- The mig-247 early return for non-food_trucks markets is gone. A vendor who
  -- has declared they can staff more than one location at the same time
  -- (profile_data.multiple_trucks — the FM edit form uses the same key) is
  -- exempt; everyone else is refused on an overlap.
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
    RAISE EXCEPTION 'Schedule conflict: overlapping times with "%" on the same day. Deactivate the other schedule first, or declare in your profile that you can staff more than one location at the same time.', conflict_market_name;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================================
-- POST-CHECK (expect has_fm_exemption = false)
-- ============================================================================
-- SELECT position('food_trucks' IN pg_get_functiondef('public.check_vendor_schedule_conflict()'::regprocedure)) > 0 AS has_fm_exemption;
--
-- BEHAVIOURAL CHECK (owner, on Staging, through the app): as an FM vendor with
-- the "staff more than one location" box UNCHECKED, activate a second market on
-- a weekday already held → refused, naming the conflicting market. Check the
-- box → the same activation succeeds.
--
-- ROLLBACK: re-apply applied/20260907_247_fm_exempt_schedule_conflict_trigger.sql
-- (restores the FM early return and the old message).
-- ============================================================================
