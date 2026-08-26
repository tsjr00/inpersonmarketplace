-- ============================================================================
-- Migration 229: Event Vendor Fees — atomic payment RPCs (V1 Phase 3)
-- Date: 2026-08-14. ADDITIVE — 2 functions, service_role only. Requires 228.
-- Design: decisions.md "Event Vendor Fees" decision 4 (allocation) + 6 (math).
--
-- Model (owner decision 4, formalized):
--   spots      = catering_requests.vendor_count (mig 070, default 2)
--   contender  = accepted + organizer-selected vendor without a paid row
--   PROTECTION = a contender's own 12h window after organizer_selected_at.
--   A contender INSIDE their window may always start payment (their spot is
--   protected). OUTSIDE their window they may start only if spots remain after
--   reserving one for every OTHER contender still inside a window — with more
--   contenders than spots the windows can't cover everyone and it degrades to
--   first-payment-wins, exactly the owner's surplus rule.
--   PENDING rows never consume capacity: many checkouts may race; the WEBHOOK
--   flip is capacity-checked under the same lock and the loser is refunded
--   (same narrowed-race model as mig 216, accepted deliberately).
--   Organizer early-open override: deferred to a later phase (flagged in the
--   design brief) — after 12h the lapse opens the spot automatically anyway.
--
-- Verification (after apply):
--   SELECT to_regprocedure('public.create_event_fee_payment_if_eligible(uuid,uuid,integer,integer,integer,integer)');
--   SELECT to_regprocedure('public.mark_event_fee_paid_if_capacity(uuid,text,text)');
--   -- both non-NULL
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_event_fee_payment_if_eligible(
  p_market_id uuid,
  p_vendor_profile_id uuid,
  p_fee_cents integer,
  p_vendor_pays_cents integer,
  p_organizer_receives_cents integer,
  p_platform_keeps_cents integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_event RECORD;
  v_mv RECORD;
  v_spots integer;
  v_paid integer;
  v_remaining integer;
  v_protected_others integer;
  v_in_own_window boolean;
  v_payment_id uuid;
BEGIN
  -- Serialize per event market (same pattern as book_weekly_booth_atomic).
  PERFORM pg_advisory_xact_lock(hashtext('event_fee_' || p_market_id::text));

  SELECT id, vendor_count, event_vendor_fee_cents, status
    INTO v_event
    FROM catering_requests
   WHERE market_id = p_market_id;

  IF v_event.id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'event_not_found');
  END IF;
  IF v_event.event_vendor_fee_cents IS NULL OR v_event.event_vendor_fee_cents <= 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_fee');
  END IF;
  IF v_event.status NOT IN ('approved', 'ready') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'event_not_open');
  END IF;
  -- Amounts are snapshotted by the caller from the CURRENT fee; refuse a
  -- stale snapshot (fee changed mid-flight) rather than charging the old one.
  IF p_fee_cents IS DISTINCT FROM v_event.event_vendor_fee_cents THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'fee_changed');
  END IF;

  SELECT response_status, organizer_selected_at
    INTO v_mv
    FROM market_vendors
   WHERE market_id = p_market_id AND vendor_profile_id = p_vendor_profile_id;

  IF v_mv.response_status IS DISTINCT FROM 'accepted' OR v_mv.organizer_selected_at IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_selected');
  END IF;

  IF EXISTS (
    SELECT 1 FROM event_vendor_fee_payments
     WHERE market_id = p_market_id AND vendor_profile_id = p_vendor_profile_id
       AND status = 'paid'
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'already_paid');
  END IF;

  v_spots := GREATEST(COALESCE(v_event.vendor_count, 2), 1);
  SELECT count(*) INTO v_paid
    FROM event_vendor_fee_payments
   WHERE market_id = p_market_id AND status = 'paid';
  v_remaining := v_spots - v_paid;

  IF v_remaining <= 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'event_full');
  END IF;

  v_in_own_window := v_mv.organizer_selected_at > NOW() - INTERVAL '12 hours';

  IF NOT v_in_own_window THEN
    -- Reserve a spot for every OTHER contender still inside their window.
    SELECT count(*) INTO v_protected_others
      FROM market_vendors mv
     WHERE mv.market_id = p_market_id
       AND mv.vendor_profile_id <> p_vendor_profile_id
       AND mv.response_status = 'accepted'
       AND mv.organizer_selected_at IS NOT NULL
       AND mv.organizer_selected_at > NOW() - INTERVAL '12 hours'
       AND NOT EXISTS (
         SELECT 1 FROM event_vendor_fee_payments p
          WHERE p.market_id = mv.market_id
            AND p.vendor_profile_id = mv.vendor_profile_id
            AND p.status = 'paid'
       );
    IF v_protected_others >= v_remaining THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'spots_protected');
    END IF;
  END IF;

  -- Refresh a prior attempt instead of tripping the one-live-row index:
  -- a released/refunded row never blocks; a stale pending row is reused.
  UPDATE event_vendor_fee_payments
     SET status = 'released', updated_at = NOW()
   WHERE market_id = p_market_id AND vendor_profile_id = p_vendor_profile_id
     AND status = 'pending_payment';

  INSERT INTO event_vendor_fee_payments (
    catering_request_id, market_id, vendor_profile_id,
    fee_cents, vendor_pays_cents, organizer_receives_cents, platform_keeps_cents
  ) VALUES (
    v_event.id, p_market_id, p_vendor_profile_id,
    p_fee_cents, p_vendor_pays_cents, p_organizer_receives_cents, p_platform_keeps_cents
  ) RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object('allowed', true, 'payment_id', v_payment_id,
                            'remaining_before', v_remaining);
