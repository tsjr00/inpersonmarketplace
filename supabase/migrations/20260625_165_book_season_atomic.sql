-- Migration 165: book_season_atomic — all-or-nothing season/partial booking
--
-- =============================================================================
-- !!! POST-PROD-APPLICATION REMINDER !!!
-- =============================================================================
-- This CREATEs a SECURITY DEFINER function with the default PUBLIC EXECUTE grant
-- (which includes anon). The REVOKEs at the bottom close that — but if this is
-- ever re-applied or the REVOKEs are skipped, anon could call it via
-- /rest/v1/rpc/book_season_atomic. Mirrors the book_weekly_booth_atomic
-- treatment (migs 142/149/152). The REVOKE FROM PUBLIC + anon is INCLUDED below
-- and is idempotent — safe to re-run.
-- =============================================================================
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
--   DROP FUNCTION IF EXISTS book_season_atomic(uuid, uuid, uuid, uuid, uuid, text, date[], date);
--   NOTIFY pgrst, 'reload schema';
-- COMMIT;
--
-- Risk: additive (new function). Rollback removes the season-booking path; the
-- season route would 500 until restored. No data loss (no tables touched).
--
-- Dependencies: mig 142/146 (book_weekly_booth_atomic), mig 164 (market_seasons,
--   booth_booking_groups, weekly_booth_rentals.group_id).
-- =============================================================================
--
-- Phase E (Option B, refined): a THIN wrapper that loops the EXISTING race-safe
-- book_weekly_booth_atomic inside ONE transaction. Because nested plpgsql calls
-- share the transaction, ANY inner RAISE (OVERBOOKED/DUPLICATE/...) rolls back
-- the whole group + every prior week → true all-or-nothing. No partial state, no
-- compensating-delete, no orphan rows. Reuses the proven inner function — no
-- duplicated capacity/booth-label logic.
--
-- Fee math stays in pricing.ts (single source of truth): this returns the
-- per-week SNAPSHOT price_cents; the caller computes group totals + the Stripe
-- charge from those. The group is inserted with placeholder totals (0) that the
-- caller fills in before checkout.
--
-- O3 (all-or-nothing with message): the inner call is wrapped in an exception
-- block that annotates the failure with the offending week, then re-RAISEs to
-- roll the transaction back — so the route can tell the vendor WHICH week is
-- unavailable ("adjust your selection").

CREATE OR REPLACE FUNCTION book_season_atomic(
  p_vendor_profile_id UUID,
  p_market_id UUID,
  p_inventory_id UUID,
  p_acceptance_id UUID,
  p_season_id UUID,             -- nullable: NULL for ad-hoc partial
  p_kind TEXT,                  -- 'season' | 'partial'
  p_week_start_dates DATE[],    -- Sundays (from season-weeks enumeration)
  p_purchase_date DATE
)
RETURNS TABLE (
  group_id UUID,
  rental_id UUID,
  rental_week_start_date DATE,
  rental_price_cents INTEGER,
  rental_booth_number TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id UUID;
  v_week DATE;
  v_rental_id UUID;
  v_price INTEGER;
  v_wsd DATE;
  v_booth TEXT;
BEGIN
  IF array_length(p_week_start_dates, 1) IS NULL THEN
    RAISE EXCEPTION 'NO_WEEKS' USING ERRCODE = 'P0006';
  END IF;

  IF p_kind NOT IN ('season', 'partial') THEN
    RAISE EXCEPTION 'INVALID_KIND' USING ERRCODE = 'P0007';
  END IF;

  -- 1. Create the group (pending_payment). Totals are placeholders — the caller
  --    fills them from the per-week prices via pricing.ts. The same-market
  --    integrity trigger (mig 164) validates inventory_id + season_id ∈ market.
  INSERT INTO booth_booking_groups (
    vendor_profile_id, market_id, inventory_id, season_id, kind,
    week_count, total_vendor_cents, total_manager_cents, purchase_date, status
  ) VALUES (
    p_vendor_profile_id, p_market_id, p_inventory_id, p_season_id, p_kind,
    array_length(p_week_start_dates, 1), 0, 0, p_purchase_date, 'pending_payment'
  )
  RETURNING id INTO v_group_id;

  -- 2. Book each week via the existing RPC, in THIS transaction. Annotate any
  --    failure with the week, then re-RAISE → whole transaction rolls back.
  FOREACH v_week IN ARRAY p_week_start_dates LOOP
    BEGIN
      SELECT r.rental_id, r.rental_price_cents, r.rental_week_start_date, r.rental_booth_number
        INTO v_rental_id, v_price, v_wsd, v_booth
        FROM book_weekly_booth_atomic(
          p_vendor_profile_id, p_market_id, p_inventory_id, v_week, p_acceptance_id
        ) AS r;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'SEASON_BOOK_FAILED week=% reason=%',
        to_char(v_week, 'YYYY-MM-DD'), SQLERRM;
    END;

    -- Link the freshly-created rental to its group.
    UPDATE weekly_booth_rentals SET group_id = v_group_id WHERE id = v_rental_id;

    group_id := v_group_id;
    rental_id := v_rental_id;
    rental_week_start_date := v_wsd;
    rental_price_cents := v_price;
    rental_booth_number := v_booth;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION book_season_atomic IS
  'Phase E (Option B): all-or-nothing season/partial booking. Inserts a booth_booking_groups row then loops the existing book_weekly_booth_atomic per week IN ONE TRANSACTION (any inner RAISE rolls back the whole group). Stamps group_id on each child. Returns group_id + per-week (rental_id, week, snapshot price_cents, booth_number). Fee totals computed by the caller (pricing.ts). On conflict RAISEs SEASON_BOOK_FAILED naming the week. Caller: /api/vendor/markets/[id]/book-season via service client.';

-- Lock down: SECURITY DEFINER + default PUBLIC grant would expose this to anon.
-- Mirror book_weekly_booth_atomic (migs 142/149/152): REVOKE FROM PUBLIC + anon.
-- The season route calls it via the service client (service_role retains EXECUTE).
REVOKE EXECUTE ON FUNCTION
  book_season_atomic(uuid, uuid, uuid, uuid, uuid, text, date[], date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION
  book_season_atomic(uuid, uuid, uuid, uuid, uuid, text, date[], date) FROM anon;
-- Explicit grant so the season route's service client is guaranteed EXECUTE after
-- the PUBLIC revoke (don't rely on role inheritance). authenticated is left
-- without EXECUTE — the route uses the service client, not the user's client.
GRANT EXECUTE ON FUNCTION
  book_season_atomic(uuid, uuid, uuid, uuid, uuid, text, date[], date) TO service_role;

NOTIFY pgrst, 'reload schema';
