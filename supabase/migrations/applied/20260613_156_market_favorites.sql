-- ============================================================================
-- Migration 156: market follows + market-day notification dedup (Session 92 Phase B-follows)
-- ============================================================================
-- (1) market_favorites — buyers follow a market to get a "market is open today"
--     notification on the morning of each operating day. Exact mirror of
--     vendor_favorites (mig 034): own-row RLS, one row per (user, market).
-- (2) market_day_notification_log — per (market, market_date) dedup marker so
--     the hourly cron sends the market-day notification to followers exactly
--     once. The cron INSERTs ON CONFLICT DO NOTHING and only notifies when it
--     actually claims the row (race-safe, mirrors the survey cron's row-existence
--     dedup but with an explicit claim instead of a count gate).
--
-- Both additive, no data backfill. RLS: market_favorites = own-row (buyer-facing,
-- uses the auth user's client); market_day_notification_log = enabled, NO policies
-- (service-client only — written by the cron, never user-facing).
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS market_day_notification_log;
--   DROP TABLE IF EXISTS market_favorites;
-- ============================================================================

CREATE TABLE IF NOT EXISTS market_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, market_id)
);

CREATE INDEX IF NOT EXISTS idx_market_favorites_user ON market_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_market_favorites_market ON market_favorites(market_id);

ALTER TABLE market_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own market favorites" ON market_favorites
  FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can add market favorites" ON market_favorites
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can remove own market favorites" ON market_favorites
  FOR DELETE USING (user_id = (SELECT auth.uid()));

COMMENT ON TABLE market_favorites IS
  'Buyer follows a market (mirror of vendor_favorites). Drives the market-day-morning notification to followers. Session 92 Phase B.';

-- Per (market, market_date) marker — claimed by the cron before sending the
-- market-day notification to that market's followers. UNIQUE makes the claim
-- atomic via INSERT ... ON CONFLICT DO NOTHING.
CREATE TABLE IF NOT EXISTS market_day_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  market_date DATE NOT NULL,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(market_id, market_date)
);

CREATE INDEX IF NOT EXISTS idx_market_day_notif_log_market ON market_day_notification_log(market_id, market_date DESC);

ALTER TABLE market_day_notification_log ENABLE ROW LEVEL SECURITY;
-- No policies — service-client only (written by cron). Default-deny for anon +
-- authenticated, matching the mig 137 service-only pattern.

COMMENT ON TABLE market_day_notification_log IS
  'Dedup marker: one row per (market, market_date) once the cron has sent the market-day notification to followers. Service-client only. Session 92 Phase B.';

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION (run after apply):
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public' AND table_name IN ('market_favorites','market_day_notification_log');
-- -- expect: 2 rows
-- ============================================================================
