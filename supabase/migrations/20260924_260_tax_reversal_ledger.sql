-- ============================================================================
-- Pre-check: OPTIONAL — additive DDL only (CREATE TABLE IF NOT EXISTS ×2,
--    indexes IF NOT EXISTS, RLS enable, REVOKE); safe to paste the whole file
--    as-is and safe to run twice. Nothing existing is altered.
--    The POST-CHECK at the end is LIVE: it returns the SCOPED CATALOG EXPORT
--    (columns · FKs · checks · uniques · indexes · RLS · grants) for the two new
--    tables — paste that result back; it is the measured input for the
--    snapshot's structured-tables rebuild (Rule L: a CREATE TABLE past the 257
--    stamp fails the test suite until the rebuild moves the stamp to 260).
--    Prod order: after 259 (no dependency on 252–259; can also run alone).
-- ============================================================================
-- Migration 260: sales-tax REVERSAL LEDGER + dashboard-refund allocation queue
--                (tax build step 7 — plan apps/web/.claude/tax_build_review_research.md;
--                owner rulings 2026-09-24 Q1/Q2 in decisions.md)
-- ============================================================================
-- WHY A LEDGER (research file, findings B/C/E)
--   Every taxed order item carries a frozen per-jurisdiction tax snapshot
--   (mig 214). When money goes back to a buyer, the tax that went back must be
--   (a) refunded to the buyer at the ORIGINAL rate and (b) reported as a
--   reversal on the Texas List Supplement (Form 01-116) for the PERIOD OF THE
--   REFUND, not the period of the sale. The snapshot columns are CHECK >= 0 and
--   must stay immutable (4-year audit, §151.0242), so a reversal cannot be a
--   negative item row or an edit of the sale row. It is a NEW ROW in an
--   append-only ledger: one per (item, refund), carrying exactly the shape the
--   return needs — taxable base reversed, tax reversed, and the per-
--   jurisdiction cents — so the monthly report is
--     buildNetListSupplement(sale snapshots, ledger rows)   (jurisdictions.ts)
--   and never a recomputation.
--
-- WHAT THIS DOES
--   (1) order_item_tax_reversals — the ledger. Written ONLY by the refund paths
--       (service client) AFTER the Stripe refund succeeds. UNIQUE (order_item_id,
--       refund_ref) makes a retried refund idempotent at the ledger too.
--       reversal_kind: item_refund (buyer cancel · bundle cancel · vendor reject ·
--       resolve-issue · cron expiry · market-day cancellation · vendor event
--       withdraw) · order_refund (event cancel · reconfirm · dead-order — the
--       whole PaymentIntent) · dashboard_refund (a refund made by hand in the
--       Stripe dashboard, full → automatic, partial → from the queue below).
--   (2) order_tax_reversal_queue — owner ruling Q2: a PARTIAL refund made by hand
--       in the Stripe dashboard tells us the amount but not the items. The
--       charge.refunded handler records the order + amount here as "reversal
--       OWED"; an admin picks the items on an admin list; the pick writes the
--       ledger rows and resolves the queue row. Never a pro-rata guess.
--   Both tables: RLS ON with NO policies + REVOKE from anon/authenticated →
--   service-role only (the mig-249 posture for money data). No triggers, no
--   functions, no policies (nothing for the RLS workflow's policy audit).
--   NOT changed: order_items, orders, any function, any existing RLS.
--
-- NOT WIRED YET: nothing reads or writes these tables until the refund
--   call-site build (plan steps 8–11) and the report's "minus reversals" pass.
--
-- ROLLBACK (single transaction; safe while both tables are empty):
--   BEGIN;
--     DROP TABLE IF EXISTS public.order_tax_reversal_queue;
--     DROP TABLE IF EXISTS public.order_item_tax_reversals;
--     NOTIFY pgrst, 'reload schema';
--   COMMIT;
--
-- Dependencies: mig 214 (the snapshot this reverses), 259 (tax_source values;
--   not referenced here). orders(id) and order_items(id) exist since 001/004.
-- ============================================================================

BEGIN;

-- ── (1) The ledger ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_item_tax_reversals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id         UUID NOT NULL REFERENCES public.order_items(id),
  order_id              UUID NOT NULL REFERENCES public.orders(id),
  reversal_kind         TEXT NOT NULL
                          CHECK (reversal_kind IN ('item_refund', 'order_refund', 'dashboard_refund')),
  -- Stripe refund id (re_…) when known, else the deterministic idempotency
  -- suffix the path used with createRefund — either way one refund = one ref.
  refund_ref            TEXT NOT NULL,
  -- The reversal itself, in the SNAPSHOT's shape (refund-tax.ts writes it):
  taxable_amount_cents  INTEGER NOT NULL CHECK (taxable_amount_cents >= 0),
  tax_cents             INTEGER NOT NULL CHECK (tax_cents >= 0),
  -- [{code, name, level, rate_pct, tax_cents}] — sums to tax_cents; the per-
  -- jurisdiction cents ARE the return lines (group by code, subtract).
  tax_jurisdictions     JSONB NOT NULL,
  -- Copied from the item so a reversal can be tied to its rate vintage years later.
  tax_rate_version      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_item_tax_reversals_one_per_refund UNIQUE (order_item_id, refund_ref)
);

CREATE INDEX IF NOT EXISTS idx_order_item_tax_reversals_item
  ON public.order_item_tax_reversals (order_item_id);
