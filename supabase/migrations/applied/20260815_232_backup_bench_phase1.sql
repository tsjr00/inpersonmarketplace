-- ============================================================================
-- Migration 232: Backup-vendor bench, phases 1+2 (owner model 2026-08-15)
-- ADDITIVE ONLY — 1 column on catering_requests + 1 on market_vendors.
-- Paste-and-go class. NO money here: activation packages, penalties, and
-- waivers are phase 3 (its own session, decisions already locked).
--
-- Model (decisions.md "Backup vendors — model decided"):
--   bench size = ceil( (10% base + equal risk bumps) × system-computed
--   vendor requirement ) — lib/events/backup-bench.ts holds the math and the
--   risk-factor id list. The bench is FREE to stand on: standby is a vendor's
--   opt-in after non-selection, promising only to be ASKED, never to go.
--
-- Pre-check (optional):
--   SELECT to_regclass('public.catering_requests') IS NOT NULL;
-- Post-check:
--   SELECT count(*) FROM information_schema.columns
--   WHERE (table_name='catering_requests' AND column_name='cancellation_risk_factors')
--      OR (table_name='market_vendors' AND column_name='standby_opted_in_at');
--   -- expect 2
-- ============================================================================

-- Organizer-declared cancellation-risk checklist (equal weights for now).
-- Values are ids from CANCELLATION_RISK_FACTORS in lib/events/backup-bench.ts.
ALTER TABLE public.catering_requests
  ADD COLUMN IF NOT EXISTS cancellation_risk_factors TEXT[];

COMMENT ON COLUMN public.catering_requests.cancellation_risk_factors IS
  'Organizer-checked cancellation-risk factor ids (lib/events/backup-bench.ts CANCELLATION_RISK_FACTORS). Equal weights until the per-risk value evaluation (backlog). Bumps the backup-bench recommendation.';

-- The vendor said yes to standing by after non-selection. Opt-in only —
-- is_backup marks non-selection (set by the select route); THIS marks consent.
ALTER TABLE public.market_vendors
  ADD COLUMN IF NOT EXISTS standby_opted_in_at TIMESTAMPTZ;

COMMENT ON COLUMN public.market_vendors.standby_opted_in_at IS
  'Vendor opted into the standby bench after non-selection (owner spec 2026-08-08/15: they commit to being ASKED, not to going; may decline activation freely). NULL = never opted in.';

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK:
--   ALTER TABLE public.catering_requests DROP COLUMN IF EXISTS cancellation_risk_factors;
--   ALTER TABLE public.market_vendors DROP COLUMN IF EXISTS standby_opted_in_at;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================================
