-- ============================================================================
-- Migration 105: Fix event dates excluded from pickup date generation
-- ============================================================================
-- Problem: get_available_pickup_dates() generates candidate dates via
-- generate_series(0, 7) — an 8-day window from today. Events more than
-- 7 days away never appear as candidates, so validate_cart_item_schedule()
-- returns FALSE and buyers cannot add event items to their cart.
--
-- Fix: Add a UNION to the date_series CTE that includes the actual event
-- date range for event-type markets. This only activates when
-- market_type = 'event' AND event_start_date IS NOT NULL.
--
-- No change to regular markets, private pickups, FT parks, or service
-- locations — the existing generate_series(0, 7) is untouched.
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
    -- Get all active markets and schedules for this listing
    -- JOIN listings to get vendor_profile_id for attendance lookup
    SELECT
      m.id as market_id,
      m.name as market_name,
      m.market_type,
      m.address,
      m.city,
      m.state,
      m.vertical_id,
      COALESCE(m.timezone, 'America/Chicago') as timezone,
      -- "Today" in the market's local timezone (NOT UTC)
      (NOW() AT TIME ZONE COALESCE(m.timezone, 'America/Chicago'))::DATE as local_today,
      m.event_start_date,
      m.event_end_date,
      -- FT parks: ALWAYS 0 (no advance cutoff — accept orders until truck closes)
      -- FT events: use DB value, fallback to 24 (advance ordering like FM)
      -- FM: use DB value, fallback by market type
      CASE
        WHEN m.vertical_id = 'food_trucks' AND m.market_type != 'event' THEN 0
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
      -- Use vendor-specific times when available, fall back to market schedule times
      COALESCE(vms.vendor_start_time, ms.start_time) as start_time,
      COALESCE(vms.vendor_end_time, ms.end_time) as end_time,
      vms.id as vms_id,
      -- Advance ordering: how many days ahead can customers order this listing
      COALESCE(l.advance_order_days, 0) as advance_order_days
    FROM listing_markets lm
    JOIN listings l ON l.id = lm.listing_id
    JOIN markets m ON m.id = lm.market_id
      AND m.active = true
      -- Season checks use market's local date
      AND (m.season_start IS NULL OR (NOW() AT TIME ZONE COALESCE(m.timezone, 'America/Chicago'))::DATE >= m.season_start)
      AND (m.season_end IS NULL OR (NOW() AT TIME ZONE COALESCE(m.timezone, 'America/Chicago'))::DATE <= m.season_end)
      -- Filter out past events (using market's local date)
      AND (m.market_type != 'event' OR m.event_end_date >= (NOW() AT TIME ZONE COALESCE(m.timezone, 'America/Chicago'))::DATE)
    JOIN market_schedules ms ON ms.market_id = m.id AND ms.active = true
    LEFT JOIN vendor_market_schedules vms
      ON vms.vendor_profile_id = l.vendor_profile_id
      AND vms.schedule_id = ms.id
      AND vms.is_active = true
    WHERE lm.listing_id = p_listing_id
      -- FT: require vendor attendance record for traditional markets AND events
      -- FM/others: LEFT JOIN passes through (no attendance required)
      AND (
        m.vertical_id != 'food_trucks'
        OR m.market_type NOT IN ('traditional', 'event')
        OR vms.id IS NOT NULL
      )
  ),
  date_series AS (
    -- Regular markets: next 8 days starting from each market's local "today"
    SELECT DISTINCT (ls.local_today + i)::DATE as potential_date
    FROM listing_schedules ls
    CROSS JOIN generate_series(0, 7) as i

    UNION

    -- Events: include the actual event date range (may be beyond the 8-day window)
    -- Only activates for market_type = 'event' with a defined start date
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
    -- Match schedules to dates based on day_of_week
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
      -- Calculate start and end datetimes in UTC
      ((ds.potential_date || ' ' || ls.start_time)::TIMESTAMP
        AT TIME ZONE ls.timezone) as pickup_start_utc,
      ((ds.potential_date || ' ' || ls.end_time)::TIMESTAMP
        AT TIME ZONE ls.timezone) as pickup_end_utc
    FROM listing_schedules ls
    CROSS JOIN date_series ds
    WHERE EXTRACT(DOW FROM ds.potential_date)::INTEGER = ls.day_of_week
      -- Events: only show dates within the event's date range
      AND (
        ls.market_type != 'event'
        OR (ds.potential_date >= ls.event_start_date AND ds.potential_date <= ls.event_end_date)
      )
      -- Food truck non-event markets: date window depends on advance_order_days
      -- Regular items (advance_order_days = 0): today only (same-day ordering)
      -- Catering items (advance_order_days > 0): 2-day minimum lead time + max window
      --   e.g. advance_order_days=3 → dates from local_today+2 to local_today+3
      -- FM/events/others: full 7-day window (unchanged)
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
    -- Calculate cutoff time for each date
    SELECT
      md.*,
      CASE
        -- FT parks with 0 cutoff: accepting until market ends
        WHEN md.cutoff_hours = 0 THEN md.pickup_end_utc
        -- FM/events/others: advance cutoff before market starts
        ELSE md.pickup_start_utc - (md.cutoff_hours || ' hours')::INTERVAL
      END as cutoff_at
    FROM matched_dates md
  )
  -- Return pickups that haven't fully ended
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
  -- Use end_time so FT markets still show while operating
  WHERE wc.pickup_end_utc > NOW()
  ORDER BY wc.pickup_date, wc.start_time, wc.market_name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION get_available_pickup_dates IS
  'Returns upcoming pickup dates for a listing. '
  'All date comparisons use market timezone (NOT UTC) to prevent evening blackout bug. '
  'FM: next 7 days with advance cutoff, no attendance filter. '
  'FT parks: today + advance_order_days window (default 0 = today only), 0 cutoff (accepts until truck closes), REQUIRES vendor attendance record. '
  'FT events: 7-day window with advance cutoff (default 24h), REQUIRES vendor attendance record. '
  'Events: actual event date range included as candidates (not limited to 8-day window), past events auto-filtered. '
  'When vendor has custom start/end times, uses those instead of market schedule times. '
  'Enforces season dates. Returns cutoff_hours for frontend display.';

NOTIFY pgrst, 'reload schema';