-- Month-end filing scans by refund date (period placement = created_at).
CREATE INDEX IF NOT EXISTS idx_order_item_tax_reversals_created
  ON public.order_item_tax_reversals (created_at);
CREATE INDEX IF NOT EXISTS idx_order_item_tax_reversals_order
  ON public.order_item_tax_reversals (order_id);

COMMENT ON TABLE public.order_item_tax_reversals IS
  'APPEND-ONLY ledger of sales tax reversed to buyers on refunds — one row per (order item, refund), at the ORIGINAL rate from the item''s mig-214 snapshot, never recomputed. The Texas List Supplement for a month = item snapshots sold that month MINUS these rows created that month (buildNetListSupplement). Service-role only. Written after the Stripe refund succeeds; never edited or deleted (mig 260).';
COMMENT ON COLUMN public.order_item_tax_reversals.refund_ref IS
  'Stripe refund id when known, else the deterministic idempotency suffix passed to createRefund. UNIQUE with order_item_id so a retried refund cannot double-reverse (mig 260).';
COMMENT ON COLUMN public.order_item_tax_reversals.reversal_kind IS
  'item_refund = an in-app per-item refund path · order_refund = a whole-PaymentIntent refund (event cancel, reconfirm, dead order) · dashboard_refund = a refund made by hand in the Stripe dashboard (full → automatic; partial → allocated by an admin from order_tax_reversal_queue) (mig 260).';

-- ── (2) The dashboard-refund allocation queue (owner Q2, 2026-09-24) ───────
CREATE TABLE IF NOT EXISTS public.order_tax_reversal_queue (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID NOT NULL REFERENCES public.orders(id),
  -- The Stripe refund that created the obligation — one queue row per refund.
  stripe_refund_id      TEXT NOT NULL UNIQUE,
  refund_amount_cents   INTEGER NOT NULL CHECK (refund_amount_cents > 0),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Set when an admin has picked the items and the ledger rows were written.
  resolved_at           TIMESTAMPTZ,
  resolved_by           UUID,
  note                  TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_tax_reversal_queue_open
  ON public.order_tax_reversal_queue (created_at)
  WHERE resolved_at IS NULL;

COMMENT ON TABLE public.order_tax_reversal_queue IS
  '"Tax reversal OWED" — a PARTIAL refund made by hand in the Stripe dashboard on a taxed order (charge.refunded webhook: amount known, items unknown). An admin picks the items on the admin list; that pick writes order_item_tax_reversals rows and sets resolved_at. Owner ruling 2026-09-24 (Q2): never a pro-rata guess — a guess would go on the tax return. Service-role only (mig 260).';

-- ── Access: service-role only (mig-249 posture for money data) ─────────────
ALTER TABLE public.order_item_tax_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_tax_reversal_queue ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: with RLS on and no policy, anon/authenticated see
-- nothing through PostgREST even if a privilege slips back. Belt AND braces:
REVOKE ALL ON TABLE public.order_item_tax_reversals FROM anon, authenticated;
REVOKE ALL ON TABLE public.order_tax_reversal_queue FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.order_item_tax_reversals TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.order_tax_reversal_queue TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- POST-CHECK — LIVE: the last statement, so the result pane shows the scoped
-- catalog export for the two new tables. Expect: 10 + 8 COLUMN rows, 3 FK rows,
-- 4 CHECK rows, UNIQUE/PK rows, 5 INDEX rows (incl. 2 pkeys + 1 unique),
-- RLS rows "rls_enabled=true · policies=0" for both, GRANT rows for
-- service_role only (anon/authenticated absent). Paste the whole result back.
-- ============================================================================
SELECT 'COLUMN' AS section,
       (table_name || '.' || column_name)::text AS item,
       (data_type || ' · ' || CASE WHEN is_nullable = 'YES' THEN 'null' ELSE 'not null' END
        || ' · default ' || COALESCE(column_default, '-'))::text AS detail
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('order_item_tax_reversals', 'order_tax_reversal_queue')
UNION ALL
SELECT 'FK', conname::text, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN ('public.order_item_tax_reversals'::regclass, 'public.order_tax_reversal_queue'::regclass)
  AND contype = 'f'
UNION ALL
SELECT 'CHECK', conname::text, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN ('public.order_item_tax_reversals'::regclass, 'public.order_tax_reversal_queue'::regclass)
  AND contype = 'c'
UNION ALL
SELECT 'UNIQUE/PK', conname::text, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN ('public.order_item_tax_reversals'::regclass, 'public.order_tax_reversal_queue'::regclass)
  AND contype IN ('u', 'p')
UNION ALL
SELECT 'INDEX', indexname::text, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('order_item_tax_reversals', 'order_tax_reversal_queue')
UNION ALL
SELECT 'RLS', c.relname::text,
       'rls_enabled=' || c.relrowsecurity::text || ' · policies='
       || (SELECT COUNT(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname)::text
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('order_item_tax_reversals', 'order_tax_reversal_queue')
UNION ALL
SELECT 'GRANT', (table_name || ' → ' || grantee)::text,
       string_agg(privilege_type::text, ',' ORDER BY privilege_type::text)
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('order_item_tax_reversals', 'order_tax_reversal_queue')
  AND grantee IN ('anon', 'authenticated', 'service_role')
GROUP BY table_name, grantee
ORDER BY 1, 2;
