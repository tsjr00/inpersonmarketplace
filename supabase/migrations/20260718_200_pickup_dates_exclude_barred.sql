-- ============================================================================
-- Migration 200: get_available_pickup_dates — BARRED bookings stop selling
--                (G1, bar↔T5 interaction — follow-up to mig 199)
-- ============================================================================
-- Mig 179's bar flow (operator kicks a non-compliant truck off a specific
-- PAID booking) deliberately keeps the row status='paid' — slot held, no
-- refund, no resale. Mig 199's paid-park intersection counts any 'paid' row,
-- so a JUST-BARRED truck's date kept selling food orders. This replace =
-- mig 199 body VERBATIM + ONE line in the T5 EXISTS:
-- `AND b.manager_barred_at IS NULL`.
--
-- Scope note: park_vendor_vetting.blocked (mig 179's general block) is NOT
-- checked here — block gates NEW bookings; killing an already-paid date is
-- exactly what the per-booking bar is for. Companion (same batch, G2): the
-- bar route now also cancels + refunds the truck's existing buyer orders for
-- that date. USER DECISIONS 2026-07-18 (G1/G2 approved).
--
-- ROLLBACK: re-apply migration 199's body (this file minus the one line).
--
-- (Mig 199's original context header follows — it documents the body.)
-- ============================================================================
-- THE GAP: T4's booking↔selling bridge auto-creates a truck's recurring
-- vendor_market_schedules on the PAID flip of a park booking — and recurring
-- schedules persist past the booked dates. This function required only an
-- ACTIVE vms row for FT non-event markets, so a paid-park truck's listing
-- offered pickup dates the truck never booked: buyers could order food for a
-- date the truck has no spot rental (and won't be at the park).
--
-- Body is migration 162 VERBATIM + (a) two columns carried in the
-- listing_schedules CTE (l.vendor_profile_id, m.park_mode) and (b) ONE
-- predicate in matched_dates, next to mig 162's cancelled-dates filter:
-- a candidate date at a park_mode='paid' FT non-event market must have a
-- PAID park_spot_bookings row for (this vendor, this market, this date).
--
-- USER DECISIONS 2026-07-18 (decisions.md):
--   D1: status = 'paid' ONLY. pending_payment does NOT count — the only long
--       created→paid gap is standing-reservation occurrences (auto-generated
--       unpaid, 2-day payment cutoff, auto-expire per mig 174); counting them
--       would let buyers order against a booking that then evaporates.
--       Companion copy (same commit) tells trucks: buyers can't order a date
--       until it's paid — pay recurring occurrences early.
--   D2: multiple_trucks NEVER exempts the booking requirement — that flag
--       only bypasses the schedule-CONFLICT check (VJ-R14). Every paid park
--       a vendor sells at requires its own spot rental, per date.
--
-- SCOPE GUARANTEES (predicate short-circuit order):
--   - FM listings: first OR arm — the EXISTS is never evaluated, plan
--     unchanged.
--   - FT events: unchanged (organizer-driven).
--   - FT FREE parks (park_mode='free', the mig-171 default): unchanged.
--   - Only FT paid-park listings probe: ≤8 candidate dates × one indexed
--     lookup on uq_park_spot_vendor_active(vendor_profile_id, market_id,
--     booking_date) WHERE status IN ('pending_payment','paid') — status='paid'
--     implies the partial predicate, so the probe is index-served. NO new
--     index needed.
--
-- PROPAGATION (free, by design): is_listing_accepting_orders,
-- get_listings_accepting_status, validate_cart_item_schedule, and
-- cleanup_cart_items_invalid_schedules all wrap this function; listing
-- detail + browse read it directly. Unbooked dates vanish from display AND
-- are rejected at cart-validate + checkout. Stale auto-created vms rows
-- become harmless (no cleanup required).
--
-- Return shape unchanged from migs 131/162 → plain CREATE OR REPLACE, NO
-- DROP (a DROP would break the four wrappers). Grants: intentionally
-- anon-executable (public buyer browse; mig 149 "LEFT exposed" allowlist) —
-- CREATE OR REPLACE keeps existing grants, NO re-revoke needed.
--
-- ROLLBACK: re-apply migration 162's body
-- (supabase/migrations/applied/20260621_162_pickup_dates_exclude_cancelled.sql)
-- — this file minus the T5 blocks. SQL-only fix: pre-migration state IS the
-- current (gap) behavior; no app code depends on the new predicate.
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
      -- PHASE C (mig 162): exclude dates the manager has cancelled for this market.
      AND NOT EXISTS (
        SELECT 1 FROM market_date_overrides o
        WHERE o.market_id = ls.market_id
          AND o.override_date = ds.potential_date
          AND o.status = 'cancelled'
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
  'FT events: REQUIRE active vendor_market_schedules row. '
  'FM events: no vms requirement (organizer-driven). '
  'Private pickup: no vms requirement. '
  'FT non-event: today + advance_order_days window, 0 cutoff. '
  'Events: actual event date range as candidates. Past events auto-filtered. '
  'Day-of ordering: when event_allow_day_of_orders=true AND local_today >= event_start_date, cutoff=0 (accepting until event ends). '
  'Vendor custom times used when available. Enforces season dates. '
  'Phase C (mig 162): excludes dates with a market_date_overrides cancelled row. '
  'T5 (mig 199): park_mode=paid FT markets additionally require a PAID park_spot_bookings row for (vendor, market, date) — booking = selling = paid; multiple_trucks grants no exemption. '
  'G1 (mig 200): barred bookings (manager_barred_at set) do not sell — the bar keeps the row paid to hold the slot, but the truck was removed from that date.';

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION (run after applying; read-only)
-- ============================================================================
-- 1) Bar a test PAID booking (POST /park-bookings/[id]/bar), then:
--      SELECT pickup_date FROM get_available_pickup_dates('<that_truck_listing_id>');
--    → the barred booking_date must NOT return; the truck's other paid dates
--    still do.
-- 2) FM listing + free-park listing: output identical to mig 199 (the
--    predicate short-circuits before the EXISTS for both).
-- ============================================================================
