-- ============================================================================
-- Migration 161: market_date_overrides (Session 92 cont. — Growth Phase C)
-- ============================================================================
-- Manager cancels a single upcoming market DATE (weather, etc.). v1 = cancel
-- only; status='special' (add-a-date) is a deferred follow-up — column reserved
-- now so the follow-up needs no table-shape migration.
--
-- Effects (enforced in app code + mig 162, NOT in this table):
--   - cancelled date disappears from buyer availability: mig 162 adds a
--     NOT EXISTS on this table to get_available_pickup_dates, which propagates
--     to every wrapper incl. the cart/checkout validator.
--   - buyer product orders on the date  -> auto-refunded (cancel route).
--   - paid booth renters                -> flagged via booth_disposition
--     (credit feeds Phase E's cancelled-day counter; reschedule is advisory in
--     v1). No money movement.
--   - market-box pickups on the date    -> credited via vendor_skip_week
--     (existing skip + makeup-extension RPC).
--
-- One row per (market, date). Additive, no backfill.
-- RLS enabled, NO policies: service-client only, behind isMarketManager
-- (mirrors migs 137/157/160).
--
-- ROLLBACK: DROP TABLE IF EXISTS market_date_overrides;
-- ============================================================================

CREATE TABLE IF NOT EXISTS market_date_overrides (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id         UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  override_date     DATE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'cancelled'
                      CHECK (status IN ('cancelled','special')),
  booth_disposition TEXT NULL CHECK (booth_disposition IN ('credit','reschedule')),
  reschedule_date   DATE NULL,
  reason            TEXT NULL,
  created_by        UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (market_id, override_date)
);

CREATE INDEX IF NOT EXISTS idx_market_date_overrides_market_date
  ON market_date_overrides(market_id, override_date);

ALTER TABLE market_date_overrides ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE market_date_overrides IS
  'Manager date-level overrides for a market. v1: status=cancelled (cancel a market day). status=special reserved for the deferred add-a-date feature. Read via service client behind isMarketManager. Growth Phase C, Session 92.';
COMMENT ON COLUMN market_date_overrides.booth_disposition IS
  'Manager choice when paid booth renters are affected: credit (feeds Phase E cancelled-day counter) or reschedule (advisory make-up date in v1; becomes a real operating date when add-special-date ships). NULL when no paid renters affected.';

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION (run after apply):
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public' AND table_name='market_date_overrides';   -- expect 1
-- SELECT relrowsecurity FROM pg_class WHERE relname='market_date_overrides'; -- expect t
-- ============================================================================
