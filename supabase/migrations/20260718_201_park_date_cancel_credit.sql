-- ============================================================================
-- Migration 201: booth_credits park support — park date-cancel credit + park
--                redemption ref (G3 / PRK-16, user decisions 2026-07-18)
-- ============================================================================
-- USER DECISION: when a park operator cancels a whole DATE, trucks with PAID
-- spot bookings for that date get a booth-credit for another day's booking —
-- the FM cancel-date credit model adapted to FT (parks have no season
-- settlement, so the grant happens AT CANCEL TIME). Barred bookings get NO
-- credit (the forfeit stands); pending_payment bookings were never paid — no
-- credit. Credit amount = what the truck would pay today for that spot-day
-- (booking's snapshotted base price + the park's CURRENT operator_keep_pct —
-- PRK-10-family drift caveat accepted, mirrors FM).
--
-- Three changes, all on the EXISTING booth_credits ledger (mig 166/168/169 —
-- already generic (vendor, market, signed amount); balance = SUM; redemption
-- serialization via redeem_booth_credit's advisory lock):
--
-- (1) source CHECK gains 'park_date_cancel' (the grant rows).
-- (2) + column related_park_booking_id FK→park_spot_bookings ON DELETE SET
--     NULL, with a PARTIAL UNIQUE index on the GRANT rows — one
--     park-date-cancel credit per booking EVER, so a cascade re-run (or a
--     re-cancelled date) can never double-credit. (Redemption rows may also
--     carry the ref, unconstrained — mirrors related_rental_id.)
-- (3) redeem_booth_credit 5-arg → 6-arg (+ p_park_booking_id DEFAULT NULL):
--     park checkout redemptions carry their audit ref. Existing FM callers
--     (book/route.ts, book-season/route.ts) are unaffected via the default.
--     DROP + CREATE (adding a defaulted arg changes the signature); grants
--     re-issued (service_role only, mirrors migs 168/169).
--
-- Companion code (same batch): cancel-date cascade park branch
-- (creditParkSpotBookings in lib/markets/cancel-date-cascade.ts) + the
-- park_date_cancelled_truck notification + credit redemption at the park
-- booking checkout (book-park-spot route + createParkSpotCheckoutSession).
-- Pre-migration-safe: the cascade branch treats a CHECK-violation/unknown-
-- column error as "credit rail not installed" → logs and skips the grant
-- (bookings still cancelled; nothing misrecorded); redemption passes the new
-- arg only via .rpc named params — pre-migration the 6-arg fn is absent and
-- the 5-arg call shape is not used, so the route's redeem call errors → it
-- already degrades to appliedCreditCents = 0 (FM book/route.ts pattern).
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS redeem_booth_credit(uuid,uuid,uuid,integer,uuid,uuid);
--   re-create the mig-169 5-arg body (file in migrations/applied/);
--   DROP INDEX IF EXISTS uq_booth_credit_park_booking_grant;
--   ALTER TABLE booth_credits DROP COLUMN IF EXISTS related_park_booking_id;
--   restore the mig-169 CHECK (drop + re-add without 'park_date_cancel' —
--   only safe while no 'park_date_cancel' rows exist).
-- ============================================================================

-- (1) Widen the source CHECK.
ALTER TABLE booth_credits DROP CONSTRAINT IF EXISTS booth_credits_source_check;
ALTER TABLE booth_credits ADD CONSTRAINT booth_credits_source_check
  CHECK (source IN (
    'season_settlement',
    'vendor_cancel_pre',
    'vendor_cancel_post',
    'redeemed',
    'expired',
    'park_date_cancel'
  ));

-- (2) Park booking ref + one-grant-per-booking idempotency.
ALTER TABLE booth_credits
  ADD COLUMN IF NOT EXISTS related_park_booking_id UUID NULL
    REFERENCES park_spot_bookings(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_booth_credit_park_booking_grant
  ON booth_credits (related_park_booking_id)
  WHERE source = 'park_date_cancel' AND related_park_booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_booth_credits_park_booking
  ON booth_credits (related_park_booking_id)
  WHERE related_park_booking_id IS NOT NULL;

-- (3) redeem_booth_credit gains the park ref (6-arg replace).
DROP FUNCTION IF EXISTS redeem_booth_credit(uuid, uuid, uuid, integer, uuid);

CREATE OR REPLACE FUNCTION redeem_booth_credit(
  p_vendor_profile_id uuid,
  p_market_id uuid,
  p_group_id uuid,
  p_requested_cents integer,
  p_rental_id uuid DEFAULT NULL,
  p_park_booking_id uuid DEFAULT NULL
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

  INSERT INTO booth_credits (vendor_profile_id, market_id, amount_cents, source, related_group_id, related_rental_id, related_park_booking_id, note)
  VALUES (p_vendor_profile_id, p_market_id, -v_applied, 'redeemed', p_group_id, p_rental_id, p_park_booking_id, 'Redeemed at booking');

  RETURN v_applied;
END;
$$;

COMMENT ON FUNCTION redeem_booth_credit IS
  'Atomically applies up to p_requested_cents of a vendor''s booth-credit balance at a market (advisory-locked per vendor+market; balance = SUM). Writes a -applied ''redeemed'' row referencing the booking (group, weekly rental, or park booking — mig 201). Returns applied cents (0 if none). Service-role only.';

REVOKE EXECUTE ON FUNCTION redeem_booth_credit(uuid, uuid, uuid, integer, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION redeem_booth_credit(uuid, uuid, uuid, integer, uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION (run after applying; read-only unless noted)
-- ============================================================================
-- 1) SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'booth_credits_source_check';
--    → includes 'park_date_cancel'.
-- 2) SELECT proname, pronargs FROM pg_proc WHERE proname='redeem_booth_credit';
--    → ONE row, pronargs = 6.
-- 3) Cancel a park date with a PAID test booking (manager Cancel-a-Date card):
--    → booth_credits gains ONE +row (source 'park_date_cancel', the booking
--    ref set); cancelling the SAME date again adds NOTHING (partial unique).
-- 4) Book a new date at that park as the credited truck → Stripe charge is
--    reduced by the credit; booth_credits gains a -row ('redeemed',
--    related_park_booking_id set).
-- ============================================================================
