-- ============================================================================
-- ✅ PASTE-AND-GO CLASS — function replace only (four trigger functions). No
--    tables, columns, policies, triggers or privileges change. Safe to run
--    twice. Apply Dev → Staging → Prod.
--    Pre-check: OPTIONAL — the four live bodies were fingerprinted by the owner
--    on 2026-10-09 (md5 identical on Dev/Staging for all four; Prod identical
--    for the three auto-create functions, and on the mig-247 body for the
--    conflict function because mig 253 is still pending there). This file
--    SUPERSEDES 253 for the conflict function: on Prod, apply 253 then 262, or
--    262 alone — the result is the same body.
--    The POST-CHECK at the end is LIVE (one SELECT; expect 4 rows, all true).
-- ============================================================================
-- Migration 262: a vendor's schedule conflict at ANOTHER market never rolls
--                back a manager's approval or a manager's market-day edit —
--                only the conflicting day is skipped (owner 2026-10-09)
-- ============================================================================
-- THE INCIDENT (Staging trace mugcqpnz-n44s9t, 2026-09-25)
--   A manager approved a farmers-market vendor. The AFTER UPDATE trigger
--   auto_create_vendor_schedules inserted an active vendor_market_schedules row
--   for EVERY active market day; one of them overlapped the vendor's schedule
--   at "River Road Farmers Market" that weekday, the vendor had not declared
--   they can staff two locations, and check_vendor_schedule_conflict (mig 253)
--   RAISEd. The raise aborted the trigger and with it the WHOLE approval: the
--   manager saw the vendor's rule text on the row, the vendor stayed
--   unapproved, and the app logged it as an unknown database error (P0001 is
--   unmapped) which emailed the owner. The same mechanism lives in two more
--   triggers: auto_create_vendor_schedules_insert (a market_vendors row
--   inserted already approved — no app path does this today) and
--   auto_add_schedule_to_vendors (a manager ADDING or reactivating a market
--   day inserts a row for every approved vendor — one vendor's conflict
--   elsewhere would fail the manager's own schedule edit).
--
-- THE RULE (owner 2026-10-09, option A)
--   Approval is the manager's decision about the vendor; the vendor's
--   availability elsewhere is the vendor's business. So: the conflicting day
--   is SKIPPED, every other day is created, the manager is TOLD which day was
--   skipped (route response → manager UI), and the vendor's approval notice
--   names it too (both in code, same push). The vendor can activate the day
--   later from their Markets page once they free the other day or declare
--   multi-location — that path already returns the refusal to the vendor.
--
-- HOW (owner 2026-10-09: recognise the refusal by ERROR CODE, not message text)
--   1. check_vendor_schedule_conflict: the RAISE now carries its own SQLSTATE,
--      P0020 (SCHEDULE_CONFLICT). Message text UNCHANGED (two routes match on
--      the words "Schedule conflict"; they keep working). Every other line of
--      the mig-253 body is unchanged.
--   2. The three auto-create functions insert ONE day at a time inside a
--      sub-block that catches ONLY SQLSTATE P0020 and moves on. Any other
--      error still fails the statement as before. The ONE conflict rule stays
--      in one place — nothing here re-implements the overlap predicate.
--      Food trucks: untouched — both approval-side functions keep their
--      vertical_id = 'food_trucks' early return exactly as live (owner: leave
--      FT alone). auto_add_schedule_to_vendors never had an FT skip and still
--      does not (FT rows it creates for approved park vendors are unchanged
--      behaviour; only the conflict skip is new).
--
-- EFFECT ON EXISTING ROWS: none. Trigger functions only.
--
-- EXEC-GRANT-EXEMPT — Rule M: all four RETURN trigger (not PostgREST-callable)
--   and were SECURITY DEFINER before this migration.
--
-- BODY PROVENANCE: pg_get_functiondef of all four pasted by the owner from Dev
--   2026-10-09 (Staging identical; Prod identical except the conflict function
--   = mig 247 body, 253 pending). The auto-create bodies below are the LIVE
--   text (the live insert-variant carries the FT skip that no repo migration
--   recorded) with only the per-day loop + exception block added.
--
-- ROLLBACK: re-run supabase/migrations/20260915_253_schedule_conflict_both_verticals.sql
--   (conflict function) and re-create the three auto-create functions from the
--   live bodies quoted in apps/web/.claude/approval_schedule_conflict_research.md.
-- ============================================================================

-- ── 1. The conflict rule — same body as mig 253, now with its own SQLSTATE ──
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
    -- Mig 262: own SQLSTATE so the auto-create triggers can skip THIS refusal
    -- and nothing else. Message text unchanged (routes match on the words).
    RAISE EXCEPTION 'Schedule conflict: overlapping times with "%" on the same day. Deactivate the other schedule first, or declare in your profile that you can staff more than one location at the same time.', conflict_market_name
      USING ERRCODE = 'P0020';
  END IF;

  RETURN NEW;
END;
$function$;

-- ── 2. Approval (UPDATE side): one day at a time; a P0020 skips that day ────
CREATE OR REPLACE FUNCTION public.auto_create_vendor_schedules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_schedule_id UUID;
BEGIN
  -- Only trigger when vendor is newly approved
  IF NEW.approved = true AND (OLD.approved = false OR OLD.approved IS NULL) THEN
    -- Skip food-truck parks: their schedules are booking-driven (per booked day
    -- via the payment webhook), not all-park-day on approval. Auto-creating here
    -- fabricates unbooked days and trips the cross-park conflict trigger.
    IF EXISTS (SELECT 1 FROM markets WHERE id = NEW.market_id AND vertical_id = 'food_trucks') THEN
      RETURN NEW;
    END IF;
    -- Mig 262: one row per day in its own sub-block. A day the vendor cannot
    -- take because of an overlap elsewhere (check_vendor_schedule_conflict
    -- raises P0020) is skipped; the approval and the other days stand. The
    -- route reports the skipped day to the manager and the vendor.
    FOR v_schedule_id IN
      SELECT ms.id FROM market_schedules ms
      WHERE ms.market_id = NEW.market_id AND ms.active = true
    LOOP
      BEGIN
        INSERT INTO vendor_market_schedules (vendor_profile_id, market_id, schedule_id, is_active)
        VALUES (NEW.vendor_profile_id, NEW.market_id, v_schedule_id, true)
        ON CONFLICT (vendor_profile_id, schedule_id) DO NOTHING;
      EXCEPTION WHEN SQLSTATE 'P0020' THEN
        NULL; -- skipped: schedule conflict at another market on this weekday
      END;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

-- ── 3. Approval (INSERT side): same treatment ───────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_create_vendor_schedules_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_schedule_id UUID;
BEGIN
  IF NEW.approved = true THEN
    -- Same FT-park skip as the UPDATE variant (see above).
    IF EXISTS (SELECT 1 FROM markets WHERE id = NEW.market_id AND vertical_id = 'food_trucks') THEN
      RETURN NEW;
    END IF;
    -- Mig 262: per-day sub-block, P0020 skips the day (see the UPDATE variant).
    FOR v_schedule_id IN
      SELECT ms.id FROM market_schedules ms
      WHERE ms.market_id = NEW.market_id AND ms.active = true
    LOOP
      BEGIN
        INSERT INTO vendor_market_schedules (vendor_profile_id, market_id, schedule_id, is_active)
        VALUES (NEW.vendor_profile_id, NEW.market_id, v_schedule_id, true)
        ON CONFLICT (vendor_profile_id, schedule_id) DO NOTHING;
      EXCEPTION WHEN SQLSTATE 'P0020' THEN
        NULL; -- skipped: schedule conflict at another market on this weekday
      END;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

-- ── 4. A market day added or reactivated: one vendor's conflict skips only that vendor ──
CREATE OR REPLACE FUNCTION public.auto_add_schedule_to_vendors()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vendor_profile_id UUID;
BEGIN
  -- Only trigger for active schedules
  IF NEW.active = true THEN
    -- Mig 262: one row per approved vendor in its own sub-block. A vendor who
    -- is already elsewhere at that time (P0020) is skipped; the manager's day
    -- and every other vendor's row stand.
    FOR v_vendor_profile_id IN
      SELECT mv.vendor_profile_id FROM market_vendors mv
      WHERE mv.market_id = NEW.market_id AND mv.approved = true
    LOOP
      BEGIN
        INSERT INTO vendor_market_schedules (vendor_profile_id, market_id, schedule_id, is_active)
        VALUES (v_vendor_profile_id, NEW.market_id, NEW.id, true)
        ON CONFLICT (vendor_profile_id, schedule_id) DO NOTHING;
      EXCEPTION WHEN SQLSTATE 'P0020' THEN
        NULL; -- skipped: this vendor has a schedule conflict elsewhere on this weekday
      END;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================================
-- POST-CHECK (LIVE — expect 4 rows, every column true)
-- ============================================================================
SELECT p.proname,
       position('P0020' IN p.prosrc) > 0                         AS has_p0020,
       p.prosecdef                                               AS security_definer,
       md5(p.prosrc)                                             AS body_md5
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('check_vendor_schedule_conflict', 'auto_create_vendor_schedules',
                    'auto_create_vendor_schedules_insert', 'auto_add_schedule_to_vendors')
ORDER BY p.proname;
--
-- BEHAVIOURAL CHECK (owner, on Staging, through the app — printable W6 step):
--   FM vendor with the multi-location box UNCHECKED, active at market X on a
--   weekday; manager of market Y (same weekday, overlapping hours) approves
--   them → the approval SUCCEEDS; the manager's row says the day was not added;
--   the vendor's "You're approved" notice names the day; the vendor's Markets
--   page shows Y without that day; no admin alert email.
-- ============================================================================
