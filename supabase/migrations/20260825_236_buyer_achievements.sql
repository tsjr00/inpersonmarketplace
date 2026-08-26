-- ============================================================================
-- Migration 236: buyer_achievements — Loyalty Layer 1 (badges), owner 2026-08-25
-- ADDITIVE ONLY — one new table, no changes to any existing table.
-- Paste-and-go class. NO money here: badges are recognition only; the offers
-- engine (Layer 2) and punch-card/VIP (Layer 3) are later, after chunk D.
--
-- What it stores: the badges a buyer has EARNED (one row per badge, or per
-- badge-per-vendor for the vendor-scoped ones — Regular / Local Legend).
-- Progress toward unearned badges is NOT stored — it is derived live from
-- fulfilled order_items by lib/loyalty/evaluate.ts, so there is no counter
-- to drift. The evaluator inserts only rows that are missing; the unique
-- index below is the race guard (concurrent evaluations → 23505, ignored).
--
-- Code is tolerant of this table not existing yet (the beneficiaries.ts
-- pattern): deploy order does not matter.
--
-- Pre-check (optional):
--   SELECT to_regclass('public.buyer_achievements');   -- expect NULL
-- Post-check:
--   SELECT count(*) FROM information_schema.columns
--   WHERE table_name = 'buyer_achievements';           -- expect 9
--   SELECT indexname FROM pg_indexes
--   WHERE tablename = 'buyer_achievements' ORDER BY 1; -- expect 4 rows
--     (buyer_achievements_pkey, idx_buyer_achievements_user,
--      idx_buyer_achievements_vendor, uq_buyer_achievements_once)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.buyer_achievements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vertical_id       TEXT NOT NULL REFERENCES public.verticals(vertical_id),
  badge_key         TEXT NOT NULL,
  -- NULL for platform-wide badges; set for vendor-scoped ones (regular,
  -- local_legend). Cascade: a deleted vendor takes its per-vendor badges with it.
  vendor_profile_id UUID REFERENCES public.vendor_profiles(id) ON DELETE CASCADE,
  earned_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The counts at the moment it was earned (e.g. {"orders":4}) — for display
  -- and for auditing why a badge fired. Never re-evaluated.
  context           JSONB,
  notified_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One badge per (buyer, vertical, key, vendor). Platform badges have a NULL
-- vendor, and Postgres treats NULLs as distinct in a plain UNIQUE constraint,
-- so the uniqueness is expressed over COALESCE(vendor, zero-uuid).
CREATE UNIQUE INDEX IF NOT EXISTS uq_buyer_achievements_once
  ON public.buyer_achievements (
    user_id, vertical_id, badge_key,
    COALESCE(vendor_profile_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS idx_buyer_achievements_user
  ON public.buyer_achievements (user_id, vertical_id);

CREATE INDEX IF NOT EXISTS idx_buyer_achievements_vendor
  ON public.buyer_achievements (vendor_profile_id)
  WHERE vendor_profile_id IS NOT NULL;

ALTER TABLE public.buyer_achievements ENABLE ROW LEVEL SECURITY;

-- Buyers read their own badges. No INSERT/UPDATE/DELETE policies: rows are
-- written only by the server-side evaluator through the service client
-- (same shape as market_day_notification_log, mig 156).
CREATE POLICY "Buyers can view own achievements" ON public.buyer_achievements
  FOR SELECT USING (user_id = (SELECT auth.uid()));

COMMENT ON TABLE public.buyer_achievements IS
  'Loyalty Layer 1 (2026-08-25): badges a buyer has earned. Progress is derived live from fulfilled order_items (lib/loyalty/evaluate.ts); only EARNED badges are persisted. vendor_profile_id is set for vendor-scoped badges (regular, local_legend). Service-client writes only.';

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.buyer_achievements;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================================
