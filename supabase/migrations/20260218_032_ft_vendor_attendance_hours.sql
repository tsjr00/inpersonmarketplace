-- =====================================================
-- Migration: 20260218_032_ft_vendor_attendance_hours.sql
-- Purpose: Complete FT vendor attendance data flow
--
-- Changes:
--   A. Add vendor_start_time/vendor_end_time to vendor_market_schedules
--      - Nullable TIME columns for vendor-specific operating hours
--      - FM vendors leave NULL (use market schedule times)
--      - FT vendors can set their own hours per park day
--
--   B. Backfill vendor_market_schedules for existing FT vendors
--      - Creates attendance records for every (FT vendor, market, schedule)
--        combination found via listing_markets → listings → vendor_profiles
--      - ON CONFLICT DO NOTHING to avoid duplicates
--      - Sets is_active = true, vendor times = NULL (use market hours)
--
--   C. Rewrite get_available_pickup_dates() to filter by attendance
--      - JOIN listings to get vendor_profile_id
--      - LEFT JOIN vendor_market_schedules for attendance + vendor times
--      - FT: require attendance record (WHERE vms.id IS NOT NULL)
--      - FM: no filter (LEFT JOIN passes through)
--      - FT vendor times: COALESCE(vms.vendor_start_time, ms.start_time)
-- =====================================================

-- Step A: Add vendor time columns
ALTER TABLE vendor_market_schedules
  ADD COLUMN IF NOT EXISTS vendor_start_time TIME,
  ADD COLUMN IF NOT EXISTS vendor_end_time TIME;

COMMENT ON COLUMN vendor_market_schedules.vendor_start_time IS
  'Vendor-specific start time at this market day. NULL = use market schedule time.';
COMMENT ON COLUMN vendor_market_schedules.vendor_end_time IS
  'Vendor-specific end time at this market day. NULL = use market schedule time.';

-- Step B: Backfill attendance for existing FT vendor-listing-market combos
INSERT INTO vendor_market_schedules (vendor_profile_id, market_id, schedule_id, is_active)
SELECT DISTINCT
  l.vendor_profile_id,
  lm.market_id,
  ms.id as schedule_id,
  true as is_active
FROM listing_markets lm
JOIN listings l ON l.id = lm.listing_id
JOIN vendor_profiles vp ON vp.id = l.vendor_profile_id
  AND vp.vertical_id = 'food_trucks'
JOIN markets m ON m.id = lm.market_id
  AND m.active = true
  AND m.market_type = 'traditional'
JOIN market_schedules ms ON ms.market_id = m.id
  AND ms.active = true
ON CONFLICT (vendor_profile_id, schedule_id) DO NOTHING;

-- Step C: Rewrite get_available_pickup_dates with attendance filtering
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
      -- Use vendor-specific times when available, fall back to market schedule times
      COALESCE(vms.vendor_start_time, ms.start_time) as start_time,
      COALESCE(vms.vendor_end_time, ms.end_time) as end_time,
      vms.id as vms_id
    FROM listing_markets lm
    JOIN listings l ON l.id = lm.listing_id
    JOIN markets m ON m.id = lm.market_id
      AND m.active = true
      AND (m.season_start IS NULL OR CURRENT_DATE >= m.season_start)
      AND (m.season_end IS NULL OR CURRENT_DATE <= m.season_end)
    JOIN market_schedules ms ON ms.market_id = m.id AND ms.active = true
    LEFT JOIN vendor_market_schedules vms
      ON vms.vendor_profile_id = l.vendor_profile_id
      AND vms.schedule_id = ms.id
      AND vms.is_active = true
    WHERE lm.listing_id = p_listing_id
      -- FT: require vendor attendance record (traditional markets only)
      -- FM/others: LEFT JOIN passes through (no attendance required)
      AND (
        m.vertical_id != 'food_trucks'
        OR m.market_type != 'traditional'
        OR vms.id IS NOT NULL
      )
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
  'Returns upcoming pickup dates for a listing. '
  'FM: next 7 days with advance cutoff, no attendance filter. '
  'FT: today only, 0 cutoff (accepts until market ends), REQUIRES vendor attendance record for traditional markets. '
  'When vendor has custom start/end times, uses those instead of market schedule times. '
  'Enforces season dates. Returns cutoff_hours for frontend display.';

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
