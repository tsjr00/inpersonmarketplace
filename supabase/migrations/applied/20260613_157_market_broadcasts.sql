-- ============================================================================
-- Migration 157: manager broadcast audit table (Session 92 Phase B-broadcast)
-- ============================================================================
-- market_broadcasts — one row per one-way announcement a manager sends to their
-- market's vendors. Serves three purposes:
--   (1) audit trail of what managers sent (abuse surface — broadcasts reach many
--       vendors at once),
--   (2) rate-limit enforcement (the broadcast route counts rows in the trailing
--       7 days for the market before allowing another send),
--   (3) future "sent broadcasts" history view on the manager dashboard.
--
-- RLS enabled, NO policies — service-client only (the broadcast route enforces
-- isMarketManager() upstream, then writes via the service client). Matches the
-- mig 137 / market_documents service-only pattern.
--
-- Additive, no backfill. ROLLBACK: DROP TABLE IF EXISTS market_broadcasts;
-- ============================================================================

CREATE TABLE IF NOT EXISTS market_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subject TEXT,
  body TEXT NOT NULL,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary access pattern: rate-limit window + history list, both newest-first
-- per market.
CREATE INDEX IF NOT EXISTS idx_market_broadcasts_market ON market_broadcasts(market_id, created_at DESC);

ALTER TABLE market_broadcasts ENABLE ROW LEVEL SECURITY;
-- No policies — service-client only.

COMMENT ON TABLE market_broadcasts IS
  'One-way manager → vendor announcements. Audit trail + rate-limit source + future history view. Service-client only; route enforces isMarketManager upstream. Session 92 Phase B.';

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION (run after apply):
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public' AND table_name='market_broadcasts';
-- -- expect: 1 row
-- ============================================================================
