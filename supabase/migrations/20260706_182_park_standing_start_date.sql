-- ============================================================================
-- Migration 182: park_standing_reservations.requested_start_date
-- ============================================================================
-- FT park-manager P4a follow-up (user-approved 2026-07-06, from staging test).
-- A truck requesting a weekly hold now says WHEN they want it to start — vital
-- info for the operator, and it GATES occurrence generation: the daily sweep
-- won't materialize (or charge for) an occurrence before this date.
--
-- ADDITIVE, nullable. NULL = start immediately (grandfathers any pre-existing
-- rows; the generator treats NULL as "no floor" = today).
-- ============================================================================
-- Dependencies: mig 173 (park_standing_reservations).
-- ROLLBACK: ALTER TABLE park_standing_reservations DROP COLUMN IF EXISTS requested_start_date;
-- ============================================================================
ALTER TABLE park_standing_reservations
  ADD COLUMN IF NOT EXISTS requested_start_date DATE NULL;

COMMENT ON COLUMN park_standing_reservations.requested_start_date IS
  'The date the truck wants the weekly hold to begin (must fall on day_of_week). The occurrence generator does not materialize occurrences before this date. NULL = start immediately.';

NOTIFY pgrst, 'reload schema';
