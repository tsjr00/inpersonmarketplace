-- Migration 167: Season payment-confirmation safety RPCs (Phase E)
-- ---------------------------------------------------------------------------
-- Adds two atomic SECURITY DEFINER functions so a season booth group and its
-- child weekly_booth_rentals can never diverge in payment status:
--   * confirm_season_paid   — flip group + pending children to 'paid' in one
--                             locked transaction (idempotent; webhook + cron).
--   * cancel_season_group   — cancel group + pending children in one locked
--                             transaction; REFUSES to cancel a 'paid' group.
--
-- Why: the webhook previously flipped group then children in two statements;
-- a child-flip failure left them divergent with no working retry, and the
-- expire-orders Phase 16 sweep could cancel paid/in-flight season children
-- (children never carry stripe_checkout_session_id — it lives on the group).
-- See apps/web/.claude/phase_e_season_payment_safety_plan.md (F1/F2/F3).
--
-- Additive: no schema/table/column changes. Functions only.
-- Apply Dev + Staging now; Prod with the Phase E push, AFTER 164→165→166.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS confirm_season_paid(uuid, text);
--   DROP FUNCTION IF EXISTS cancel_season_group(uuid, text);
-- ---------------------------------------------------------------------------

-- Atomically confirm payment for a season group: flip the group and every
-- still-pending child rental to 'paid' in one transaction. The FOR UPDATE lock
-- serializes concurrent deliveries (webhook + reconciliation cron).
-- Returns: 'confirmed' (flipped now) | 'already_paid' (idempotent no-op)
--          | 'cancelled_conflict' (paid in Stripe but cancelled in DB — caller
--            logs for manual handling; we never silently re-activate).
CREATE OR REPLACE FUNCTION confirm_season_paid(p_group_id uuid, p_payment_intent text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM booth_booking_groups
  WHERE id = p_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GROUP_NOT_FOUND group_id=%', p_group_id;
  END IF;
  IF v_status = 'paid' THEN
    RETURN 'already_paid';
  END IF;
  IF v_status = 'cancelled' THEN
    RETURN 'cancelled_conflict';
  END IF;

  -- v_status = 'pending_payment'
  UPDATE booth_booking_groups
    SET status = 'paid', stripe_payment_intent_id = p_payment_intent
    WHERE id = p_group_id;

  UPDATE weekly_booth_rentals
    SET status = 'paid', stripe_payment_intent_id = p_payment_intent, paid_at = NOW()
    WHERE group_id = p_group_id AND status = 'pending_payment';

  RETURN 'confirmed';
END;
$$;

COMMENT ON FUNCTION confirm_season_paid(uuid, text) IS
  'Phase E: atomically flip a booth_booking_groups row + its pending child weekly_booth_rentals to paid (FOR UPDATE serialized, idempotent). Returns confirmed | already_paid | cancelled_conflict. Callers: webhooks.ts handleSeasonBoothCheckoutComplete, expire-orders Phase 18 reconciliation. Mig 167.';

-- Atomically cancel a season group + its still-pending child rentals. Never
-- cancels a 'paid' group (DB-level backstop against the F1 class of bug).
-- Returns: 'cancelled' | 'already_paid' (no change) | 'already_cancelled'.
CREATE OR REPLACE FUNCTION cancel_season_group(p_group_id uuid, p_reason text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM booth_booking_groups
  WHERE id = p_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GROUP_NOT_FOUND group_id=%', p_group_id;
  END IF;
  IF v_status = 'paid' THEN
    RETURN 'already_paid';
  END IF;
  IF v_status = 'cancelled' THEN
    RETURN 'already_cancelled';
  END IF;

  UPDATE booth_booking_groups SET status = 'cancelled' WHERE id = p_group_id;

  UPDATE weekly_booth_rentals
    SET status = 'cancelled', cancelled_at = NOW()
    WHERE group_id = p_group_id AND status = 'pending_payment';

  RETURN 'cancelled';
END;
$$;

COMMENT ON FUNCTION cancel_season_group(uuid, text) IS
  'Phase E: atomically cancel a pending booth_booking_groups row + its pending child weekly_booth_rentals (FOR UPDATE serialized). Refuses to cancel a paid group. Returns cancelled | already_paid | already_cancelled. Caller: expire-orders Phase 18 reconciliation. Mig 167.';

-- Lock down: SECURITY DEFINER + default PUBLIC grant would expose these to anon.
-- Mirror book_season_atomic (mig 165): REVOKE FROM PUBLIC + anon; the callers
-- (webhook + cron) use the service client, so grant service_role only.
REVOKE EXECUTE ON FUNCTION confirm_season_paid(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION confirm_season_paid(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION confirm_season_paid(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION cancel_season_group(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cancel_season_group(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION cancel_season_group(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
