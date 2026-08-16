-- ============================================================================
-- Migration 234: Events sell on ATTENDANCE — Phase 4 paid gate + bench
--                exclusion, ABSORBING parked mig 225 (owner, 2026-08-16)
-- ============================================================================
-- THE RULE (owner, 2026-08-16): "benched or non-benched vendors cannot sell at
-- events they are not attending — they must attend to sell."
--
-- An event listing sells IFF the vendor is ATTENDING:
--   accepted  (market_vendors.response_status = 'accepted')
--   AND not benched  (COALESCE(is_backup, false) = false — the organizer's
--       selection round leaves non-selected vendors 'accepted' with
--       is_backup = true; they are NOT attending. Wave capacity already
--       excludes them — mig 191 — but their menus stayed orderable.)
--   AND, when the event charges an Event Vendor Fee (mig 228), the vendor
--       holds a PAID or COVERED fee row (mig 233 — 'covered' = a promoted
--       backup whose spot the defector's forfeit pays for).
--   Free events (fee NULL or 0): acceptance + not-benched alone.
--
-- Before this migration, paying was honor-system: a selected vendor who never
-- paid could still sell (selling was gated on acceptance only), and a benched
-- vendor's menu stayed orderable at an event they were not attending — the
-- stranded-order class.
--
-- ============================================================================
-- ABSORBS MIG 225 (parked, applied NOWHERE — owner approved the fold-in
-- 2026-08-16: "go ahead and roll 225 into 234")
-- ============================================================================
-- The flow-integrity guard resolves the live sell rule by highest migration
-- NUMBER, and 225's body (FM blanket exemption DELETED — T-39) is the only
-- valid base: building on 223 would reintroduce the vertical exemption and
-- fail the T-39 guard. So this file is MIG 225's COMPLETE TEXT with exactly
-- ONE BRANCH REPLACED (the event-acceptance EXISTS at its lines 235-240
-- becomes the attendance predicate below) + the COMMENT updated. Applying 234
-- anywhere ALSO lands 225's T-39 fix there. 225's file carries a SUPERSEDED
-- banner and must never be applied after this one (it would revert the gate).
--
-- ⛔ DO NOT RE-ADD A VERTICAL EXEMPTION (T-39, inherited from 225): an event
-- sells via the attendance predicate in BOTH verticals, or not at all.
--
-- ============================================================================
-- SAFETY — this REMOVES rows, exactly like 225 (and unlike 223)
-- ============================================================================
-- Three listing classes stop selling, and ONLY these:
--   (A) FM event listings whose vendor never accepted (225's T-39 hole).
--   (B) Event listings (both verticals) whose vendor is BENCHED
--       (is_backup = true).
--   (C) Event listings at FEE-charging events whose accepted, non-benched
--       vendor has no paid/covered row.
-- Traditional + private_pickup listings cannot match the replaced branch
-- (it requires market_type='event'); the `vms.id IS NOT NULL` fallback and
-- every date-window/cutoff/park rule are untouched.
--
-- PROD NOTE: mig 228 is not on Prod yet, so no Prod event has a fee — class
-- (C) is empty there until fees exist. Classes (A)/(B) depend on live rows;
-- the differential names them before anything changes.
--
-- ============================================================================
-- PRE-CHECK — run all three, keep the outputs (inherits 225's method)
-- ============================================================================
--
-- (1) THE PREDICTION, per event listing (BOTH verticals now). attending =
--     accepted AND not benched AND (no fee OR paid/covered). Rows with
--     attending = false and dates_now > 0 are exactly what must go to 0.
--     Rows with attending = true must not move.
--
-- SELECT l.id AS listing_id, l.title, m.name AS event, m.vertical_id,
--        EXISTS (SELECT 1 FROM market_vendors mv
--                 WHERE mv.market_id = m.id
--                   AND mv.vendor_profile_id = l.vendor_profile_id
--                   AND mv.response_status = 'accepted'
--                   AND COALESCE(mv.is_backup, false) = false)
--        AND (NOT EXISTS (SELECT 1 FROM catering_requests cr
--                          WHERE cr.market_id = m.id
--                            AND cr.event_vendor_fee_cents > 0)
--             OR EXISTS (SELECT 1 FROM event_vendor_fee_payments p
--                         WHERE p.market_id = m.id
--                           AND p.vendor_profile_id = l.vendor_profile_id
--                           AND p.status IN ('paid', 'covered')))
--        AS attending,
--        (SELECT count(*) FROM get_available_pickup_dates(l.id) d
--          WHERE d.market_id = m.id) AS dates_now
--   FROM listings l
--   JOIN listing_markets lm ON lm.listing_id = l.id
--   JOIN markets m          ON m.id = lm.market_id
--  WHERE l.status = 'published' AND l.deleted_at IS NULL
--    AND m.market_type = 'event'
--  ORDER BY attending, m.name, l.title;
--
-- (2) THE CONTROL — per-listing date count across EVERY published listing
--     (identical to 225's pre-check (2); diff after applying):
--
-- SELECT l.id, count(d.*) AS date_count
--   FROM listings l
--   LEFT JOIN LATERAL get_available_pickup_dates(l.id) d ON true
--  WHERE l.status = 'published' AND l.deleted_at IS NULL
--  GROUP BY l.id
--  ORDER BY l.id;
--
-- (3) FEE-EVENT INVENTORY — how many events currently charge a fee (sizes
--     class (C); expect 0 on Prod until mig 228 lands there):
--
-- SELECT count(*) FROM catering_requests WHERE event_vendor_fee_cents > 0;
--
-- ============================================================================
-- POST-CHECK
-- ============================================================================
-- (a) Re-run pre-check (1). Every attending = false row reads 0; every
--     attending = true row is unchanged.
-- (b) Re-run pre-check (2), diff against baseline. ONLY listings that
--     pre-check (1) named attending = false may change, and they go to 0.
--     A moved count on ANY traditional/private_pickup listing, or on an
--     attending = true event listing, is a FAILURE — roll back, re-diagnose.
-- (c) Browser: an attending vendor's event menu still takes orders; a benched
--     vendor's items no longer appear in the event shop (the app-side mirror
--     in lib/events/shop-data.ts ships in the same commit).
-- ============================================================================

CREATE OR REPLACE FUNCTION get_available_pickup_dates(
  p_listing_id UUID
)
RETURNS TABLE (
  market_id UUID,
  market_name TEXT,
  market_type TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  schedule_id UUID,
  day_of_week INTEGER,
  pickup_date DATE,
  start_time TIME,
  end_time TIME,
  cutoff_at TIMESTAMPTZ,
  is_accepting BOOLEAN,
  hours_until_cutoff NUMERIC,
  cutoff_hours INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH listing_schedules AS (
    SELECT
      m.id as market_id,
      m.name as market_name,
      m.market_type,
      m.address,
      m.city,
      m.state,
      m.vertical_id,
      COALESCE(m.timezone, 'America/Chicago') as timezone,
      (NOW() AT TIME ZONE COALESCE(m.timezone, 'America/Chicago'))::DATE as local_today,
      m.event_start_date,
      m.event_end_date,
      -- Cutoff logic with day-of event support (unchanged from migration 109)
      CASE
        -- FT parks: ALWAYS 0 (no advance cutoff)
        WHEN m.vertical_id = 'food_trucks' AND m.market_type != 'event' THEN 0
        -- Day-of event ordering: flag ON + event day arrived = accept until event ends
        WHEN m.market_type = 'event'
          AND m.event_allow_day_of_orders = true
          AND (NOW() AT TIME ZONE COALESCE(m.timezone, 'America/Chicago'))::DATE >= m.event_start_date
        THEN 0
        -- All other markets: use DB cutoff_hours or vertical-specific default
        ELSE COALESCE(m.cutoff_hours,
          CASE
            WHEN m.market_type = 'event' THEN 24
            WHEN m.market_type = 'private_pickup' THEN 10
            ELSE 18
          END
        )
      END as cutoff_hours,
      ms.id as schedule_id,
      ms.day_of_week,
      COALESCE(vms.vendor_start_time, ms.start_time) as start_time,
      COALESCE(vms.vendor_end_time, ms.end_time) as end_time,
      vms.id as vms_id,
      COALESCE(l.advance_order_days, 0) as advance_order_days,
      -- T5 (mig 199): carried for the paid-park booking intersection below.
      l.vendor_profile_id as listing_vendor_id,
      m.park_mode
    FROM listing_markets lm
    JOIN listings l ON l.id = lm.listing_id
    JOIN markets m ON m.id = lm.market_id
      AND m.active = true
      AND (m.season_start IS NULL OR (NOW() AT TIME ZONE COALESCE(m.timezone, 'America/Chicago'))::DATE >= m.season_start)
      AND (m.season_end IS NULL OR (NOW() AT TIME ZONE COALESCE(m.timezone, 'America/Chicago'))::DATE <= m.season_end)
      AND (m.market_type != 'event' OR m.event_end_date >= (NOW() AT TIME ZONE COALESCE(m.timezone, 'America/Chicago'))::DATE)
    JOIN market_schedules ms ON ms.market_id = m.id AND ms.active = true
    LEFT JOIN vendor_market_schedules vms
      ON vms.vendor_profile_id = l.vendor_profile_id
      AND vms.schedule_id = ms.id
      AND vms.is_active = true
    WHERE lm.listing_id = p_listing_id
      AND (
        -- Traditional markets in ALL verticals require an active vms row
        -- (vms.id IS NOT NULL after the is_active=true LEFT JOIN filter).
        m.market_type = 'private_pickup'
        -- ATTENDANCE (mig 234, owner rule 2026-08-16: "they must attend to
        -- sell"). Supersedes the acceptance-only branch (migs 223 + 225):
        --
        --   accepted      — T-36 (mig 223): market_vendors.response_status is
        --                   the single record of event attendance; never
        --                   mirrored into vendor_market_schedules.
        --   not benched   — the organizer's selection round leaves
        --                   non-selected vendors 'accepted' with
        --                   is_backup = true. They are NOT attending; before
        --                   this migration their menus stayed orderable
        --                   (stranded-order class). Same COALESCE idiom as
        --                   wave capacity (mig 191).
        --   fee satisfied — Phase 4 paid gate: at a fee-charging event
        --                   (mig 228) the vendor must hold a PAID or COVERED
        --                   (mig 233 backup step-in) fee row. Free events
        --                   skip this conjunct entirely.
        --
        -- T-39 (mig 225, absorbed here): the FM blanket exemption
        -- (`market_type = 'event' AND vertical_id != 'food_trucks'`) stays
        -- DELETED. ⛔ DO NOT RE-ADD A VERTICAL EXEMPTION — attendance is the
        -- rule in BOTH verticals. Guarded by flow-integrity.test.ts.
        OR (m.market_type = 'event'
            AND EXISTS (
              SELECT 1 FROM market_vendors mv
               WHERE mv.market_id = m.id
                 AND mv.vendor_profile_id = l.vendor_profile_id
                 AND mv.response_status = 'accepted'
                 AND COALESCE(mv.is_backup, false) = false
            )
            AND (
              NOT EXISTS (
                SELECT 1 FROM catering_requests cr
                 WHERE cr.market_id = m.id
                   AND cr.event_vendor_fee_cents > 0
              )
              OR EXISTS (
                SELECT 1 FROM event_vendor_fee_payments p
                 WHERE p.market_id = m.id
                   AND p.vendor_profile_id = l.vendor_profile_id
                   AND p.status IN ('paid', 'covered')
              )
            ))
        OR vms.id IS NOT NULL
      )
  ),
  date_series AS (
    -- Regular markets: next 8 days
    SELECT DISTINCT (ls.local_today + i)::DATE as potential_date
    FROM listing_schedules ls
    CROSS JOIN generate_series(0, 7) as i

    UNION

    -- Events: include the actual event date range
    SELECT DISTINCT gs::DATE as potential_date
    FROM listing_schedules ls,
    LATERAL generate_series(
      ls.event_start_date,
      ls.event_end_date,
      '1 day'::interval
    ) as gs
    WHERE ls.market_type = 'event'
      AND ls.event_start_date IS NOT NULL
  ),
  matched_dates AS (
    SELECT
      ls.market_id,
      ls.market_name,
      ls.market_type,
      ls.address,
      ls.city,
      ls.state,
      ls.vertical_id,
      ls.timezone,
      ls.local_today,
      ls.cutoff_hours,
      ls.schedule_id,
      ls.day_of_week,
      ls.start_time,
      ls.end_time,
      ds.potential_date as pickup_date,
      ((ds.potential_date || ' ' || ls.start_time)::TIMESTAMP
        AT TIME ZONE ls.timezone) as pickup_start_utc,
      ((ds.potential_date || ' ' || ls.end_time)::TIMESTAMP
        AT TIME ZONE ls.timezone) as pickup_end_utc
    FROM listing_schedules ls
    CROSS JOIN date_series ds
    WHERE EXTRACT(DOW FROM ds.potential_date)::INTEGER = ls.day_of_week
      AND (
        ls.market_type != 'event'
        OR (ds.potential_date >= ls.event_start_date AND ds.potential_date <= ls.event_end_date)
      )
      AND (
        ls.vertical_id != 'food_trucks'
        OR ls.market_type = 'event'
        OR (ls.advance_order_days = 0 AND ds.potential_date = ls.local_today)
        OR (ls.advance_order_days > 0
            AND ds.potential_date >= ls.local_today + 2
            AND ds.potential_date <= ls.local_today + ls.advance_order_days)
      )
      -- PHASE C (mig 162): exclude dates the manager has cancelled for this market.
      AND NOT EXISTS (
        SELECT 1 FROM market_date_overrides o
        WHERE o.market_id = ls.market_id
          AND o.override_date = ds.potential_date
          AND o.status = 'cancelled'
      )
      -- T5 (mig 199): paid FT parks sell ONLY on PAID booking dates —
      -- booking = selling = paid (D1). Short-circuit order keeps FM, FT
      -- events, and free parks off the EXISTS entirely; only FT paid-park
      -- listings probe uq_park_spot_vendor_active (status='paid' implies the
      -- index's partial predicate). multiple_trucks grants NO exemption (D2).
      AND (
        ls.vertical_id != 'food_trucks'
        OR ls.market_type = 'event'
        OR ls.park_mode IS DISTINCT FROM 'paid'
        OR EXISTS (
          SELECT 1 FROM park_spot_bookings b
          WHERE b.vendor_profile_id = ls.listing_vendor_id
            AND b.market_id = ls.market_id
            AND b.booking_date = ds.potential_date
            AND b.status = 'paid'
            -- G1 (mig 200): a barred booking stays 'paid' (slot held, no
            -- resale) but must NOT sell — the truck was removed from this date.
            AND b.manager_barred_at IS NULL
        )
      )
  ),
  with_cutoff AS (
    SELECT
      md.*,
      CASE
        WHEN md.cutoff_hours = 0 THEN md.pickup_end_utc
        ELSE md.pickup_start_utc - (md.cutoff_hours || ' hours')::INTERVAL
      END as cutoff_at
    FROM matched_dates md
  )
  SELECT
    wc.market_id,
    wc.market_name,
    wc.market_type,
    wc.address,
    wc.city,
    wc.state,
    wc.schedule_id,
    wc.day_of_week,
    wc.pickup_date,
    wc.start_time,
    wc.end_time,
    wc.cutoff_at,
    (NOW() < wc.cutoff_at) as is_accepting,
    (EXTRACT(EPOCH FROM (wc.cutoff_at - NOW())) / 3600)::NUMERIC(10,2) as hours_until_cutoff,
    wc.cutoff_hours::INTEGER
  FROM with_cutoff wc
  WHERE wc.pickup_end_utc > NOW()
  ORDER BY wc.pickup_date, wc.start_time, wc.market_name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION get_available_pickup_dates IS
  'Returns upcoming pickup dates for a listing. '
  'All date comparisons use market timezone (NOT UTC). '
  'Traditional markets (FM + FT): REQUIRE active vendor_market_schedules row. '
  'Events (both verticals): sell ONLY when the vendor is ATTENDING (mig 234): accepted market_vendors row + NOT benched (is_backup=false) + fee PAID or COVERED when the event charges an Event Vendor Fee; free events need acceptance + not-benched only. '
  'FM events have NO blanket exemption — removed by mig 225/T-39, preserved here. Attendance is required in both verticals. '
  'Events do not require a vendor_market_schedules row; attendance replaces it. '
  'Private pickup: no vms requirement. '
  'FT non-event: today + advance_order_days window, 0 cutoff. '
  'Events: actual event date range as candidates. Past events auto-filtered. '
  'Day-of ordering: when event_allow_day_of_orders=true AND local_today >= event_start_date, cutoff=0 (accepting until event ends). '
  'Vendor custom times used when available. Enforces season dates. '
  'Phase C (mig 162): excludes dates with a market_date_overrides cancelled row. '
  'T5 (mig 199): park_mode=paid FT markets additionally require a PAID park_spot_bookings row for (vendor, market, date) — booking = selling = paid; multiple_trucks grants no exemption. '
  'G1 (mig 200): barred bookings (manager_barred_at set) do not sell — the bar keeps the row paid to hold the slot, but the truck was removed from that date.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- ROLLBACK — one statement, no data touched
-- ============================================================================
-- Re-apply migration 225 verbatim (attendance gate off, acceptance-only rule,
-- T-39 still fixed):
--   supabase/migrations/20260812_225_fm_events_require_acceptance.sql
-- Or, to also restore the FM exemption (full pre-225 state), re-apply 223:
--   supabase/migrations/applied/20260810_223_events_sell_on_acceptance.sql
-- CREATE OR REPLACE preserves grants; nothing dropped, no data modified.
-- NOTE: rolling back to 225 makes 225 "applied" — update its SUPERSEDED
-- banner and the snapshot if that path is ever taken.
-- ============================================================================
