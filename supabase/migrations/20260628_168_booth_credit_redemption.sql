-- Migration 168: Booth credit redemption (Phase E, Item 4)
-- ---------------------------------------------------------------------------
-- Adds the redemption side of the booth_credits ledger (mig 166):
--   * redeem_booth_credit  — atomically reserve a vendor's credit against a new
--                            booth_booking_group at checkout-creation time
--                            (advisory-locked so concurrent bookings can't
--                            double-spend the same balance). Returns the applied
--                            amount; writes a negative 'redeemed' row.
--   * cancel_season_group   — EXTENDED (mig 167) to RELEASE any redeemed credit
--                            when a pending group is cancelled unpaid, so an
--                            abandoned/expired checkout restores the vendor's
--                            balance (compensating positive row).
--
-- Design: apps/web/.claude/phase_e_remaining_build_plan.md → Item 4 "FINALIZED
-- DESIGN". Credit-first, no Stripe money moves. The redemption discount is
-- applied to BOTH the vendor charge and the manager transfer in payments.ts
-- (separate change, per-file approved), so the platform fee stays invariant.
--
-- Additive: no schema/table/column changes. Functions only.
-- Apply Dev + Staging now; Prod with the Item 4 push, AFTER 164→165→166→167.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS redeem_booth_credit(uuid, uuid, uuid, integer);
--   -- and re-apply migration 167's cancel_season_group body (this file's version
--   -- only ADDS a release block; the mig-167 version is the no-release original).
-- ---------------------------------------------------------------------------

-- Atomically reserve (redeem) a vendor's booth credit for a new group. The
-- per-(vendor, market) advisory lock serializes concurrent redemptions so two
-- in-flight bookings cannot both spend the same balance (a SUM balance cannot be
-- cleanly FOR UPDATE'd). The caller passes an already-capped requested amount
-- (D4: residual vendor charge must stay >= Stripe minimum). Writes a negative
-- 'redeemed' row tied to the group and returns the applied cents (0 if none).
CREATE OR REPLACE FUNCTION redeem_booth_credit(
  p_vendor_profile_id uuid,
  p_market_id uuid,
  p_group_id uuid,
  p_requested_cents integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
  v_applied integer;
BEGIN
  IF p_requested_cents IS NULL OR p_requested_cents <= 0 THEN
    RETURN 0;
  END IF;

  -- Serialize concurrent redemptions for this (vendor, market).
  PERFORM pg_advisory_xact_lock(hashtext(p_vendor_profile_id::text), hashtext(p_market_id::text));

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_balance
  FROM booth_credits
  WHERE vendor_profile_id = p_vendor_profile_id
    AND market_id = p_market_id;

  v_applied := LEAST(v_balance, p_requested_cents);
  IF v_applied <= 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO booth_credits (vendor_profile_id, market_id, amount_cents, source, related_group_id, note)
  VALUES (p_vendor_profile_id, p_market_id, -v_applied, 'redeemed', p_group_id, 'Redeemed at booking');

  RETURN v_applied;
END;
$$;

COMMENT ON FUNCTION redeem_booth_credit(uuid, uuid, uuid, integer) IS
  'Phase E Item 4: atomically reserve a vendor''s booth_credits balance against a new booth_booking_group at checkout-creation (advisory-locked per vendor+market to prevent double-spend). Caller passes the D4-capped requested cents; returns applied cents and writes a negative redeemed row. Released by cancel_season_group if the group is cancelled unpaid. Mig 168.';

-- cancel_season_group — mig 167 body + a RELEASE block. When a pending group is
-- cancelled (abandoned/expired/Stripe-fail), restore any credit redeemed for it.
-- (A PAID group is refused here; vendor self-cancel of a paid redeemed booking is
-- handled in the cancel route with the D5 net-base rule.) The status guard makes
-- the release run exactly once per group.
CREATE OR REPLACE FUNCTION cancel_season_group(p_group_id uuid, p_reason text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_vendor uuid;
  v_market uuid;
  v_redeemed integer;
BEGIN
  SELECT status, vendor_profile_id, market_id
    INTO v_status, v_vendor, v_market
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

  -- RELEASE (mig 168): restore any credit redeemed for this never-paid group.
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_redeemed
  FROM booth_credits
  WHERE related_group_id = p_group_id AND source = 'redeemed';

  IF v_redeemed < 0 THEN
    INSERT INTO booth_credits (vendor_profile_id, market_id, amount_cents, source, related_group_id, note)
    VALUES (v_vendor, v_market, -v_redeemed, 'redeemed', p_group_id, 'Released — booking cancelled unpaid');
  END IF;

  RETURN 'cancelled';
END;
$$;

COMMENT ON FUNCTION cancel_season_group(uuid, text) IS
  'Phase E: atomically cancel a pending booth_booking_groups row + its pending child weekly_booth_rentals (FOR UPDATE serialized). Refuses to cancel a paid group. Mig 168: also RELEASES any redeemed booth credit for the group (compensating positive row) so an abandoned/expired checkout restores the vendor balance. Returns cancelled | already_paid | already_cancelled. Callers: expire-orders Phase 18, book-season Stripe-fail cleanup.';

-- Lock down redeem_booth_credit (SECURITY DEFINER — default PUBLIC grant would
-- expose it to anon). Mirror mig 167: callers use the service client.
REVOKE EXECUTE ON FUNCTION redeem_booth_credit(uuid, uuid, uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION redeem_booth_credit(uuid, uuid, uuid, integer) FROM anon;
GRANT  EXECUTE ON FUNCTION redeem_booth_credit(uuid, uuid, uuid, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
