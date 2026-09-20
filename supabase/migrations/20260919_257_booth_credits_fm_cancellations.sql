-- ============================================================================
-- ⛔ PRE-CHECK FIRST — run the read-only pre-check below on the SAME environment
--    and read the rows before pasting (expected: 0 rows / column absent).
-- ============================================================================
-- Migration 257: booth_credits — FM cancellation credits (booth model part D,
--                owner rulings 2026-09-19 · design booth_model_design.md BR-9 /
--                BR-10 / §6-3)
-- ============================================================================
-- WHAT WAS DECIDED
--   BR-9  Manager cancels a market DAY → every PAID ONE-OFF booth week covering
--         it is credited automatically, per day, at cancel time — the FT
--         park-date-cancel model (mig 201) applied to the FM week. Amount = the
--         vendor-paid share of that day: week price ÷ the operating days that
--         week the vendor DECLARED; never for an undeclared or past day; total
--         per booking never above what the vendor paid. Season/partial groups
--         stay on the cap-based settlement (2026-06-12/27) — untouched here.
--   BR-10 Vendor bears the risk on a paid one-off week — no vendor cancel, no
--         refund. The MANAGER may cancel a paid one-off week → credit for the
--         remaining declared days (full amount if the week has not started).
--         Credit, never cash: the manager already holds the money from the
--         destination charge (mig 166 rationale).
--
-- WHAT THIS DOES (additive; no function bodies touched):
--   (1) booth_credits.source CHECK gains 'fm_date_cancel' and
--       'manager_week_cancel' (drop + re-add, mirroring migs 169/201).
--   (2) + column related_cancel_date DATE NULL — the cancelled market date a
--       per-day grant is for. An FM week can lose TWO market days (Wed + Sat),
--       so "one grant per booking" (the FT index) is not enough; the grain is
--       (booking, date).
--   (3) Partial UNIQUE indexes: one fm_date_cancel grant per (booking, date)
--       EVER, one manager_week_cancel grant per booking EVER — so a cascade
--       re-run or a double-click can never credit twice. Redemption rows
--       ('redeemed') may reference the same booking, unconstrained.
--
-- Companion code (same push): lib/markets/cancel-date-cascade.ts path B
-- (FM per-day credit + the existing market_date_cancelled_vendor notice gains
-- the amount) · api/market-manager/[marketId]/weekly-rental/[rentalId]/cancel
-- (manager cancels a paid week → credit) · redemption unchanged
-- (redeem_booth_credit already sums every source).
-- Pre-migration safe: a grant insert failing on the CHECK / unknown column is
-- logged and skipped — the day is still cancelled / the week still cancelled;
-- the vendor is owed a credit the log names (same pattern as mig 201's cascade).
--
-- ROLLBACK (single transaction; only safe while no rows carry the new sources):
--   BEGIN;
--     DROP INDEX IF EXISTS uq_booth_credit_fm_date_cancel_grant;
--     DROP INDEX IF EXISTS uq_booth_credit_manager_week_cancel_grant;
--     ALTER TABLE booth_credits DROP COLUMN IF EXISTS related_cancel_date;
--     ALTER TABLE booth_credits DROP CONSTRAINT IF EXISTS booth_credits_source_check;
--     ALTER TABLE booth_credits ADD CONSTRAINT booth_credits_source_check
--       CHECK (source IN ('season_settlement','vendor_cancel_pre','vendor_cancel_post','redeemed','expired','park_date_cancel'));
--     NOTIFY pgrst, 'reload schema';
--   COMMIT;
--
-- Dependencies: migs 166/168/169/201 (booth_credits + sources), 139 (rentals).
-- Prod order: 254 → 255 → 256 → 257.
--
-- ============================================================================
-- PRE-CHECK (read-only; run on the target env first)
-- ============================================================================
-- 1. Current CHECK — expect the mig-201 list (six values, no fm_/manager_ yet):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'booth_credits_source_check';
-- 2. Column must not exist yet (expect 0 rows):
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'booth_credits' AND column_name = 'related_cancel_date';
-- 3. No rows already carry the new sources (expect 0):
--   SELECT COUNT(*) FROM booth_credits WHERE source IN ('fm_date_cancel','manager_week_cancel');
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
    'park_date_cancel',
    'fm_date_cancel',        -- mig 257 (BR-9): FM market day cancelled, per-day grant on a paid one-off week
    'manager_week_cancel'    -- mig 257 (BR-10): manager cancelled a paid one-off week
  ));

-- (2) The cancelled market date a per-day grant is for.
ALTER TABLE booth_credits
  ADD COLUMN IF NOT EXISTS related_cancel_date DATE NULL;

COMMENT ON COLUMN booth_credits.related_cancel_date IS
  'Mig 257 (BR-9): for source=fm_date_cancel, the cancelled market date this per-day grant compensates. With related_rental_id it is the idempotency key — one grant per (booking, date).';

-- (3) One grant per (booking, date) / per booking — idempotency for re-runs.
CREATE UNIQUE INDEX IF NOT EXISTS uq_booth_credit_fm_date_cancel_grant
  ON booth_credits (related_rental_id, related_cancel_date)
  WHERE source = 'fm_date_cancel' AND related_rental_id IS NOT NULL AND related_cancel_date IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_booth_credit_manager_week_cancel_grant
  ON booth_credits (related_rental_id)
  WHERE source = 'manager_week_cancel' AND related_rental_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- POST-CHECK (read-only; paste the results back)
-- ============================================================================
-- 1. CHECK carries both new values:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'booth_credits_source_check';
-- 2. Column present (expect 1 row, date, YES):
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_name = 'booth_credits' AND column_name = 'related_cancel_date';
-- 3. Both indexes present (expect 2 rows):
--   SELECT indexname FROM pg_indexes WHERE tablename = 'booth_credits'
--     AND indexname IN ('uq_booth_credit_fm_date_cancel_grant','uq_booth_credit_manager_week_cancel_grant');
-- ============================================================================
