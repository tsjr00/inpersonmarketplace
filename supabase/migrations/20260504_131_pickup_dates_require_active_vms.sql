-- ============================================================================
-- Migration 131: Require active vendor_market_schedules for ALL traditional
--                markets in get_available_pickup_dates()
-- ============================================================================
-- Problem (Session 78 investigation):
--   Migration 109's `get_available_pickup_dates` exempted farmers_market from
--   the vendor_market_schedules (vms) attendance requirement. The cart
--   validator (api/cart/route.ts:222-239) and the vendor profile page
--   (vendor/[vendorId]/profile/page.tsx:381-397, 425-429) both correctly
--   require an active vms row for traditional markets. The SQL function did
--   not. Result: FM listings showed green pickup dates on the listing detail
--   page for markets where the vendor had deactivated attendance — buyer adds
--   to cart, then cart blocks with "Vendor is no longer attending this market
--   day" and checkout greys out. Real test case: vendor Sweet Rise Bakery
--   (60edb3d6-...) has inactive vms rows for Amarillo Community + Canyon
--   Farmers Market; listings showed dates anyway.
--
-- Fix:
--   Tighten the WHERE clause in the listing_schedules CTE so traditional
--   markets in ANY vertical require a present vms row (the LEFT JOIN's
--   `AND vms.is_active = true` filter ensures only active rows match).
--
-- Backfill check (run before applying):
--   Query A in the recommendation write-up returned 6 rows — all 3 of Sweet
--   Rise Bakery's listings × 2 markets, all with inactive_vms_count=1 and
--   missing_vms_count=0. Zero FM listings rely on the "no vms row exists"
--   branch of the prior exemption, so no data backfill is needed.
--
-- Behavior matrix (only FM traditional changes):
--   FT traditional      : requires vms (unchanged)
--   FT event            : requires vms (unchanged)
--   FT private_pickup   : no vms required (unchanged)
--   FM traditional      : requires vms  ← THE CHANGE
--   FM event            : no vms required (unchanged — events are
--                         organizer-driven, not vendor-attendance-driven)
--   FM private_pickup   : no vms required (unchanged)
--
-- Only differences from migration 109: the WHERE clause in listing_schedules
-- and this header comment. Everything else is preserved verbatim.
-- ============================================================================

DROP FUNCTION IF EXISTS get_available_pickup_dates(uuid);

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
      COALESCE(l.advance_order_days, 0) as advance_order_days
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
        -- THE FIX: traditional markets in ALL verticals require an active
        -- vms row (vms.id IS NOT NULL after the is_active=true LEFT JOIN
        -- filter). Previously FM was exempt via `vertical_id != 'food_trucks'`,
        -- which incorrectly let dates appear for markets the vendor had
        -- deactivated.
        m.market_type = 'private_pickup'
        OR (m.market_type = 'event' AND m.vertical_id != 'food_trucks')
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
  'FT events: REQUIRE active vendor_market_schedules row. '
  'FM events: no vms requirement (organizer-driven). '
  'Private pickup: no vms requirement. '
  'FT non-event: today + advance_order_days window, 0 cutoff. '
  'Events: actual event date range as candidates. Past events auto-filtered. '
  'Day-of ordering: when event_allow_day_of_orders=true AND local_today >= event_start_date, cutoff=0 (accepting until event ends). '
  'Vendor custom times used when available. Enforces season dates.';

NOTIFY pgrst, 'reload schema';
