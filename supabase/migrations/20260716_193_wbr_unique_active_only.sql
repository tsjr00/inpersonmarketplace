-- =============================================================================
-- Migration 193: weekly_booth_rentals — UNIQUE only for ACTIVE bookings (MGR-2)
-- =============================================================================
-- WHY: mig 139 created a PLAIN `UNIQUE (vendor_profile_id, market_id,
-- week_start_date)` with no status predicate, so a CANCELLED rental row
-- permanently blocks that vendor from ever booking that (market, week) again:
--   * abandon checkout once → Phase 16 sweeps the row to 'cancelled' (kept) →
--     the week is poisoned for that vendor forever ("contact the market
--     manager", but no manager tool exists);
--   * any SEASON containing a poisoned week also fails whole (book_season_atomic
--     loops book_weekly_booth_atomic in one transaction — mig 165);
--   * book-season's Stripe-failure cleanup (cancel_season_group) leaves
--     cancelled children that poison all their weeks the same way.
-- The Phase 16 comment claiming "the UNIQUE constraint frees up" was FALSE.
--
-- FIX: replace the plain constraint with a PARTIAL unique index covering only
-- rows that actually occupy the (vendor, market, week) slot. Cancelled rows
-- keep their history but stop blocking. 'completed' (dormant status, never yet
-- written) is included defensively — a delivered week should still block a
-- duplicate booking of itself.
--
-- Order matters: create the new index BEFORE dropping the constraint so there
-- is no unprotected window. Existing data satisfies the new index trivially
-- (the old, stricter constraint guaranteed no duplicates at all).
--
-- The RPCs need no change: book_weekly_booth_atomic catches unique_violation →
-- 'DUPLICATE' (mig 186:243), which the partial index still raises for active
-- duplicates. Capacity counting (mig 186:110, pending/paid only) is unaffected.
-- Companion code: none required — pre-migration-safe by nature.
-- =============================================================================

-- 1. New partial unique index (active bookings only).
CREATE UNIQUE INDEX IF NOT EXISTS uq_wbr_vendor_market_week_active
  ON weekly_booth_rentals (vendor_profile_id, market_id, week_start_date)
  WHERE status IN ('pending_payment', 'paid', 'completed');

-- 2. Drop the plain constraint. The auto-generated name can differ across
--    environments, so discover it from pg_catalog by its column set instead of
--    hard-coding (verification-discipline: enumerate by query, never memory).
DO $$
DECLARE
  v_name text;
BEGIN
  SELECT c.conname INTO v_name
  FROM pg_constraint c
  WHERE c.conrelid = 'public.weekly_booth_rentals'::regclass
    AND c.contype = 'u'
    AND (
      SELECT array_agg(a.attname::text ORDER BY a.attname)
      FROM unnest(c.conkey) AS k(attnum)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    ) = ARRAY['market_id', 'vendor_profile_id', 'week_start_date'];

  IF v_name IS NULL THEN
    RAISE NOTICE 'mig 193: plain unique constraint on (vendor, market, week) not found — nothing to drop (already migrated?)';
  ELSE
    EXECUTE format('ALTER TABLE public.weekly_booth_rentals DROP CONSTRAINT %I', v_name);
    RAISE NOTICE 'mig 193: dropped constraint % (replaced by uq_wbr_vendor_market_week_active)', v_name;
  END IF;
END $$;

-- Verification (run after applying):
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE tablename = 'weekly_booth_rentals' AND indexname = 'uq_wbr_vendor_market_week_active';
--   -- and confirm the old constraint is gone:
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.weekly_booth_rentals'::regclass AND contype = 'u';
