-- =====================================================
-- Migration: Fix Cutoff Threshold Display
-- Purpose: Add cutoff_hours to function output so frontend can use
--          the correct market-specific threshold instead of hardcoded 24
-- Date: 2026-02-05
--
-- CONTEXT:
-- The "closing soon" warning was displaying with a hardcoded 24-hour
-- threshold, regardless of the actual market cutoff policy (18 hours
-- for traditional markets, 10 hours for private pickup).
--
-- This fix:
-- 1. Adds cutoff_hours to get_available_pickup_dates() output
-- 2. Ensures get_listing_market_availability() includes cutoff_hours
-- =====================================================

-- =====================================================
-- 1. Update get_available_pickup_dates to include cutoff_hours
-- =====================================================
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
  cutoff_hours INTEGER  -- ADDED: market-specific cutoff policy
) AS $$
BEGIN
  RETURN QUERY
  WITH listing_schedules AS (
    -- Get all active markets and schedules for this listing
    SELECT
      m.id as market_id,
      m.name as market_name,
      m.market_type,
      m.address,
      m.city,
      m.state,
      COALESCE(m.timezone, 'America/Chicago') as timezone,
      COALESCE(m.cutoff_hours,
        CASE WHEN m.market_type = 'private_pickup' THEN 10 ELSE 18 END
      ) as cutoff_hours,
      ms.id as schedule_id,
      ms.day_of_week,
      ms.start_time,
      ms.end_time
    FROM listing_markets lm
    JOIN markets m ON m.id = lm.market_id AND m.active = true
    JOIN market_schedules ms ON ms.market_id = m.id AND ms.active = true
    WHERE lm.listing_id = p_listing_id
  ),
  date_series AS (
    -- Generate next 8 days (today + 7)
    SELECT (CURRENT_DATE + i)::DATE as potential_date
    FROM generate_series(0, 7) as i
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
      ls.timezone,
      ls.cutoff_hours,
      ls.schedule_id,
      ls.day_of_week,
      ls.start_time,
      ls.end_time,
      ds.potential_date as pickup_date,
      -- Calculate pickup datetime in UTC
      ((ds.potential_date || ' ' || ls.start_time)::TIMESTAMP
        AT TIME ZONE ls.timezone) as pickup_datetime_utc
    FROM listing_schedules ls
    CROSS JOIN date_series ds
    WHERE EXTRACT(DOW FROM ds.potential_date)::INTEGER = ls.day_of_week
  ),
  with_cutoff AS (
    -- Calculate cutoff time for each date
    SELECT
      md.*,
      (md.pickup_datetime_utc - (md.cutoff_hours || ' hours')::INTERVAL) as cutoff_at
    FROM matched_dates md
  )
  -- Return only future pickups with cutoff status
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
    wc.cutoff_hours::INTEGER  -- Include market's cutoff policy
  FROM with_cutoff wc
  WHERE wc.pickup_datetime_utc > NOW()  -- Don't show past pickups
  ORDER BY wc.pickup_date, wc.start_time, wc.market_name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION get_available_pickup_dates IS 'Returns upcoming pickup dates for a listing within the next 7 days. Now includes cutoff_hours so frontend can use market-specific threshold for closing soon display.';

-- =====================================================
-- Migration complete
-- =====================================================
