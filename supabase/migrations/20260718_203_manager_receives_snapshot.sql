-- ============================================================================
-- Migration 203: manager_receives_cents snapshot on booth + park bookings
--                (PRK-10 + MGR-8-stats, user design approval 2026-07-18)
-- ============================================================================
-- Manager earnings dashboards recomputed per-booking net from the snapshotted
-- PRICE at TODAY'S rates (manager-dashboard-stats.ts — FM at the standard
-- split, FT parks with the CURRENT operator_keep_pct) and ignored applied
-- booth credits entirely. Consequences: changing the keep-pct silently
-- rewrote history, and credit-reduced bookings displayed more than the
-- manager actually received — while their paid NOTIFICATIONS already show the
-- true net (MGR-8), so dashboard vs. receipts disagreed.
--
-- Fix (user-approved design): snapshot the CHARGE-TIME, NET-OF-CREDIT manager
-- take onto each booking row at the paid flip. For multi-date park groups the
-- group's applied credit is prorated across rows (floor + remainder) so the
-- stamps sum EXACTLY to the real Stripe transfer. Dashboards read the stamp
-- when present and fall back to today's recompute for pre-migration rows
-- (labeled "estimated at current rates" only when such rows are in view).
-- Presentation deliberately stays a single net figure — no fee-split
-- breakdown (managers reconcile against Stripe + notification receipts;
-- duplication declined by user).
--
-- ADDITIVE — 2 nullable columns, no backfill (historical rates are unknowable;
-- old rows remain estimates and the label ages out as real bookings accrue).

ALTER TABLE weekly_booth_rentals
  ADD COLUMN IF NOT EXISTS manager_receives_cents INTEGER NULL
    CHECK (manager_receives_cents IS NULL OR manager_receives_cents >= 0);

ALTER TABLE park_spot_bookings
  ADD COLUMN IF NOT EXISTS manager_receives_cents INTEGER NULL
    CHECK (manager_receives_cents IS NULL OR manager_receives_cents >= 0);

COMMENT ON COLUMN weekly_booth_rentals.manager_receives_cents IS
  'PRK-10 (mig 203): charge-time NET manager take for this rental (fee split at payment time, minus any applied booth credit). Stamped by the paid-flip webhook. NULL = pre-mig row (dashboards estimate at current rates).';
COMMENT ON COLUMN park_spot_bookings.manager_receives_cents IS
  'PRK-10 (mig 203): charge-time NET manager take for this booking date (charge-time operator_keep_pct split, minus this row''s prorated share of the group''s applied credit — rows of a group sum exactly to the Stripe transfer). Stamped by the paid-flip webhook. NULL = pre-mig row (dashboards estimate at current rates).';

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION (run after applying)
-- ============================================================================
-- 1) SELECT table_name FROM information_schema.columns
--    WHERE column_name = 'manager_receives_cents';
--    → weekly_booth_rentals + park_spot_bookings.
-- 2) Pay a test booth rental / park booking → the row(s) gain
--    manager_receives_cents; for a park booking made WITH a booth credit,
--    SUM(manager_receives_cents) over the group = the Stripe transfer amount.
-- 3) Manager dashboard earnings for a window containing ONLY post-mig rows
--    shows no "estimated" footnote; a window with pre-mig rows shows it.
-- ============================================================================
-- ROLLBACK:
--   ALTER TABLE weekly_booth_rentals DROP COLUMN IF EXISTS manager_receives_cents;
--   ALTER TABLE park_spot_bookings DROP COLUMN IF EXISTS manager_receives_cents;
-- (Companion code is tolerant: stamp failures are logged, dashboards fall
--  back to the recompute.)
