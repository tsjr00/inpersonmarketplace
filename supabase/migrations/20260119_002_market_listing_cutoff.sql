-- Migration: Market Listing Cutoff Feature
-- Purpose: Auto-close listings 18 hours before traditional market day
-- This prevents new orders when vendors need time to prepare

-- =====================================================
-- 1. Add timezone column to markets table
-- =====================================================
ALTER TABLE markets
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Chicago';

COMMENT ON COLUMN markets.timezone IS 'IANA timezone identifier for the market location (e.g., America/Chicago, America/New_York)';

-- =====================================================
-- 2. Add cutoff_hours column for cutoff per market type
-- Traditional markets: 18 hours (vendors need time to harvest, pack, load)
-- Private pickup: 10 hours (vendor controls timing, less prep needed)
-- =====================================================
ALTER TABLE markets
ADD COLUMN IF NOT EXISTS cutoff_hours INTEGER DEFAULT 18;

COMMENT ON COLUMN markets.cutoff_hours IS 'Hours before market/pickup time when listings stop accepting orders. Traditional markets default to 18 hours, private pickup to 10 hours.';

-- Set default cutoff for private_pickup markets
UPDATE markets SET cutoff_hours = 10 WHERE market_type = 'private_pickup' AND cutoff_hours = 18;

-- =====================================================
-- 3. Function to get next occurrence of a market day
-- Given a day_of_week (0=Sunday) and time, returns the next datetime
-- =====================================================
CREATE OR REPLACE FUNCTION get_next_market_datetime(
  p_day_of_week INTEGER,
  p_start_time TIME,
  p_timezone TEXT DEFAULT 'America/Chicago'
)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_now TIMESTAMPTZ;
  v_today_dow INTEGER;
  v_days_until INTEGER;
  v_next_date DATE;
  v_result TIMESTAMPTZ;
BEGIN
  -- Get current time in the market's timezone
  v_now := NOW() AT TIME ZONE p_timezone;
  v_today_dow := EXTRACT(DOW FROM v_now)::INTEGER;

  -- Calculate days until next occurrence
  v_days_until := p_day_of_week - v_today_dow;

  -- If negative or zero, check if market time has passed today
  IF v_days_until < 0 THEN
    v_days_until := v_days_until + 7;
  ELSIF v_days_until = 0 THEN
    -- Same day - check if market time has passed
    IF v_now::TIME > p_start_time THEN
      v_days_until := 7; -- Next week
    END IF;
  END IF;

  -- Calculate the next market date
  v_next_date := (v_now::DATE + v_days_until);

  -- Combine date and time in market timezone, then convert to UTC
  v_result := (v_next_date || ' ' || p_start_time)::TIMESTAMP AT TIME ZONE p_timezone;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_next_market_datetime IS 'Calculates the next datetime a market will occur based on day_of_week and start_time';

-- =====================================================
-- 4. Function to get cutoff time for a specific market
-- Works for both traditional markets and private pickup locations
-- Returns NULL if market has no schedules
-- =====================================================
CREATE OR REPLACE FUNCTION get_market_cutoff(
  p_market_id UUID
)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_market RECORD;
  v_schedule RECORD;
  v_next_market TIMESTAMPTZ;
  v_cutoff TIMESTAMPTZ;
  v_earliest_cutoff TIMESTAMPTZ := NULL;
  v_cutoff_hours INTEGER;
BEGIN
  -- Get market info
  SELECT id, market_type, timezone, cutoff_hours
  INTO v_market
  FROM markets
  WHERE id = p_market_id AND active = true;

  -- If market not found, return NULL
  IF v_market IS NULL THEN
    RETURN NULL;
  END IF;

  -- Determine cutoff hours based on market type
  -- Traditional: 18 hours, Private pickup: 10 hours (use stored value or default)
  v_cutoff_hours := COALESCE(
    v_market.cutoff_hours,
    CASE WHEN v_market.market_type = 'private_pickup' THEN 10 ELSE 18 END
  );

  -- Find the earliest upcoming cutoff across all schedules
  FOR v_schedule IN
    SELECT day_of_week, start_time
    FROM market_schedules
    WHERE market_id = p_market_id AND active = true
  LOOP
    v_next_market := get_next_market_datetime(
      v_schedule.day_of_week,
      v_schedule.start_time,
      COALESCE(v_market.timezone, 'America/Chicago')
    );

    v_cutoff := v_next_market - (v_cutoff_hours || ' hours')::INTERVAL;

    -- Keep track of the earliest cutoff
    IF v_earliest_cutoff IS NULL OR v_cutoff < v_earliest_cutoff THEN
      v_earliest_cutoff := v_cutoff;
    END IF;
  END LOOP;

  RETURN v_earliest_cutoff;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_market_cutoff IS 'Returns the next cutoff time for any market type. Traditional: 18hr cutoff, Private pickup: 10hr cutoff.';

