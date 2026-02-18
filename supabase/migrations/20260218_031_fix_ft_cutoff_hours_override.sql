-- =====================================================
-- Migration: 20260218_031_fix_ft_cutoff_hours_override.sql
-- Purpose: Fix COALESCE bug in get_available_pickup_dates() for food trucks
--
-- Problem:
--   COALESCE(m.cutoff_hours, CASE WHEN FT THEN 0 ... END) returns the
--   DB value (e.g. 18) when non-NULL, so FT default of 0 never applies.
--   This caused FT listings to show "closed" on the detail page because
--   cutoff_at = start_time - 18hrs = yesterday (always in the past).
--
-- Fix:
--   1. Change to: CASE WHEN FT THEN 0 ELSE COALESCE(...) END
--      FT always gets 0 regardless of DB value (no advance cutoff concept)
--   2. Update all FT markets to cutoff_hours = 0 (not just NULL ones)
--
-- JS equivalent already fixed in listing-availability.ts (commit c9ef313)
-- =====================================================

-- Step 1: Force all FT markets to cutoff_hours = 0 (not just NULL ones)
UPDATE markets
SET cutoff_hours = 0
WHERE vertical_id = 'food_trucks'
  AND cutoff_hours != 0;

-- Step 2: Recreate function with fixed cutoff logic
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
    SELECT
      m.id as market_id,
      m.name as market_name,
      m.market_type,
      m.address,
      m.city,
      m.state,
      m.vertical_id,
      COALESCE(m.timezone, 'America/Chicago') as timezone,
      -- FT: ALWAYS 0 (no advance cutoff — accept orders until truck closes)
      -- FM: use DB value, fallback to 10 (private) or 18 (traditional)
      CASE
        WHEN m.vertical_id = 'food_trucks' THEN 0
        ELSE COALESCE(m.cutoff_hours,
          CASE WHEN m.market_type = 'private_pickup' THEN 10 ELSE 18 END
        )
      END as cutoff_hours,
      ms.id as schedule_id,
      ms.day_of_week,
      ms.start_time,
      ms.end_time
    FROM listing_markets lm
    JOIN markets m ON m.id = lm.market_id
      AND m.active = true
      AND (m.season_start IS NULL OR CURRENT_DATE >= m.season_start)
      AND (m.season_end IS NULL OR CURRENT_DATE <= m.season_end)
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
      ls.vertical_id,
      ls.timezone,
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
      -- Food trucks: today only (same-day ordering)
      AND (ls.vertical_id != 'food_trucks' OR ds.potential_date = CURRENT_DATE)
  ),
  with_cutoff AS (
    -- Calculate cutoff time for each date
    SELECT
      md.*,
      CASE
        -- FT with 0 cutoff: accepting until market ends
        WHEN md.cutoff_hours = 0 THEN md.pickup_end_utc
        -- FM/others: advance cutoff before market starts
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
  'Returns upcoming pickup dates for a listing. FM: next 7 days with advance cutoff. '
  'FT: today only, ALWAYS 0 cutoff (accepts until market ends, regardless of DB value). '
  'Enforces season dates. Returns cutoff_hours for frontend display.';

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
