-- ============================================================================
-- Pre-check: OPTIONAL — idempotent DDL (DROP CONSTRAINT IF EXISTS + ADD); safe
--    to paste the whole file as-is and safe to run twice. The commented
--    pre-check below is there only if you want to look first. The POST-CHECK
--    at the end is LIVE and returns the applied constraint in the result pane.
--    Prod order: 252 → 253 → 254 → 255 → 256 → 257 → 258 → 259 (no dependency
--    on 252–258; it only touches a mig-214 constraint, so it can also run alone).
-- ============================================================================
-- Migration 259: order_items.tax_source — allow 'self_computed_v1'
--                (tax build step 1, plan apps/web/.claude/tax_build_review_research.md;
--                owner 2026-09-24: "if we are ready to build the migration for tax
--                then it should get the next number in line")
-- ============================================================================
-- WHAT WAS WRONG (research file, finding C-addendum — Confirmed on live Dev/
-- Staging/Prod by the mig-214 text, which is applied to all three)
--   mig 214 created the per-item tax snapshot columns with
--     CHECK (tax_source IS NULL OR tax_source IN ('none','manual','stripe'))
--   — written when the plan was still "Stripe calculates". The mechanism the
--   owner ratified on 2026-09-07 (Option A′: WE compute from the market's stored
--   jurisdictions) was wired into checkout on 2026-09-08 and writes
--     tax_source = 'self_computed_v1'      (apps/web/src/app/api/checkout/session/route.ts:1156)
--   The write only happens while TAX_STREAM1_ENABLED is true (lib/tax/flags.ts),
--   which it is not, so today nothing fails. The day the flag flips, EVERY
--   taxable checkout's order_items INSERT would violate this CHECK (SQLSTATE
--   23514) — the buyer would be told checkout failed after the tax line was
--   already shown. This migration closes that gap before the flag ever moves.
--
-- WHAT THIS DOES
--   (1) Replaces the CHECK so 'self_computed_v1' is a legal value. The three
--       original values stay legal (no existing row is affected; there are none).
--   (2) Updates the column comment to describe the four values honestly.
--   NOT changed: any other column, index, function, RLS, or the flag.
--
-- WHY A VERSIONED VALUE
--   'self_computed_v1' names the ENGINE + BASE POLICY that produced the row
--   (checkout-tax.ts: Q11 base = net + embedded buyer % fee share; Q8 bundle
--   margin folded into taxable components; Q10 market boxes excluded). If the
--   CPA changes the base policy, the next engine writes _v2 and the filing
--   report can tell mixed-vintage months apart. That is the same reason
--   tax_rate_version exists (mig 214).
--
-- ROLLBACK (single transaction; safe only while no row carries 'self_computed_v1'):
--   BEGIN;
--     ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_tax_source_check;
--     ALTER TABLE public.order_items ADD CONSTRAINT order_items_tax_source_check
--       CHECK (tax_source IS NULL OR tax_source IN ('none','manual','stripe'));
--   COMMIT;
--
-- Dependencies: mig 214 (the columns + the constraint being replaced). Nothing else.
--
-- ============================================================================
-- PRE-CHECK (read-only; run on the target env first)
-- ============================================================================
-- 1. The constraint must exist with the mig-214 text (expect exactly ONE row,
--    definition containing 'none', 'manual', 'stripe' and NOT 'self_computed_v1'):
--   SELECT conname, pg_get_constraintdef(oid) AS definition
--   FROM pg_constraint
--   WHERE conrelid = 'public.order_items'::regclass
--     AND conname = 'order_items_tax_source_check';
-- 2. Nothing has written the column yet (expect 0 — the stream is dark):
--   SELECT COUNT(*) AS rows_with_tax_source FROM public.order_items WHERE tax_source IS NOT NULL;
-- If (1) returns 0 rows: mig 214 is not applied here — STOP. If (1) already
-- contains 'self_computed_v1': this migration already ran here — STOP.
-- ============================================================================

BEGIN;

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_tax_source_check;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_tax_source_check
  CHECK (tax_source IS NULL OR tax_source IN ('none', 'manual', 'stripe', 'self_computed_v1'));

COMMENT ON COLUMN public.order_items.tax_source IS
  'Where the figure came from: none (no tax collected) | manual (an admin-entered figure) | stripe (a Stripe Tax calculation) | self_computed_v1 (our own engine, lib/tax/checkout-tax.ts, from the market''s stored jurisdictions — the mechanism ratified 2026-09-07; the version names the engine + base policy). Lets the filing report tell mixed-vintage data apart (mig 214, extended by mig 259).';

COMMIT;

-- ============================================================================
-- POST-CHECK — LIVE: this SELECT runs as the last statement of the paste, so
-- the editor's result pane shows the applied constraint. Expect ONE row whose
-- definition contains all four values, including 'self_computed_v1'. Paste
-- that definition text back so the snapshot's CHECK-constraint row is updated
-- from a MEASURED value, not from this file.
-- ============================================================================
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.order_items'::regclass
  AND conname = 'order_items_tax_source_check';
