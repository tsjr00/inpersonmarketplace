-- ============================================================================
-- Migration 254: events sell on SELECTION (self-service events)
--                owner ruling 2026-09-17 (decisions.md) — finding 1b, OB-024
-- ============================================================================
-- ⚠ PRE-CHECK FIRST class. FUNCTION REPLACE, BEHAVIOUR CHANGE ON ARRIVAL:
-- on a self-service event, a vendor who ACCEPTED but has not been SELECTED by
-- the organizer stops being orderable at that event the moment this applies.
-- Run the pre-check below on the target environment and read the rows before
-- pasting. No table, column, index, policy or grant changes.
--
-- WHY
-- "Accepted is not attending" (owner 2026-09-03). The sell gate checked
-- accepted + not benched + fee paid/covered — never selection. A self-service
-- event turns 'ready' at the acceptance threshold, before the organizer picks
-- anyone (api/vendor/events/[marketId]/respond), and a vendor who responds after
-- the selection round arrives un-benched. Fee events were protected only by
-- accident (unselected vendors have not paid); on a FREE event every accepted
-- vendor sold with no selection at all. Owner 2026-09-17: "unselected vendors
-- should not be able to accept orders from the event page – but need to still
-- accept orders from other surfaces outside the event. They don't get penalized
-- for not being selected."
--
-- WHAT CHANGES
-- get_available_pickup_dates = MIG 238's text with ONE predicate added inside
-- the event acceptance EXISTS (+ one sentence appended to the COMMENT). Proven
-- by diff at build time. Live body verified identical to mig 238 on Dev,
-- Staging AND Prod 2026-09-17 (owner-run md5(prosrc) = 89d0fc71…, length 10028).
-- Non-event branches are untouched — that is what keeps regular-location sales
-- unpenalized.
-- @paired-rule event-sells-on-acceptance — the shop payload
-- (lib/events/shop-data.ts) applies the same selection rule in the same commit.
--
-- EXEC-GRANT-EXEMPT (guardrail Rule M): read-only STABLE function that the
-- PUBLIC listing page calls with the visitor's own session — anonymous
-- shoppers included (app/[vertical]/listing/[listingId]/page.tsx, createClient
-- + .rpc). Revoking anon/authenticated would blank every listing's pickup
-- dates. It writes nothing. CREATE OR REPLACE keeps the existing grants.
--
-- PRE-CHECK (read-only) — who stops being orderable at an upcoming event:
--   SELECT cr.id, cr.company_name, cr.status, cr.event_date,
--          count(*) AS accepted_unbenched_unselected
--   FROM catering_requests cr
--   JOIN market_vendors mv ON mv.market_id = cr.market_id
--   WHERE cr.service_level = 'self_service'
--     AND cr.status IN ('approved', 'ready', 'active')
--     AND cr.event_date >= current_date
--     AND mv.response_status = 'accepted'
--     AND COALESCE(mv.is_backup, false) = false
--     AND mv.organizer_selected_at IS NULL
--   GROUP BY cr.id, cr.company_name, cr.status, cr.event_date
--   ORDER BY cr.event_date;
--   -- 0 rows = nobody changes. Rows = vendors the organizer has not selected
--   -- yet; they stop selling AT THAT EVENT until selected (intended).
--   SELECT md5(prosrc), length(prosrc) FROM pg_proc
--    WHERE proname = 'get_available_pickup_dates' AND pronamespace = 'public'::regnamespace;
--   -- expect the mig 238 body: 89d0fc71bac65cb00b9bb82d7756e54d / 10028
--   --                       or b91a9dc32163cda899d0a3e9c62893dd / 9791
--
-- POST-CHECK:
--   SELECT md5(prosrc), length(prosrc) FROM pg_proc
--    WHERE proname = 'get_available_pickup_dates' AND pronamespace = 'public'::regnamespace;
--   -- expect e1c0d827187c971c62a15e4434ae2a46 / 11280
--   --     or c00f182bdbc032a916007faa50fa3511 / 11023
--   SELECT obj_description('public.get_available_pickup_dates'::regproc) LIKE '%Mig 254%';  -- expect true
-- ============================================================================

BEGIN;

