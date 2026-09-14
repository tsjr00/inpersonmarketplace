-- ============================================================================
-- Migration 238: vendor_date_blackouts + pickup dates honor them (R3-4)
--                owner rule 2026-08-27 "Event ↔ location conflicts"
-- ============================================================================
-- PASTE-AND-GO class. ADDITIVE table + FUNCTION REPLACE. INERT ON ARRIVAL:
-- the function change can only remove pickup dates for (vendor, market, date)
-- triples that have a row in the NEW table, and the table is empty when this
-- is applied — so no listing's dates move at apply time anywhere. The first
-- rows are written by code (the event accept route), never by this file.
--
-- WHY
-- A single-truck vendor (FM: a vendor who cannot staff two locations at once)
-- may take an EVENT over a location they are scheduled or booked at that day,
-- PROVIDED that location holds no open pre-orders for the date. When they do,
-- the platform must "turn off pre-orders for that timeframe so no orders can
-- come in to be filled while they are at the event" (owner). Whole-day
-- blackout, on the location being skipped. Multi-truck / multi-location
-- vendors confirm they will cover both and get NO blackout.
--
-- (1) vendor_date_blackouts — one row per (vendor, location, date). Written by
--     lib/events/blackouts.ts at event acceptance; source_event_market_id says
--     which event caused it and is what the lift uses when the vendor is
--     benched, withdraws, or the event dies. NULL source = manual (future
--     "skip this day" UI on the same table). ON DELETE CASCADE everywhere: a
--     deleted vendor/market/event takes its blackouts with it (no orphans).
-- (2) get_available_pickup_dates = MIG 235's text with ONE predicate added in
--     matched_dates (proven by diff at build time: exactly one hunk in the
--     function + the COMMENT string): a NON-EVENT market date is dropped when a
--     blackout row matches. Event markets are untouched (the blackout is on the
--     location being skipped, never on the event).
--
-- Consumers that honor the blackout THROUGH this function (no code change):
-- listing page pickup picker, cart schedule validation, vendor listings page,
-- season/manager stats. Check-in eligibility deliberately does NOT read it
-- (owner 2026-08-27: no bail-out on the no-show record — the vendor chose).
--
-- Pre-check (optional):
--   SELECT to_regclass('public.vendor_date_blackouts');          -- expect NULL
-- Post-check:
--   SELECT to_regclass('public.vendor_date_blackouts');          -- expect the name
--   SELECT count(*) FROM vendor_date_blackouts;                  -- expect 0
--   SELECT obj_description('public.get_available_pickup_dates'::regproc)
--          LIKE '%mig 238%';                                     -- expect true
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.vendor_date_blackouts (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id      UUID NOT NULL REFERENCES public.vendor_profiles(id) ON DELETE CASCADE,
  -- The location being paused (traditional market / park / private pickup).
  market_id              UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  blackout_date          DATE NOT NULL,
  -- The event the vendor chose instead. NULL = manual blackout (future UI).
  source_event_market_id UUID REFERENCES public.markets(id) ON DELETE CASCADE,
  reason                 TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.vendor_date_blackouts IS
  'R3-4 (mig 238): a vendor is NOT selling at market_id on blackout_date — written when they choose an event over that location for the day (source_event_market_id), lifted on every event exit. get_available_pickup_dates drops the date; check-in does NOT read this (owner: no bail-out on the no-show record).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_date_blackout
  ON public.vendor_date_blackouts (vendor_profile_id, market_id, blackout_date);
CREATE INDEX IF NOT EXISTS idx_vendor_date_blackouts_source
  ON public.vendor_date_blackouts (source_event_market_id)
  WHERE source_event_market_id IS NOT NULL;

-- Default-deny; the service client does all writes. Vendors may read their own
-- rows (a future "skip this day" UI needs it; harmless now).
ALTER TABLE public.vendor_date_blackouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_date_blackouts_own_select ON public.vendor_date_blackouts;
CREATE POLICY vendor_date_blackouts_own_select
  ON public.vendor_date_blackouts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendor_profiles vp
    WHERE vp.id = vendor_date_blackouts.vendor_profile_id AND vp.user_id = auth.uid()
  ));

-- ============================================================================
-- get_available_pickup_dates — mig 235 text + the blackout predicate (R3-4)
-- @paired-rule event-sells-on-acceptance — event branch carried forward
-- verbatim from mig 234/235; nothing about attendance changes here.
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
  'R3-4 (mig 238): a non-event market date is dropped when vendor_date_blackouts holds (vendor, market, date) — the vendor chose an event over this location that day; rows are written by the event accept route and lifted on every event exit.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- ROLLBACK — two statements, no live data touched (the table is only ever
-- written by the accept route; dropping it discards blackouts, which is the
-- intended effect of rolling this feature back)
-- ============================================================================
-- 1. Re-apply migration 235 verbatim (attendance gate + scoped vms bypass kept):
--      supabase/migrations/applied/20260816_235_event_vms_bypass_scoped.sql
--    CREATE OR REPLACE preserves grants; nothing dropped there.
-- 2. DROP TABLE IF EXISTS public.vendor_date_blackouts;
-- ============================================================================
