-- ============================================================================
-- Migration 255: managed, fee-charging farmers markets sell PAID booth weeks only
--                owner rulings 2026-09-18 (decisions.md "Managed-market obligation")
-- ============================================================================
-- ⚠ PRE-CHECK FIRST class. FUNCTION REPLACE, BEHAVIOUR CHANGE ON ARRIVAL: at a
-- MANAGED farmers market that CHARGES for booths, a vendor whose attendance row
-- alone let their items sell stops selling any date not covered by a PAID booth
-- week. Run the pre-check below on the target environment and read the rows.
-- Owner: Staging first; Prod holds seed data only — verify with the pre-check
-- before any prod paste. ⚠ Prod must have 254 BEFORE 255 (this text is 254 + one
-- predicate). No table, column, index, policy or grant changes.
--
-- WHY
-- Owner 2026-09-18 (OB-026 #3, OB-027): for FM the app KNEW about paid booth weeks
-- (strip, conflict checker, credits all read them) but never REQUIRED one —
-- selling and buyer visibility ran on the attendance row alone, so an approved
-- vendor at a fee-charging managed market could be listed, be "scheduled" and take
-- pre-orders for weeks they never paid for. FT paid parks already close this
-- (mig 199: booking = selling = paid). Ruling: apply the same rule to FM.
--
-- WHAT CHANGES
-- get_available_pickup_dates = MIG 254's text (live body verified identical on Dev
-- and Staging 2026-09-17/18, owner-run md5(prosrc) = e1c0d827… / 11280) with:
--   (1) m.manager_user_id carried into the listing_schedules CTE,
--   (2) ONE predicate in matched_dates (after the T5 park block): FM + traditional
--       + managed + priced tier → require a PAID weekly_booth_rentals row covering
--       the date; every other market kind short-circuits out,
--   (3) one COMMENT sentence.
-- Proven by diff at build time. Non-FM, non-managed, free, private-pickup and
-- event branches are untouched.
-- @paired-rule managed-fee-market-sells-paid-weeks — TS twin lib/markets/managed-fee-gate.ts
-- (buyer visibility + vendor week strip read it) in the same commit.
--
-- EXEC-GRANT-EXEMPT (guardrail Rule M): read-only STABLE function called by the
-- PUBLIC listing page with the visitor's own session (anonymous shoppers included,
-- app/[vertical]/listing/[listingId]/page.tsx). CREATE OR REPLACE keeps grants.
--
-- PRE-CHECK (read-only) — vendors who stop selling at a market when this lands:
--   SELECT m.name AS market, vp.id AS vendor_profile_id,
--          (vp.profile_data->>'business_name') AS vendor,
--          count(vms.id) AS active_attendance_rows
--   FROM markets m
--   JOIN market_booth_inventory bi ON bi.market_id = m.id AND bi.weekly_price_cents > 0
--   JOIN vendor_market_schedules vms ON vms.market_id = m.id AND vms.is_active = true
--   JOIN vendor_profiles vp ON vp.id = vms.vendor_profile_id
--   WHERE m.vertical_id = 'farmers_market' AND m.market_type = 'traditional'
--     AND m.manager_user_id IS NOT NULL
--     AND NOT EXISTS (
--       SELECT 1 FROM weekly_booth_rentals r
--       WHERE r.market_id = m.id AND r.vendor_profile_id = vp.id
--         AND r.status = 'paid' AND r.week_start_date >= current_date - 6)
--   GROUP BY m.name, vp.id, vp.profile_data->>'business_name'
--   ORDER BY m.name, vendor;
--   -- 0 rows = nobody changes. Rows = vendors at managed fee markets with no paid
--   -- current/upcoming week: their items stop selling there until they book (intended).
--   SELECT md5(prosrc), length(prosrc) FROM pg_proc
--    WHERE proname = 'get_available_pickup_dates' AND pronamespace = 'public'::regnamespace;
--   -- expect the mig 254 body: e1c0d827187c971c62a15e4434ae2a46 / 11280
--   --                       or c00f182bdbc032a916007faa50fa3511 / 11023
--
-- POST-CHECK:
--   SELECT md5(prosrc), length(prosrc) FROM pg_proc
--    WHERE proname = 'get_available_pickup_dates' AND pronamespace = 'public'::regnamespace;
--   -- expect dd446c1a4b70b10db45708e568181156 / 12790
--   --     or adc6bf36b063774fdeda7057b25818ae / 12504
--   SELECT obj_description('public.get_available_pickup_dates'::regproc) LIKE '%Mig 255%';  -- expect true
-- ============================================================================

BEGIN;

-- ============================================================================
-- get_available_pickup_dates — mig 254 text + the managed-fee predicate
-- @paired-rule managed-fee-market-sells-paid-weeks
-- @paired-rule event-sells-on-acceptance (event branch carried forward verbatim)
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
      m.park_mode,
      -- mig 255: managed-market obligation (owner 2026-09-18) needs the manager flag per date row.
      m.manager_user_id
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
      -- D1 (mig 255, owner rulings 2026-09-18, decisions.md "Managed-market
      -- obligation"): at a MANAGED, FEE-CHARGING farmers market a vendor sells a
      -- date only with a PAID booth week covering it — the FT paid-park rule (T5
      -- above) applied to FM. Managed = markets.manager_user_id set; charging =
      -- any market_booth_inventory tier with weekly_price_cents > 0. A booth week
      -- runs 7 days from week_start_date. Off-app markets, FREE managed markets,
      -- private pickups, FT and events are untouched by this predicate (the
      -- short-circuits fire first). TS twin: lib/markets/managed-fee-gate.ts
      -- (@paired-rule managed-fee-market-sells-paid-weeks).
      AND (
        ls.vertical_id <> 'farmers_market'
        OR ls.market_type <> 'traditional'
        OR ls.manager_user_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM market_booth_inventory bi
          WHERE bi.market_id = ls.market_id
            AND bi.weekly_price_cents > 0
        )
        OR EXISTS (
          SELECT 1 FROM weekly_booth_rentals wbr
          WHERE wbr.vendor_profile_id = ls.listing_vendor_id
            AND wbr.market_id = ls.market_id
            AND wbr.status = 'paid'
            AND ds.potential_date >= wbr.week_start_date
            AND ds.potential_date <= wbr.week_start_date + 6
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
  'Mig 254 (owner 2026-09-17): on SELF-SERVICE events (catering_requests.service_level = self_service) the attending vendor must also be SELECTED by the organizer (market_vendors.organizer_selected_at set) — accepted-but-unselected vendors and late responders do not sell at the event. Admin-managed events and event markets with no request keep the acceptance rule. Non-event markets are untouched: not being selected never affects a vendor''s regular locations. '
  'Mig 255 (owner 2026-09-18): at a MANAGED (markets.manager_user_id set), FEE-CHARGING (any market_booth_inventory.weekly_price_cents > 0) farmers market, a date sells only when the vendor holds a PAID weekly_booth_rentals row covering it (week_start_date .. +6). Off-app markets, free managed markets, private pickups, food trucks and events are untouched.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- ROLLBACK — re-run the CREATE OR REPLACE FUNCTION get_available_pickup_dates
-- statement (and its COMMENT) from supabase/migrations/20260917_254_events_sell_on_selection.sql.
-- No data is touched in either direction.
-- ============================================================================
