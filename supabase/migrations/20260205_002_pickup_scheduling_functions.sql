-- =====================================================
-- Migration: Pickup Scheduling SQL Functions
-- Purpose: Server-side calculation of pickup dates and validation
-- Date: 2026-02-05
--
-- CONTEXT:
-- These functions replace client-side JavaScript calculations with
-- server-side SQL for consistent timezone handling and better performance.
-- All functions use SECURITY DEFINER with explicit search_path for security.
--
-- FUNCTIONS:
-- 1. get_available_pickup_dates() - Returns upcoming dates with cutoff status
-- 2. validate_cart_item_schedule() - Validates cart item selection
-- 3. can_delete_schedule() - Checks if schedule has active orders
-- 4. build_pickup_snapshot() - Creates frozen pickup details for orders
-- 5. get_schedule_active_order_count() - Helper for schedule management
--
-- See: docs/Build_Instructions/Pickup_Scheduling_Comprehensive_Plan.md
-- =====================================================

-- =====================================================
-- 1. Get available pickup dates for a listing
-- Returns dates within next 7 days that are still accepting orders
-- Used by: Listing detail page for server-side rendering
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
  hours_until_cutoff NUMERIC
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
    (EXTRACT(EPOCH FROM (wc.cutoff_at - NOW())) / 3600)::NUMERIC(10,2) as hours_until_cutoff
  FROM with_cutoff wc
  WHERE wc.pickup_datetime_utc > NOW()  -- Don't show past pickups
  ORDER BY wc.pickup_date, wc.start_time, wc.market_name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION get_available_pickup_dates IS 'Returns upcoming pickup dates for a listing within the next 7 days. Used by listing detail page for server-side rendering. Handles timezone conversion and cutoff calculation.';

-- =====================================================
-- 2. Validate cart item schedule selection
-- Returns true if the schedule/date combo is valid and accepting orders
-- Used by: Cart API when adding items
-- =====================================================
CREATE OR REPLACE FUNCTION validate_cart_item_schedule(
  p_listing_id UUID,
  p_schedule_id UUID,
  p_pickup_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Check if this schedule/date combination exists and is accepting
  SELECT COUNT(*) INTO v_count
  FROM get_available_pickup_dates(p_listing_id)
  WHERE schedule_id = p_schedule_id
    AND pickup_date = p_pickup_date
    AND is_accepting = true;

  RETURN v_count > 0;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION validate_cart_item_schedule IS 'Validates that a schedule/date selection is valid for adding to cart. Returns true only if the combination exists and is still accepting orders.';

-- =====================================================
-- 3. Check if schedule can be deleted
-- Returns false if active (unfulfilled) orders exist
-- Used by: Vendor schedule management
-- =====================================================
CREATE OR REPLACE FUNCTION can_delete_schedule(
  p_schedule_id UUID
)
RETURNS TABLE (
  can_delete BOOLEAN,
  blocking_order_count INTEGER,
  blocking_orders JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH active_orders AS (
    -- Find orders that are not yet fulfilled/completed/cancelled
    SELECT
      o.id,
      o.order_number,
      o.order_suffix,
      oi.pickup_date,
      o.status
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.schedule_id = p_schedule_id
      AND o.status NOT IN ('fulfilled', 'completed', 'cancelled', 'refunded', 'expired')
  )
  SELECT
    (COUNT(*) = 0)::BOOLEAN as can_delete,
    COUNT(*)::INTEGER as blocking_order_count,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'order_id', ao.id,
          'order_number', CONCAT(COALESCE(ao.order_number, ''), COALESCE(ao.order_suffix, '')),
          'pickup_date', ao.pickup_date,
          'status', ao.status
        )
      ) FILTER (WHERE ao.id IS NOT NULL),
      '[]'::JSONB
    ) as blocking_orders
  FROM active_orders ao;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION can_delete_schedule IS 'Checks if a schedule can be deleted. Returns false with list of blocking orders if active orders exist. Active = pending, confirmed, not fulfilled.';

