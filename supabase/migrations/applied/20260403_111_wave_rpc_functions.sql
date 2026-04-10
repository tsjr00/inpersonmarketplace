-- Migration 111: Wave-Based Ordering RPC Functions
-- Atomic functions for race-safe wave reservation and company-paid order creation.
-- All use SELECT ... FOR UPDATE row locks to prevent double-booking.

BEGIN;

-- ============================================================
-- 1. reserve_event_wave
-- Atomically reserves a wave slot for an attendee.
-- Returns success/reservation_id/error.
-- ============================================================
CREATE OR REPLACE FUNCTION public.reserve_event_wave(
  p_wave_id UUID,
  p_market_id UUID,
  p_user_id UUID
)
RETURNS TABLE(success BOOLEAN, reservation_id UUID, error TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_wave RECORD;
  v_existing UUID;
  v_reservation_id UUID;
BEGIN
  -- Lock the wave row to prevent concurrent overbooking
  SELECT id, reserved_count, capacity, status
    INTO v_wave
    FROM event_waves
   WHERE id = p_wave_id AND market_id = p_market_id
     FOR UPDATE;

  IF v_wave IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, 'Wave not found'::TEXT;
    RETURN;
  END IF;

  IF v_wave.status != 'open' THEN
    RETURN QUERY SELECT false, NULL::UUID, 'This time slot is no longer available'::TEXT;
    RETURN;
  END IF;

  IF v_wave.reserved_count >= v_wave.capacity THEN
    RETURN QUERY SELECT false, NULL::UUID, 'This time slot is full'::TEXT;
    RETURN;
  END IF;

  -- Check if user already has a reservation at this event
  SELECT id INTO v_existing
    FROM event_wave_reservations
   WHERE market_id = p_market_id AND user_id = p_user_id AND status != 'cancelled';

  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, 'You already have a time slot reserved for this event'::TEXT;
    RETURN;
  END IF;

  -- Create reservation
  INSERT INTO event_wave_reservations (wave_id, market_id, user_id, status)
  VALUES (p_wave_id, p_market_id, p_user_id, 'reserved')
  RETURNING id INTO v_reservation_id;

  -- Increment counter
  UPDATE event_waves
     SET reserved_count = reserved_count + 1,
         status = CASE WHEN reserved_count + 1 >= capacity THEN 'full' ELSE 'open' END
   WHERE id = p_wave_id;

  RETURN QUERY SELECT true, v_reservation_id, NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION public.reserve_event_wave IS 'Atomically reserves a wave slot. Uses row lock to prevent double-booking. One reservation per attendee per event.';

-- ============================================================
-- 2. cancel_wave_reservation
-- Frees a wave slot when attendee cancels.
-- Only allowed if reservation status is 'reserved' (not yet ordered).
-- ============================================================
CREATE OR REPLACE FUNCTION public.cancel_wave_reservation(
  p_reservation_id UUID,
  p_user_id UUID
)
RETURNS TABLE(success BOOLEAN, error TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_reservation RECORD;
BEGIN
  -- Get reservation and verify ownership
  SELECT r.id, r.wave_id, r.status
    INTO v_reservation
    FROM event_wave_reservations r
   WHERE r.id = p_reservation_id AND r.user_id = p_user_id;

  IF v_reservation IS NULL THEN
    RETURN QUERY SELECT false, 'Reservation not found'::TEXT;
    RETURN;
  END IF;

  IF v_reservation.status != 'reserved' THEN
    RETURN QUERY SELECT false, 'Cannot cancel — order already placed'::TEXT;
    RETURN;
  END IF;

  -- Lock the wave row
  PERFORM id FROM event_waves WHERE id = v_reservation.wave_id FOR UPDATE;

  -- Cancel reservation
  UPDATE event_wave_reservations
     SET status = 'cancelled'
   WHERE id = p_reservation_id;

  -- Decrement counter and reopen if was full
  UPDATE event_waves
     SET reserved_count = GREATEST(0, reserved_count - 1),
         status = CASE WHEN status = 'full' THEN 'open' ELSE status END
   WHERE id = v_reservation.wave_id;

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION public.cancel_wave_reservation IS 'Frees a wave slot. Only works if reservation is still in reserved status (not yet ordered).';

-- ============================================================
-- 3. create_company_paid_order
-- Creates an order for company-paid events, bypassing Stripe.
-- Order is immediately confirmed since organizer already paid.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_company_paid_order(
  p_user_id UUID,
  p_market_id UUID,
  p_reservation_id UUID,
  p_listing_id UUID,
  p_vendor_profile_id UUID,
  p_wave_id UUID
)
RETURNS TABLE(success BOOLEAN, order_id UUID, order_number TEXT, error TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_reservation RECORD;
  v_listing RECORD;
  v_market RECORD;
  v_wave RECORD;
  v_order_id UUID;
  v_order_number TEXT;
  v_sequence INTEGER;
  v_event_name TEXT;
BEGIN
  -- Verify reservation belongs to user and is in 'reserved' status
  SELECT r.id, r.wave_id, r.status
    INTO v_reservation
    FROM event_wave_reservations r
   WHERE r.id = p_reservation_id
     AND r.user_id = p_user_id
     AND r.market_id = p_market_id;

  IF v_reservation IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Reservation not found'::TEXT;
    RETURN;
  END IF;

  IF v_reservation.status != 'reserved' THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Order already placed for this reservation'::TEXT;
    RETURN;
  END IF;

  -- Verify listing exists and belongs to the vendor at this event
  SELECT l.id, l.base_price_cents, l.title, l.vertical_id
    INTO v_listing
    FROM listings l
    JOIN event_vendor_listings evl ON evl.listing_id = l.id
   WHERE l.id = p_listing_id
     AND evl.vendor_profile_id = p_vendor_profile_id
     AND evl.market_id = p_market_id;

  IF v_listing IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Item not available at this event'::TEXT;
    RETURN;
  END IF;

  -- Get market and event name
  SELECT m.id, m.catering_request_id, m.vertical_id
    INTO v_market
    FROM markets m
   WHERE m.id = p_market_id AND m.market_type = 'event';

  IF v_market IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Event not found'::TEXT;
    RETURN;
  END IF;

  SELECT COALESCE(cr.company_name, 'Event') INTO v_event_name
    FROM catering_requests cr
   WHERE cr.id = v_market.catering_request_id;

  -- Get wave info
  SELECT ew.wave_number INTO v_wave
    FROM event_waves ew
   WHERE ew.id = p_wave_id AND ew.market_id = p_market_id;

  -- Calculate sequence number (next in this wave)
  SELECT COUNT(*) + 1 INTO v_sequence
    FROM event_wave_reservations
   WHERE wave_id = p_wave_id AND status = 'ordered';

  -- Generate order number: {EventSlug}-{Wave}-{Sequence}
  v_order_number := UPPER(LEFT(REGEXP_REPLACE(v_event_name, '[^a-zA-Z0-9]', '', 'g'), 8))
    || '-' || v_wave.wave_number
    || '-' || v_sequence;

  -- Create order
  INSERT INTO orders (
    user_id, vertical_id, market_id,
    status, payment_model, event_wave_reservation_id,
    order_number,
    subtotal_cents, buyer_fee_cents, service_fee_cents, total_cents,
    vendor_payout_cents,
    created_at
  ) VALUES (
    p_user_id, v_market.vertical_id, p_market_id,
    'confirmed', 'company_paid', p_reservation_id,
    v_order_number,
    v_listing.base_price_cents, 0, 0, v_listing.base_price_cents,
    v_listing.base_price_cents,
    now()
  )
  RETURNING id INTO v_order_id;

  -- Create order item
  INSERT INTO order_items (
    order_id, listing_id, vendor_profile_id, market_id,
    quantity, unit_price_cents, subtotal_cents,
    status, wave_id,
    created_at
  ) VALUES (
    v_order_id, p_listing_id, p_vendor_profile_id, p_market_id,
    1, v_listing.base_price_cents, v_listing.base_price_cents,
    'confirmed', p_wave_id,
    now()
  );

  -- Update reservation → ordered
  UPDATE event_wave_reservations
     SET status = 'ordered', order_id = v_order_id
   WHERE id = p_reservation_id;

  RETURN QUERY SELECT true, v_order_id, v_order_number, NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION public.create_company_paid_order IS 'Creates a confirmed order for company-paid events. Bypasses Stripe — organizer already paid. Generates pick-ticket number.';

-- ============================================================
-- 4. find_next_available_wave
-- For walk-ups: returns the first wave with open capacity.
-- ============================================================
CREATE OR REPLACE FUNCTION public.find_next_available_wave(
  p_market_id UUID
)
RETURNS TABLE(wave_id UUID, wave_number INTEGER, start_time TIME, end_time TIME, remaining INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT ew.id, ew.wave_number, ew.start_time, ew.end_time,
         (ew.capacity - ew.reserved_count) AS remaining
    FROM event_waves ew
   WHERE ew.market_id = p_market_id
     AND ew.status = 'open'
   ORDER BY ew.wave_number
   LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.find_next_available_wave IS 'For walk-ups: returns first wave with available capacity, ordered by wave number.';

-- ============================================================
-- 5. get_event_waves_with_availability
-- Returns all waves for an event with remaining capacity.
-- Used by the shop page to display wave selection.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_event_waves_with_availability(
  p_market_id UUID
)
RETURNS TABLE(
  wave_id UUID,
  wave_number INTEGER,
  start_time TIME,
  end_time TIME,
  capacity INTEGER,
  reserved_count INTEGER,
  remaining INTEGER,
  status TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT ew.id, ew.wave_number, ew.start_time, ew.end_time,
         ew.capacity, ew.reserved_count,
         (ew.capacity - ew.reserved_count) AS remaining,
         ew.status
    FROM event_waves ew
   WHERE ew.market_id = p_market_id
   ORDER BY ew.wave_number;
END;
$$;

COMMENT ON FUNCTION public.get_event_waves_with_availability IS 'Returns all waves for an event with current availability. Used by shop page.';

-- Grant execute to authenticated users (RPCs called from API routes via service client)
GRANT EXECUTE ON FUNCTION public.reserve_event_wave TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_wave_reservation TO service_role;
GRANT EXECUTE ON FUNCTION public.create_company_paid_order TO service_role;
GRANT EXECUTE ON FUNCTION public.find_next_available_wave TO service_role;
GRANT EXECUTE ON FUNCTION public.get_event_waves_with_availability TO service_role;
GRANT EXECUTE ON FUNCTION public.get_event_waves_with_availability TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
