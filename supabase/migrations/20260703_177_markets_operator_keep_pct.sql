-- ============================================================================
-- Migration 177: markets.operator_keep_pct (P6 — RM operator-keep rebate lever)
-- ============================================================================
-- Per-market "operator keep rate": the fraction of the booth/spot BASE price the
-- operator receives. Default 0.935 = current behavior (base − 6.5% operator-side
-- fee). An admin can raise it toward 1.000 to rebate the operator-side fee back
-- (operator keeps up to 100% of base) as a switch/RM incentive. The VENDOR charge
-- is unaffected; only the operator/platform split of the operator-side markdown
-- changes. See apps/web/.claude/ft_p6_operator_keep_plan.md.
--
-- SCOPE (user-locked 2026-07-03): read by the FT PARK-SPOT checkout only
-- (book-park-spot + pay-occurrence routes → pricing.ts). FM booth/season keep the
-- fixed 0.935 for now (backlog: reconcile later). ADMIN-set (not operator).
--
-- ADDITIVE + inert: DEFAULT 0.935 grandfathers every market to current behavior;
-- nothing reads it until the P6 route wiring ships. No money moves on apply.
-- ============================================================================
-- ROLLBACK:
--   ALTER TABLE markets DROP COLUMN IF EXISTS operator_keep_pct;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================================
-- Dependencies: mig 001 (markets).
-- ============================================================================

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS operator_keep_pct NUMERIC(4,3) NOT NULL DEFAULT 0.935
    CHECK (operator_keep_pct BETWEEN 0.935 AND 1.000);

COMMENT ON COLUMN markets.operator_keep_pct IS
  'P6 RM lever: fraction of booth/spot BASE the operator receives. 0.935 = default (base − 6.5%); up to 1.000 = full operator-side rebate (operator keeps 100% of base, platform keeps only the vendor-side markup). Vendor charge unaffected. Read by the FT park-spot checkout (pricing.ts calculateBoothRentalFees). Admin-set.';

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION (run after apply):
-- SELECT column_name, column_default FROM information_schema.columns
--   WHERE table_name='markets' AND column_name='operator_keep_pct';  -- default 0.935
-- SELECT count(*) FROM markets WHERE operator_keep_pct <> 0.935;      -- 0 (all grandfathered)
-- ============================================================================
