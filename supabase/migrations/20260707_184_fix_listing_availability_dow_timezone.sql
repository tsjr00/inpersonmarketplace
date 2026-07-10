-- ============================================================================
-- Migration 184: get_listing_market_availability — market-local weekday
-- ============================================================================
-- Timezone drift fix (Group 1, site #10). The "next schedule" ranking used
-- EXTRACT(DOW FROM NOW()) — the weekday in the DB's UTC session timezone. In
-- the evening drift window (after UTC midnight, before market midnight) that
-- runs a day ahead of market-local, so the wrong schedule can be ranked as
-- "next", surfacing a wrong next-market date in the closed-order message and
-- the buyer availability display.
--
-- Display-only: the checkout money gate is is_listing_accepting_orders
-- (mig 054, market-local). This function only enriches messaging / availability
-- UI, so no money decision changes.
--
-- Body is VERBATIM from mig 20260203_001 except: the two EXTRACT(DOW FROM NOW())
-- reads are replaced by a single market-local weekday resolved into v_today_dow
-- (same NOW() AT TIME ZONE COALESCE(m.timezone,'America/Chicago') pattern the
-- intact functions use). CREATE OR REPLACE preserves existing grants; signature
-- unchanged; no SECURITY DEFINER in the current definition (preserved).
-- ============================================================================
-- Dependencies: get_next_market_datetime(), markets, market_schedules,
--   listing_markets (all pre-existing).
-- ROLLBACK: re-apply the get_listing_market_availability body from
--   supabase/migrations/20260203_001_security_fixes.sql (restores UTC DOW).
-- ============================================================================

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
  v_today_dow INTEGER;
BEGIN
  FOR v_market_record IN
    SELECT m.id, m.name, m.market_type, m.timezone, m.cutoff_hours
    FROM listing_markets lm
    JOIN markets m ON m.id = lm.market_id
    WHERE lm.listing_id = p_listing_id AND m.active = true
  LOOP
    -- Determine cutoff hours based on market type
    v_cutoff_hours := COALESCE(
      v_market_record.cutoff_hours,
      CASE WHEN v_market_record.market_type = 'private_pickup' THEN 10 ELSE 18 END
    );

    -- Weekday resolved in the market's own timezone (was EXTRACT(DOW FROM NOW()),
    -- i.e. UTC — the drift this migration fixes).
    v_today_dow := EXTRACT(DOW FROM (NOW() AT TIME ZONE COALESCE(v_market_record.timezone, 'America/Chicago')))::INTEGER;

    -- Get the next schedule for this market
    SELECT day_of_week, start_time
    INTO v_schedule
    FROM market_schedules
    WHERE market_id = v_market_record.id AND active = true
    ORDER BY
      CASE
        WHEN day_of_week >= v_today_dow THEN day_of_week - v_today_dow
        ELSE day_of_week + 7 - v_today_dow
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
$$ LANGUAGE plpgsql STABLE
SET search_path = public;

NOTIFY pgrst, 'reload schema';
