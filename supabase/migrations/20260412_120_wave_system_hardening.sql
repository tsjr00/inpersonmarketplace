-- Migration 120: Wave system hardening
--
-- T2-1: Reservation timeout — expires_at column + default 10 minutes
-- T2-5: free_wave_on_order_cancel RPC — frees slot when order cancelled
-- T2-6: recalculate_wave_capacity RPC — recalcs from current vendor caps

-- ── T2-1: Reservation timeout ─────────────────────────────────────────

ALTER TABLE event_wave_reservations
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Backfill existing 'reserved' rows with 10-minute expiry from now
-- (any truly stale reservations will be cleaned up by the cron)
UPDATE event_wave_reservations
   SET expires_at = reserved_at + INTERVAL '10 minutes'
 WHERE status = 'reserved' AND expires_at IS NULL;

-- Update reserve_event_wave to set expires_at on new reservations
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
  v_existing RECORD;
  v_reservation_id UUID;
BEGIN
  SELECT id, wave_number, capacity, reserved_count, status
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

  SELECT id, status INTO v_existing
    FROM event_wave_reservations
   WHERE market_id = p_market_id AND user_id = p_user_id AND status NOT IN ('cancelled');

  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, 'You already have a time slot reserved for this event'::TEXT;
    RETURN;
  END IF;

  INSERT INTO event_wave_reservations (wave_id, market_id, user_id, status, reserved_at, expires_at)
  VALUES (p_wave_id, p_market_id, p_user_id, 'reserved', now(), now() + INTERVAL '10 minutes')
  RETURNING id INTO v_reservation_id;

  UPDATE event_waves
     SET reserved_count = reserved_count + 1,
         status = CASE WHEN reserved_count + 1 >= capacity THEN 'full' ELSE status END
   WHERE id = p_wave_id;

  RETURN QUERY SELECT true, v_reservation_id, NULL::TEXT;
END;
$$;

-- ── T2-5: Free wave slot on order cancellation ────────────────────────

CREATE OR REPLACE FUNCTION public.free_wave_on_order_cancel(
  p_order_id UUID
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_reservation RECORD;
BEGIN
  SELECT r.id, r.wave_id, r.status
    INTO v_reservation
    FROM event_wave_reservations r
   WHERE r.order_id = p_order_id
     AND r.status = 'ordered';

  IF v_reservation IS NULL THEN
    RETURN;
  END IF;

  PERFORM id FROM event_waves WHERE id = v_reservation.wave_id FOR UPDATE;

  UPDATE event_wave_reservations
     SET status = 'cancelled'
   WHERE id = v_reservation.id;

  UPDATE event_waves
     SET reserved_count = GREATEST(0, reserved_count - 1),
         status = CASE WHEN status = 'full' THEN 'open' ELSE status END
   WHERE id = v_reservation.wave_id;
END;
$$;

COMMENT ON FUNCTION public.free_wave_on_order_cancel IS 'Frees a wave slot when the linked order is cancelled. Called from order rejection/cancellation handlers.';

-- ── T2-6: Recalculate wave capacity from vendor caps ──────────────────

CREATE OR REPLACE FUNCTION public.recalculate_wave_capacity(
  p_market_id UUID
)
RETURNS TABLE(waves_updated INTEGER, new_capacity INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total_capacity INTEGER;
  v_count INTEGER;
BEGIN
  SELECT COALESCE(SUM(COALESCE(mv.event_max_orders_per_wave, 25)), 0)
    INTO v_total_capacity
    FROM market_vendors mv
   WHERE mv.market_id = p_market_id
     AND mv.response_status = 'accepted';

  IF v_total_capacity < 1 THEN
    v_total_capacity := 25;
  END IF;

  UPDATE event_waves
     SET capacity = v_total_capacity
   WHERE market_id = p_market_id
     AND capacity != v_total_capacity;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count, v_total_capacity;
END;
$$;

COMMENT ON FUNCTION public.recalculate_wave_capacity IS 'Recalculates wave capacity for all waves at a market from current vendor event_max_orders_per_wave sums. Admin action after vendor cap changes.';
