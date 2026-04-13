-- Migration 119: Company-paid order financial controls
--
-- T1-3: Proper fee structure in create_company_paid_order RPC.
--       Vendors pay 6.5% + $0.15. Company (as buyer) pays 6.5% + $0.15.
--       Previously both were 0 — platform earned nothing on company-paid orders.
--
-- T1-1: Per-attendee spending cap enforcement. The RPC now checks
--       company_max_per_attendee_cents before creating the order.
--       Attendees who have already spent up to the cap are blocked.
--
-- T1-5: Payment-to-order linkage column on orders table.
--       Nullable FK to event_company_payments for future reconciliation.

-- ── T1-5: Add payment linkage column ─────────────────────────────────

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS event_company_payment_id UUID
  REFERENCES event_company_payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_company_payment
  ON orders(event_company_payment_id)
  WHERE event_company_payment_id IS NOT NULL;

-- ── T1-3 + T1-1: Rewrite create_company_paid_order with fees + cap ──

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
  v_buyer_fee_cents INTEGER;
  v_vendor_fee_cents INTEGER;
  v_vendor_payout_cents INTEGER;
  v_total_cents INTEGER;
  v_cap_cents INTEGER;
  v_existing_spend INTEGER;
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

  -- Get market and event details (including per-attendee cap)
  SELECT m.id, m.catering_request_id, m.vertical_id
    INTO v_market
    FROM markets m
   WHERE m.id = p_market_id AND m.market_type = 'event';

  IF v_market IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Event not found'::TEXT;
    RETURN;
  END IF;

  SELECT COALESCE(cr.company_name, 'Event'),
         cr.company_max_per_attendee_cents
    INTO v_event_name, v_cap_cents
    FROM catering_requests cr
   WHERE cr.id = v_market.catering_request_id;

  -- T1-1: Per-attendee spending cap enforcement
  IF v_cap_cents IS NOT NULL AND v_cap_cents > 0 THEN
    SELECT COALESCE(SUM(oi.subtotal_cents), 0)
      INTO v_existing_spend
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
     WHERE o.user_id = p_user_id
       AND o.market_id = p_market_id
       AND o.payment_model = 'company_paid'
       AND o.status != 'cancelled';

    IF v_existing_spend + v_listing.base_price_cents > v_cap_cents THEN
      RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT,
        ('Exceeds per-attendee allowance. You have $' ||
         TRIM(TO_CHAR((v_cap_cents - v_existing_spend) / 100.0, '999990.99')) ||
         ' remaining.')::TEXT;
      RETURN;
    END IF;
  END IF;

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

  -- T1-3: Calculate fees (same structure as regular orders)
  -- Buyer fee (company pays): 6.5% + $0.15
  v_buyer_fee_cents := ROUND(v_listing.base_price_cents * 0.065) + 15;
  -- Vendor fee: 6.5% + $0.15
  v_vendor_fee_cents := ROUND(v_listing.base_price_cents * 0.065) + 15;
  v_vendor_payout_cents := v_listing.base_price_cents - v_vendor_fee_cents;
  -- Total the company owes for this order
  v_total_cents := v_listing.base_price_cents + v_buyer_fee_cents;

  -- Create order
  INSERT INTO orders (
    user_id, vertical_id, market_id,
    status, payment_model, event_wave_reservation_id,
    order_number,
    subtotal_cents, buyer_fee_cents, service_fee_cents, total_cents,
    vendor_payout_cents, platform_fee_cents,
    created_at
  ) VALUES (
    p_user_id, v_market.vertical_id, p_market_id,
    'confirmed', 'company_paid', p_reservation_id,
    v_order_number,
    v_listing.base_price_cents, v_buyer_fee_cents, 15, v_total_cents,
    v_vendor_payout_cents, v_buyer_fee_cents + v_vendor_fee_cents,
    now()
  )
  RETURNING id INTO v_order_id;

  -- Create order item
  INSERT INTO order_items (
    order_id, listing_id, vendor_profile_id, market_id,
    quantity, unit_price_cents, subtotal_cents,
    platform_fee_cents, vendor_payout_cents,
    status, wave_id,
    created_at
  ) VALUES (
    v_order_id, p_listing_id, p_vendor_profile_id, p_market_id,
    1, v_listing.base_price_cents, v_listing.base_price_cents,
    v_vendor_fee_cents, v_vendor_payout_cents,
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

COMMENT ON FUNCTION public.create_company_paid_order IS 'Creates a confirmed order for company-paid events. Calculates standard platform fees (6.5% + $0.15 each side). Enforces per-attendee spending cap from company_max_per_attendee_cents. Bypasses Stripe — organizer already paid.';