END;
$$;

-- Webhook-side flip: first PAYMENT wins, decided here under the same lock.
-- Returns paid=true, or paid=false + needs_refund=true for the rare loser
-- (event filled between session-create and payment completion).
CREATE OR REPLACE FUNCTION public.mark_event_fee_paid_if_capacity(
  p_payment_id uuid,
  p_session_id text,
  p_payment_intent_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_spots integer;
  v_paid integer;
BEGIN
  SELECT p.id, p.market_id, p.status, cr.vendor_count
    INTO v_row
    FROM event_vendor_fee_payments p
    JOIN catering_requests cr ON cr.id = p.catering_request_id
   WHERE p.id = p_payment_id;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('paid', false, 'reason', 'not_found');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('event_fee_' || v_row.market_id::text));

  -- Idempotent: webhook retries land here.
  IF v_row.status = 'paid' THEN
    RETURN jsonb_build_object('paid', true, 'reason', 'already_paid');
  END IF;
  IF v_row.status IN ('refunded') THEN
    RETURN jsonb_build_object('paid', false, 'reason', 'already_refunded');
  END IF;

  v_spots := GREATEST(COALESCE(v_row.vendor_count, 2), 1);
  SELECT count(*) INTO v_paid
    FROM event_vendor_fee_payments
   WHERE market_id = v_row.market_id AND status = 'paid';

  IF v_paid >= v_spots THEN
    UPDATE event_vendor_fee_payments
       SET status = 'released',
           stripe_checkout_session_id = p_session_id,
           stripe_payment_intent_id = p_payment_intent_id,
           updated_at = NOW()
     WHERE id = p_payment_id;
    RETURN jsonb_build_object('paid', false, 'reason', 'event_full', 'needs_refund', true);
  END IF;

  UPDATE event_vendor_fee_payments
     SET status = 'paid',
         paid_at = NOW(),
         stripe_checkout_session_id = p_session_id,
         stripe_payment_intent_id = p_payment_intent_id,
         updated_at = NOW()
   WHERE id = p_payment_id;

  RETURN jsonb_build_object('paid', true);
END;
$$;

-- Service-role only (mig 149/152 posture for financial RPCs).
REVOKE EXECUTE ON FUNCTION public.create_event_fee_payment_if_eligible(uuid, uuid, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_event_fee_paid_if_capacity(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_event_fee_payment_if_eligible(uuid, uuid, integer, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_event_fee_paid_if_capacity(uuid, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.create_event_fee_payment_if_eligible(uuid, uuid, integer, integer, integer, integer);
--   DROP FUNCTION IF EXISTS public.mark_event_fee_paid_if_capacity(uuid, text, text);
--   NOTIFY pgrst, 'reload schema';
-- ============================================================================
