-- ============================================================================
-- Migration 170: market_seasons.potential_makeup_days (Phase E — make-up days)
-- ============================================================================
-- Manager-declared capacity for post-close make-up days (booth-only fulfillment
-- feature). Opt-in: 0 = no make-up buffer this season; if set, must be >= 2.
-- Mirrors the refund_cap_days pattern (NOT NULL DEFAULT + CHECK, mig 164).
-- Additive, no backfill — DEFAULT 0 grandfathers existing seasons to "no buffer."
-- Plan: apps/web/.claude/phase_e_makeup_days_plan.md
--
-- ROLLBACK:
--   ALTER TABLE market_seasons DROP CONSTRAINT IF EXISTS market_seasons_potential_makeup_days_ok;
--   ALTER TABLE market_seasons DROP COLUMN IF EXISTS potential_makeup_days;
-- ============================================================================

ALTER TABLE market_seasons
  ADD COLUMN IF NOT EXISTS potential_makeup_days INTEGER NOT NULL DEFAULT 0
    CONSTRAINT market_seasons_potential_makeup_days_ok
    CHECK (potential_makeup_days = 0 OR potential_makeup_days >= 2);

COMMENT ON COLUMN market_seasons.potential_makeup_days IS
  'Phase E make-up days: manager-declared count of post-close make-up days this market''s climate/community can support. Opt-in: 0 = no buffer; if set, >= 2. Caps how many special-date make-up overrides can be scheduled while status=ended.';

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION (run after apply):
-- SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--  WHERE table_name='market_seasons' AND column_name='potential_makeup_days';
-- -- expect: 1 row, integer, default 0, NOT NULL
-- ============================================================================