-- =====================================================
-- 5. Function to check if a listing is accepting orders
-- Considers all associated markets (via listing_markets)
-- Returns true if ANY market is still accepting orders
-- Both traditional (18hr cutoff) and private_pickup (10hr cutoff) are checked
-- =====================================================
CREATE OR REPLACE FUNCTION is_listing_accepting_orders(
  p_listing_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_listing RECORD;
  v_market_record RECORD;
  v_cutoff TIMESTAMPTZ;
  v_has_open_market BOOLEAN := false;
BEGIN
  -- Check listing exists and is published
  SELECT id, status
  INTO v_listing
  FROM listings
  WHERE id = p_listing_id AND deleted_at IS NULL;

  IF v_listing IS NULL OR v_listing.status != 'published' THEN
    RETURN false;
  END IF;

  -- Check each associated market
  FOR v_market_record IN
    SELECT m.id, m.market_type
    FROM listing_markets lm
    JOIN markets m ON m.id = lm.market_id
    WHERE lm.listing_id = p_listing_id AND m.active = true
  LOOP
    -- Check cutoff for all market types
    v_cutoff := get_market_cutoff(v_market_record.id);

    -- If no cutoff (no schedule) or before cutoff, market is open
    IF v_cutoff IS NULL OR NOW() < v_cutoff THEN
      v_has_open_market := true;
    END IF;
  END LOOP;

  RETURN v_has_open_market;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION is_listing_accepting_orders IS 'Returns true if listing has at least one market still accepting orders. Traditional: 18hr cutoff, Private pickup: 10hr cutoff.';

-- =====================================================
-- 6. Function to get detailed listing availability info
-- Returns JSON with each market's status
-- Both traditional (18hr) and private_pickup (10hr) cutoffs are calculated
-- =====================================================
CREATE OR REPLACE FUNCTION get_listing_market_availability(
  p_listing_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB := '[]'::JSONB;
  v_market_info JSONB;
  v_market_record RECORD;
  v_cutoff TIMESTAMPTZ;
  v_next_market TIMESTAMPTZ;
  v_schedule RECORD;
  v_cutoff_hours INTEGER;
BEGIN
  FOR v_market_record IN
    SELECT
      m.id,
      m.name,
      m.market_type,
      m.timezone,
      m.cutoff_hours
    FROM listing_markets lm
    JOIN markets m ON m.id = lm.market_id
    WHERE lm.listing_id = p_listing_id AND m.active = true
  LOOP
    -- Determine cutoff hours based on market type
    v_cutoff_hours := COALESCE(
      v_market_record.cutoff_hours,
      CASE WHEN v_market_record.market_type = 'private_pickup' THEN 10 ELSE 18 END
    );

    -- Get the next schedule for this market
    SELECT day_of_week, start_time
    INTO v_schedule
    FROM market_schedules
    WHERE market_id = v_market_record.id AND active = true
    ORDER BY
      CASE
        WHEN day_of_week >= EXTRACT(DOW FROM NOW()) THEN day_of_week - EXTRACT(DOW FROM NOW())
        ELSE day_of_week + 7 - EXTRACT(DOW FROM NOW())
      END
    LIMIT 1;

    IF v_schedule IS NOT NULL THEN
      v_next_market := get_next_market_datetime(
        v_schedule.day_of_week,
        v_schedule.start_time,
        COALESCE(v_market_record.timezone, 'America/Chicago')
      );
      v_cutoff := v_next_market - (v_cutoff_hours || ' hours')::INTERVAL;

      v_market_info := jsonb_build_object(
        'market_id', v_market_record.id,
        'market_name', v_market_record.name,
        'market_type', v_market_record.market_type,
        'is_accepting', NOW() < v_cutoff,
        'cutoff_at', v_cutoff,
        'next_market_at', v_next_market,
        'cutoff_hours', v_cutoff_hours,
        'reason', CASE
          WHEN NOW() >= v_cutoff THEN 'Orders closed for ' || to_char(v_next_market AT TIME ZONE COALESCE(v_market_record.timezone, 'America/Chicago'), 'FMDay, Mon DD')
          ELSE NULL
        END
      );
    ELSE
      v_market_info := jsonb_build_object(
        'market_id', v_market_record.id,
        'market_name', v_market_record.name,
        'market_type', v_market_record.market_type,
        'is_accepting', false,
        'cutoff_at', NULL,
        'next_market_at', NULL,
        'cutoff_hours', v_cutoff_hours,
        'reason', 'No active schedule'
      );
    END IF;

    v_result := v_result || v_market_info;
  END LOOP;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_listing_market_availability IS 'Returns detailed availability info for each market. Traditional: 18hr cutoff, Private pickup: 10hr cutoff.';

-- =====================================================
-- 7. Index for efficient market schedule lookups
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_market_schedules_market_active
ON market_schedules(market_id, active)
WHERE active = true;
