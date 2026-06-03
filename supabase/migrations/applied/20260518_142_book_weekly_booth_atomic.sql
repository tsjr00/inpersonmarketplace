-- Migration 142: book_weekly_booth_atomic — race-safe booth booking
--
-- =============================================================================
-- !!! POST-PROD-APPLICATION REMINDER (added 2026-05-31, mig 149 session) !!!
-- =============================================================================
-- When this migration is applied to PROD, it CREATEs the
-- `book_weekly_booth_atomic(uuid, uuid, uuid, date, uuid)` function with
-- the default Postgres EXECUTE grant — which includes the `anon` role.
-- That re-opens a security hole that Migration 149 closed on Dev/Staging on
-- 2026-05-31 (Supabase advisor flagged it as SECURITY DEFINER callable by
-- anon via /rest/v1/rpc/book_weekly_booth_atomic).
--
-- AFTER applying this migration to Prod, run (in the same session):
--
--   REVOKE EXECUTE ON FUNCTION
--     public.book_weekly_booth_atomic(uuid, uuid, uuid, date, uuid)
--   FROM anon;
--
-- Or just re-run the full Migration 149 — REVOKE is idempotent on
-- already-revoked grants. File:
--   supabase/migrations/20260531_149_revoke_anon_from_financial_rpcs.sql
-- (or supabase/migrations/applied/ if 149 has been moved by then).
--
-- Claude review note: surface this reminder to the user before they push
-- migs 138-148 to prod. Don't let the prod application happen without the
-- follow-up REVOKE in the same session.
-- =============================================================================
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- To revert this migration on any environment, run:
--
--   BEGIN;
--   DROP FUNCTION IF EXISTS book_weekly_booth_atomic(uuid, uuid, uuid, date, uuid);
--   COMMIT;
--
-- Risk profile:
--   PRE-application or DEV-only: zero data loss; safe.
--   POST-application: rollback re-introduces the check-then-insert race
--     in the booking route. The route still works (it has the inline
--     check as a fallback path), but two concurrent bookings of the last
--     slot can both succeed.
--
-- Dependencies:
--   - mig 134 (market_booth_inventory) — capacity source
--   - mig 135 (market_booth_placeholders) — off-platform occupancy subtraction
--   - mig 138 (vendor_market_agreement_acceptances) — agreement_acceptance_id FK
--   - mig 139 (weekly_booth_rentals) — destination table
-- =============================================================================
--
-- Replaces the inline check-then-insert pattern in
-- /api/vendor/markets/[id]/book with a transaction-locked RPC. The race
-- condition: two vendors hitting /book concurrently can both pass the
-- "remaining > 0" capacity check (separate queries) and both INSERT.
-- UNIQUE (vendor_profile_id, market_id, week_start_date) only blocks the
-- same vendor — different vendors race to overbook the same size tier.
--
-- Solution: acquire pg_advisory_xact_lock on hash of
-- (market_id, inventory_id, week_start_date), then recount + insert
-- inside the lock. Concurrent callers on the same tuple block until the
-- first commits or rolls back. xact lock auto-releases on transaction
-- end — no manual unlock needed.
--
-- Custom SQLSTATEs for the caller to map to HTTP responses:
--   - 'P0001' OVERBOOKED         : all slots taken for this week+size
--   - 'P0002' DUPLICATE          : caller already has a row for this week
--                                   (translated from 23505 unique_violation)
--   - 'P0003' INVENTORY_NOT_FOUND : inventory_id missing or belongs to a
--                                   different market

CREATE OR REPLACE FUNCTION book_weekly_booth_atomic(
  p_vendor_profile_id UUID,
  p_market_id UUID,
  p_inventory_id UUID,
  p_week_start_date DATE,
  p_acceptance_id UUID
)
RETURNS TABLE (
  rental_id UUID,
  rental_price_cents INTEGER,
  rental_status TEXT,
  rental_week_start_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inventory_count INTEGER;
  v_price_cents INTEGER;
  v_placeholder_count INTEGER;
  v_taken_count INTEGER;
  v_remaining INTEGER;
  v_lock_key BIGINT;
  v_new_id UUID;
BEGIN
  -- Lock key: stable hash of the (market, size, week) tuple. Transaction-
  -- scoped — auto-releases on COMMIT/ROLLBACK.
  v_lock_key := hashtextextended(
    p_market_id::text || ':' || p_inventory_id::text || ':' || p_week_start_date::text,
    0
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Defense-in-depth: verify inventory belongs to this market. The trigger
  -- on weekly_booth_rentals also enforces this at INSERT time.
  SELECT mbi.count, mbi.weekly_price_cents
    INTO v_inventory_count, v_price_cents
    FROM market_booth_inventory mbi
    WHERE mbi.id = p_inventory_id
      AND mbi.market_id = p_market_id;

  IF v_inventory_count IS NULL THEN
    RAISE EXCEPTION 'INVENTORY_NOT_FOUND' USING ERRCODE = 'P0003';
  END IF;

  -- Recount inside the lock — values reflect all committed state right now.
  SELECT COUNT(*) INTO v_placeholder_count
    FROM market_booth_placeholders mbp
    WHERE mbp.market_id = p_market_id
      AND mbp.inventory_id = p_inventory_id;

  SELECT COUNT(*) INTO v_taken_count
    FROM weekly_booth_rentals wbr
    WHERE wbr.market_id = p_market_id
      AND wbr.inventory_id = p_inventory_id
      AND wbr.week_start_date = p_week_start_date
      AND wbr.status IN ('pending_payment', 'paid');

  v_remaining := v_inventory_count - v_placeholder_count - v_taken_count;

  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'OVERBOOKED' USING ERRCODE = 'P0001';
  END IF;

  -- Insert. If the same vendor already has a row for this week, forward
  -- the unique_violation as a distinct DUPLICATE code so the route can
  -- return a friendlier 409 message.
  BEGIN
    INSERT INTO weekly_booth_rentals (
      vendor_profile_id,
      market_id,
      week_start_date,
      inventory_id,
      price_cents,
      status,
      agreement_acceptance_id
    ) VALUES (
      p_vendor_profile_id,
      p_market_id,
      p_week_start_date,
      p_inventory_id,
      v_price_cents,
      'pending_payment',
      p_acceptance_id
    )
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'DUPLICATE' USING ERRCODE = 'P0002';
  END;

  RETURN QUERY
    SELECT wbr.id, wbr.price_cents, wbr.status, wbr.week_start_date
      FROM weekly_booth_rentals wbr
      WHERE wbr.id = v_new_id;
END;
$$;

COMMENT ON FUNCTION book_weekly_booth_atomic IS
  'Race-safe weekly booth booking. Acquires pg_advisory_xact_lock on (market, inventory, week), recounts placeholders + active rentals, inserts pending_payment row or RAISES OVERBOOKED/DUPLICATE/INVENTORY_NOT_FOUND. Caller: /api/vendor/markets/[id]/book route. SECURITY DEFINER so service_role can invoke without RLS friction on the underlying tables.';

NOTIFY pgrst, 'reload schema';
