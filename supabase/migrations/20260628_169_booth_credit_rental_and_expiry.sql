-- Migration 169: Booth credit — rental-level redemption (Item 4b) + expiry source
-- ---------------------------------------------------------------------------
-- Two additive changes to the booth_credits ledger (migs 166/168):
--   1. related_rental_id — lets a credit be redeemed against a ONE-OFF weekly
--      rental (weekly_booth_rentals), which has no booth_booking_group. Item 4b.
--   2. source 'expired'  — the weekly expiry sweep writes a negative 'expired' row
--      to zero the remaining balance of credits past their expires_at (active
--      expiry; balance stays a plain SUM and never goes negative). Item 2.
-- And generalizes redeem_booth_credit (mig 168) to take an optional p_rental_id,
-- writing whichever reference is supplied (group for season/partial, rental for
-- one-off). The advisory lock + LEAST(balance, requested) logic is unchanged.
--
-- Design: apps/web/.claude/phase_e_remaining_build_plan.md (Item 4b + expiry).
-- Additive: new nullable column + widened CHECK + function signature change.
-- Apply Dev + Staging now; Prod with the Item 4b/expiry push (AFTER 164–168).
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS redeem_booth_credit(uuid, uuid, uuid, integer, uuid);
--   -- re-create mig 168's 4-arg redeem_booth_credit;
--   ALTER TABLE booth_credits DROP CONSTRAINT booth_credits_source_check;
--   ALTER TABLE booth_credits ADD CONSTRAINT booth_credits_source_check
--     CHECK (source IN ('season_settlement','vendor_cancel_pre','vendor_cancel_post','redeemed'));
--   ALTER TABLE booth_credits DROP COLUMN IF EXISTS related_rental_id;
-- ---------------------------------------------------------------------------

-- 1. Rental-level redemption reference (one-off weekly rentals have no group).
ALTER TABLE booth_credits
  ADD COLUMN IF NOT EXISTS related_rental_id UUID REFERENCES weekly_booth_rentals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_booth_credits_related_rental
  ON booth_credits(related_rental_id) WHERE related_rental_id IS NOT NULL;

-- 2. Add 'expired' to the source CHECK (active expiry sweep).
ALTER TABLE booth_credits DROP CONSTRAINT IF EXISTS booth_credits_source_check;
ALTER TABLE booth_credits ADD CONSTRAINT booth_credits_source_check
  CHECK (source IN ('season_settlement','vendor_cancel_pre','vendor_cancel_post','redeemed','expired'));

-- 3. Generalize redeem_booth_credit: optional p_rental_id (one-off). The old
--    4-arg signature is DROPPED so the 5-arg version (rental defaults NULL) is
--    unambiguous; the season caller's 4 named args still resolve to it.
DROP FUNCTION IF EXISTS redeem_booth_credit(uuid, uuid, uuid, integer);

CREATE OR REPLACE FUNCTION redeem_booth_credit(
  p_vendor_profile_id uuid,
  p_market_id uuid,
  p_group_id uuid,
  p_requested_cents integer,
  p_rental_id uuid DEFAULT NULL
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

  INSERT INTO booth_credits (vendor_profile_id, market_id, amount_cents, source, related_group_id, related_rental_id, note)
  VALUES (p_vendor_profile_id, p_market_id, -v_applied, 'redeemed', p_group_id, p_rental_id, 'Redeemed at booking');

  RETURN v_applied;
END;
$$;

COMMENT ON FUNCTION redeem_booth_credit(uuid, uuid, uuid, integer, uuid) IS
  'Phase E Item 4/4b: atomically reserve a vendor''s booth_credits balance against a new booking (advisory-locked per vendor+market). Pass p_group_id for season/partial, p_rental_id for a one-off weekly rental (exactly one). Caller passes the D4-capped requested cents; returns applied cents, writes a negative redeemed row. Released by cancel_season_group (group) or the Phase-16 abandonment sweep (rental). Mig 169.';

REVOKE EXECUTE ON FUNCTION redeem_booth_credit(uuid, uuid, uuid, integer, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION redeem_booth_credit(uuid, uuid, uuid, integer, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION redeem_booth_credit(uuid, uuid, uuid, integer, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