-- ============================================================================
-- get_available_pickup_dates — mig 238 text + the selection predicate
-- @paired-rule event-sells-on-acceptance
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
                 -- SELECTION (mig 254, owner 2026-09-17: "vendor D can't take
                 -- pre-orders for the event until selected by the event
                 -- organizer"). On a SELF-SERVICE event, accepted is not
                 -- attending: the event turns 'ready' at the acceptance
                 -- threshold, BEFORE the organizer picks anyone, and a late
                 -- responder arrives un-benched — on a FREE event both sold
                 -- with no selection at all. organizer_selected_at is written
                 -- only by the select route and the cancel route's step-in.
                 -- ADMIN-MANAGED events never stamp, so they keep the
                 -- acceptance rule; so does an event market with no request.
                 -- ⛔ Event branch ONLY — a vendor's regular locations are
                 -- never affected by being unselected or benched.
                 AND (
                   mv.organizer_selected_at IS NOT NULL
                   OR NOT EXISTS (
                     SELECT 1 FROM catering_requests cr_sel
                      WHERE cr_sel.market_id = m.id
                        AND cr_sel.service_level = 'self_service'
                   )
                 )
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
        -- SCOPED by mig 235 (staging-confirmed bypass 2026-08-16): on EVENT
        -- markets a vendor_market_schedules row must NOT be an independent
        -- license to sell — a benched, unpaid vendor with a stray/seeded vms
        -- row sold straight past the attendance gate. On traditional markets
        -- the vms row IS the attendance declaration; there it stays law.
        OR (m.market_type <> 'event' AND vms.id IS NOT NULL)
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
      -- R3-4 (mig 238, owner rule 2026-08-27): the vendor chose an EVENT over
      -- this location that day — pre-orders here are PAUSED so nothing lands
      -- for a day they will not be there. Rows are written by the event
      -- accept route (lib/events/blackouts.ts) and lifted on every event exit
      -- (benched / withdrew / event cancelled). Event markets are never
      -- blacked out — the blackout is on the location being skipped.
      AND (
        ls.market_type = 'event'
        OR NOT EXISTS (
          SELECT 1 FROM vendor_date_blackouts vb
          WHERE vb.vendor_profile_id = ls.listing_vendor_id
            AND vb.market_id = ls.market_id
            AND vb.blackout_date = ds.potential_date
        )
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
  'Events do not require a vendor_market_schedules row; attendance replaces it — and (mig 235) a vms row grants NO event bypass: the vms fallback is scoped to non-event markets. '
  'Private pickup: no vms requirement. '
  'FT non-event: today + advance_order_days window, 0 cutoff. '
  'Events: actual event date range as candidates. Past events auto-filtered. '
  'Day-of ordering: when event_allow_day_of_orders=true AND local_today >= event_start_date, cutoff=0 (accepting until event ends). '
  'Vendor custom times used when available. Enforces season dates. '
  'Phase C (mig 162): excludes dates with a market_date_overrides cancelled row. '
  'T5 (mig 199): park_mode=paid FT markets additionally require a PAID park_spot_bookings row for (vendor, market, date) — booking = selling = paid; multiple_trucks grants no exemption. '
  'G1 (mig 200): barred bookings (manager_barred_at set) do not sell — the bar keeps the row paid to hold the slot, but the truck was removed from that date.' 
  'R3-4 (mig 238): a non-event market date is dropped when vendor_date_blackouts holds (vendor, market, date) — the vendor chose an event over this location that day; rows are written by the event accept route and lifted on every event exit. '
  'Mig 254 (owner 2026-09-17): on SELF-SERVICE events (catering_requests.service_level = self_service) the attending vendor must also be SELECTED by the organizer (market_vendors.organizer_selected_at set) — accepted-but-unselected vendors and late responders do not sell at the event. Admin-managed events and event markets with no request keep the acceptance rule. Non-event markets are untouched: not being selected never affects a vendor''s regular locations.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- ROLLBACK — re-run the CREATE OR REPLACE FUNCTION get_available_pickup_dates
-- statement (and its COMMENT) from
-- supabase/migrations/applied/20260827_238_vendor_date_blackouts.sql. No data
-- is touched in either direction.
-- ============================================================================