-- =====================================================
-- 4. Build pickup snapshot for order
-- Creates frozen pickup details at checkout time
-- Used by: Checkout process
-- =====================================================
CREATE OR REPLACE FUNCTION build_pickup_snapshot(
  p_schedule_id UUID,
  p_pickup_date DATE
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'market_id', m.id,
    'market_name', m.name,
    'market_type', m.market_type,
    'address', m.address,
    'city', m.city,
    'state', m.state,
    'zip', m.zip,
    'start_time', ms.start_time::TEXT,
    'end_time', ms.end_time::TEXT,
    'day_of_week', ms.day_of_week,
    'timezone', COALESCE(m.timezone, 'America/Chicago'),
    'pickup_date', p_pickup_date,
    'captured_at', NOW()
  ) INTO v_result
  FROM market_schedules ms
  JOIN markets m ON m.id = ms.market_id
  WHERE ms.id = p_schedule_id;

  -- Return NULL if schedule not found (shouldn't happen but handle gracefully)
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION build_pickup_snapshot IS 'Creates a frozen snapshot of pickup details for an order. Called at checkout to preserve the exact location, time, and date promised to the buyer.';

-- =====================================================
-- 5. Get count of active orders for a schedule
-- Helper function for UI display
-- Used by: Vendor dashboard, schedule management
-- =====================================================
CREATE OR REPLACE FUNCTION get_schedule_active_order_count(
  p_schedule_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT o.id) INTO v_count
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.schedule_id = p_schedule_id
    AND o.status NOT IN ('fulfilled', 'completed', 'cancelled', 'refunded', 'expired');

  RETURN v_count;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION get_schedule_active_order_count IS 'Returns count of active (unfulfilled) orders for a schedule. Used for UI warnings when managing schedules.';

-- =====================================================
-- 6. Update is_listing_accepting_orders to use new logic
-- This function already exists - we're updating it to be consistent
-- with the new per-schedule approach
-- =====================================================
CREATE OR REPLACE FUNCTION is_listing_accepting_orders(
  p_listing_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_has_accepting BOOLEAN;
BEGIN
  -- Check if listing exists and is published
  IF NOT EXISTS (
    SELECT 1 FROM listings
    WHERE id = p_listing_id
      AND status = 'published'
      AND deleted_at IS NULL
  ) THEN
    RETURN false;
  END IF;

  -- Check if any schedule/date is accepting using the new function
  SELECT EXISTS (
    SELECT 1
    FROM get_available_pickup_dates(p_listing_id)
    WHERE is_accepting = true
  ) INTO v_has_accepting;

  RETURN v_has_accepting;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION is_listing_accepting_orders IS 'Returns true if listing has at least one pickup date still accepting orders. Uses get_available_pickup_dates for consistent logic.';

-- =====================================================
-- 7. Function to clean up cart items with deactivated schedules
-- Can be called by a cron job or trigger
-- Returns IDs of removed items for notification purposes
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_cart_items_invalid_schedules()
RETURNS TABLE (
  cart_item_id UUID,
  user_id UUID,
  listing_title TEXT,
  removed_reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH invalid_items AS (
    SELECT
      ci.id as cart_item_id,
      c.user_id,
      l.title as listing_title,
      CASE
        WHEN ms.id IS NULL THEN 'Schedule was deleted'
        WHEN ms.active = false THEN 'Schedule was deactivated'
        WHEN m.active = false THEN 'Market was deactivated'
        WHEN NOT validate_cart_item_schedule(ci.listing_id, ci.schedule_id, ci.pickup_date)
          THEN 'Pickup date cutoff has passed'
        ELSE NULL
      END as removed_reason
    FROM cart_items ci
    JOIN carts c ON c.id = ci.cart_id
    JOIN listings l ON l.id = ci.listing_id
    LEFT JOIN market_schedules ms ON ms.id = ci.schedule_id
    LEFT JOIN markets m ON m.id = ms.market_id
    WHERE ci.schedule_id IS NOT NULL
      AND ci.pickup_date IS NOT NULL
  ),
  to_remove AS (
    SELECT * FROM invalid_items WHERE removed_reason IS NOT NULL
  ),
  deleted AS (
    DELETE FROM cart_items
    WHERE id IN (SELECT cart_item_id FROM to_remove)
    RETURNING id
  )
  SELECT
    tr.cart_item_id,
    tr.user_id,
    tr.listing_title,
    tr.removed_reason
  FROM to_remove tr;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION cleanup_cart_items_invalid_schedules IS 'Removes cart items with invalid schedules (deleted, deactivated, or past cutoff). Returns removed items for notification purposes. Should be called periodically or on schedule changes.';

-- =====================================================
-- 8. Trigger function to clean cart items when schedule deactivated
-- =====================================================
CREATE OR REPLACE FUNCTION trigger_cleanup_cart_on_schedule_change()
RETURNS TRIGGER AS $$
BEGIN
  -- If schedule is being deactivated or deleted
  IF (TG_OP = 'UPDATE' AND NEW.active = false AND OLD.active = true) OR
     (TG_OP = 'DELETE') THEN

    -- Remove cart items referencing this schedule
    DELETE FROM cart_items WHERE schedule_id = COALESCE(NEW.id, OLD.id);

    -- Note: In production, we'd want to create notifications here
    -- For now, the cleanup function can be called separately to get notification data
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on market_schedules
DROP TRIGGER IF EXISTS trigger_cart_cleanup_on_schedule_change ON market_schedules;
CREATE TRIGGER trigger_cart_cleanup_on_schedule_change
  AFTER UPDATE OR DELETE ON market_schedules
  FOR EACH ROW
  EXECUTE FUNCTION trigger_cleanup_cart_on_schedule_change();

COMMENT ON FUNCTION trigger_cleanup_cart_on_schedule_change IS 'Automatically removes cart items when their schedule is deactivated or deleted.';

-- =====================================================
-- Migration complete
-- =====================================================
