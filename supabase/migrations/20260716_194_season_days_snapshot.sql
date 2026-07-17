-- =============================================================================
-- Migration 194: market_seasons.days_per_week_snapshot (MGR-9b)
-- =============================================================================
-- WHY: season settlement prorates what a manager owes per prepaid day as
--   perDayBase = total_manager_cents / (week_count * activeDaysPerWeek)
-- and activeDaysPerWeek was a LIVE count of active market_schedules
-- (settlement route loadContext). A manager adding a schedule day mid-season
-- inflates the denominator and retroactively shrinks the owed value for
-- already-paid vendors. USER DECISION 2026-07-16 (MGR-9 = both): freeze the
-- set_cap lever in code (shipped, slice-3 batch 1) AND snapshot the
-- days-per-week denominator at season creation (this migration).
--
-- NULL semantics: a NULL snapshot means "pre-mig-194 season" — settlement
-- falls back to the live count exactly as before, so nothing changes for
-- seasons we can't reconstruct. New seasons get the snapshot written at
-- creation by the companion code (seasons POST).
-- =============================================================================

ALTER TABLE market_seasons
  ADD COLUMN IF NOT EXISTS days_per_week_snapshot INTEGER;

COMMENT ON COLUMN market_seasons.days_per_week_snapshot IS
  'MGR-9(b): count of active market_schedules at season creation. Settlement uses this as the per-week day denominator so mid-season schedule edits cannot change what is owed to already-paid vendors. NULL = created before mig 194 (settlement falls back to the live count).';

-- Backfill in-flight seasons from the CURRENT live schedule count — the best
-- available approximation (identical to what settlement computes today), and it
-- freezes the denominator from this point forward.
UPDATE market_seasons ms
SET days_per_week_snapshot = sub.cnt
FROM (
  SELECT market_id, COUNT(*)::int AS cnt
  FROM market_schedules
  WHERE active = true
  GROUP BY market_id
) sub
WHERE sub.market_id = ms.market_id
  AND ms.days_per_week_snapshot IS NULL;

-- Verification (run after applying):
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'market_seasons' AND column_name = 'days_per_week_snapshot';
--   SELECT count(*) FILTER (WHERE days_per_week_snapshot IS NULL) AS still_null,
--          count(*) AS total FROM market_seasons;
--   -- still_null should be 0 unless a market has zero active schedules.
