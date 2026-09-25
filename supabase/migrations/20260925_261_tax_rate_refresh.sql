-- ============================================================================
-- Pre-check: OPTIONAL — additive DDL only (ADD COLUMN IF NOT EXISTS, CREATE
--    TABLE IF NOT EXISTS, index, RLS enable, REVOKE); safe to paste the whole
--    file as-is and safe to run twice. Nothing existing is altered.
--    The POST-CHECK at the end is LIVE: it returns the scoped catalog export
--    (the new column + the new table's columns · FK · checks · indexes · RLS ·
--    grants) — paste it back; it is the measured input for the snapshot rebuild.
--    (Rule L: a CREATE TABLE past the 260 stamp keeps the test suite RED until
--    that rebuild moves the stamp to 261.)
--    Prod order: after 260 (no dependency on 252–260; can also run alone).
--    ⚠ DEPLOY ORDER: the tax-rate-refresh cron READS and WRITES these objects.
--    Apply 261 on an environment BEFORE that environment runs the cron. Staging
--    never runs crons (manual curl only). On Prod the code lands first (wipe →
--    code → migs), so apply 261 before the next scheduled run (09:00 UTC on the
--    1st, or daily in Jan/Apr/Jul/Oct); otherwise that run logs one error and
--    changes nothing.
-- ============================================================================
-- Migration 261: sales-tax quarterly rate refresh — carry-forward stamp +
--                rate-correction record (tax build step 12; owner rulings Q4
--                2026-09-24 and 2026-09-25 "yes to a rate-correction line")
-- ============================================================================
-- WHY
--   The checkout tax engine refuses any market whose rate stamp is not the
--   CURRENT quarter. The Comptroller's file for a new quarter is not published
--   in advance and has landed 22 days late, so the refresh job stamps the new
--   quarter on last quarter's rates ("carry forward") and re-checks daily.
--   (1) markets.tax_rates_carried_forward_at — WHEN the carry-forward began, so
--       the admin can be told how many taxed items sold on it. Cleared when a
--       current-quarter file confirms or replaces the rates.
--   (2) tax_rate_corrections — we file MONTHLY and Texas is owed tax at the rate
--       in effect on each sale, whatever we collected. When a late file changes
--       a rate, the sales made at the old rate must be re-stated on the return
--       (the platform absorbs the difference). The job records the change here
--       — market, quarter, the instant it was applied, and each code's old and
--       new rate — and the Form 01-116 report re-states matching lines from it
--       (lib/tax/rate-corrections.ts). Item snapshots are never edited.
--
-- WHAT THIS DOES
--   ALTER TABLE markets ADD tax_rates_carried_forward_at TIMESTAMPTZ NULL.
--   CREATE TABLE tax_rate_corrections (append-only, service-only: RLS on, no
--   policies, REVOKE from anon/authenticated). No triggers, no functions.
--
-- ROLLBACK (single transaction; safe while tax_rate_corrections is empty):
--   BEGIN;
--     DROP TABLE IF EXISTS public.tax_rate_corrections;
--     ALTER TABLE public.markets DROP COLUMN IF EXISTS tax_rates_carried_forward_at;
--     NOTIFY pgrst, 'reload schema';
--   COMMIT;
--
-- Dependencies: mig 214 (market tax columns + item snapshots).
-- ============================================================================

BEGIN;

-- ── (1) Carry-forward stamp ─────────────────────────────────────────────────
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS tax_rates_carried_forward_at TIMESTAMPTZ;

COMMENT ON COLUMN public.markets.tax_rates_carried_forward_at IS
  'Set by the quarterly rate-refresh job when it stamped the current quarter on LAST quarter''s rates because the Comptroller''s new file was not published yet (owner Q4, 2026-09-24). Cleared when a current-quarter file confirms or replaces the rates. While set, orders taxed here used carried-forward rates (mig 261).';

-- ── (2) Rate-correction record ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tax_rate_corrections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id   UUID NOT NULL REFERENCES public.markets(id),
  -- "YYYY-Qn" — matches order_items.tax_rate_version of the affected sales.
  quarter     TEXT NOT NULL CHECK (quarter ~ '^[0-9]{4}-Q[1-4]$'),
  -- Sales at this market in this quarter strictly BEFORE this instant, still
  -- carrying an old rate for a changed code, are re-stated on the return.
  applied_at  TIMESTAMPTZ NOT NULL,
  -- [{code, old_rate_pct, new_rate_pct}]
  changes     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_rate_corrections_quarter
  ON public.tax_rate_corrections (quarter);

COMMENT ON TABLE public.tax_rate_corrections IS
  'APPEND-ONLY record of Comptroller rate changes applied to a market by the quarterly refresh job. The Texas List Supplement report re-states lines of sales made in that quarter before applied_at that still carry the old rate (lib/tax/rate-corrections.ts) — Texas is owed the rate in effect; the platform absorbs the difference. Service-role only (mig 261).';

ALTER TABLE public.tax_rate_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tax_rate_corrections FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.tax_rate_corrections TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- POST-CHECK — LIVE: the scoped catalog export. Expect: 1 COLUMN row for
-- markets.tax_rates_carried_forward_at + 6 COLUMN rows for the table, 1 FK,
-- 1 CHECK, 1 PK, 2 INDEX rows, RLS "rls_enabled=true · policies=0", GRANT rows
-- for service_role only. Paste the whole result back.
-- ============================================================================
SELECT 'COLUMN' AS section,
       (table_name || '.' || column_name)::text AS item,
       (data_type || ' · ' || CASE WHEN is_nullable = 'YES' THEN 'null' ELSE 'not null' END
        || ' · default ' || COALESCE(column_default, '-'))::text AS detail
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'markets' AND column_name = 'tax_rates_carried_forward_at')
       OR table_name = 'tax_rate_corrections')
UNION ALL
SELECT 'FK', conname::text, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid = 'public.tax_rate_corrections'::regclass AND contype = 'f'
UNION ALL
SELECT 'CHECK', conname::text, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid = 'public.tax_rate_corrections'::regclass AND contype = 'c'
UNION ALL
SELECT 'UNIQUE/PK', conname::text, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid = 'public.tax_rate_corrections'::regclass AND contype IN ('u', 'p')
UNION ALL
SELECT 'INDEX', indexname::text, indexdef
FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'tax_rate_corrections'
UNION ALL
SELECT 'RLS', c.relname::text,
       'rls_enabled=' || c.relrowsecurity::text || ' · policies='
       || (SELECT COUNT(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname)::text
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'tax_rate_corrections'
UNION ALL
SELECT 'GRANT', (table_name || ' → ' || grantee)::text,
       string_agg(privilege_type::text, ',' ORDER BY privilege_type::text)
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'tax_rate_corrections'
  AND grantee IN ('anon', 'authenticated', 'service_role')
GROUP BY table_name, grantee
ORDER BY 1, 2;
