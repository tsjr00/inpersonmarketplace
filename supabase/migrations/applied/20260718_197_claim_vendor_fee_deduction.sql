-- Migration 197: claim_vendor_fee_deduction — atomic claim-first fee auto-deduction
--
-- VOR-8 + VOR-9 (pre-re-release review, slice 2 — FINDINGS_LEDGER.md), 2026-07-18:
-- Fee auto-deduction was read-compute-deduct with NO atomic claim, in THREE
-- payout routes (fulfill, buyer-confirm edge, confirm-handoff):
--   1. VOR-8 race: two near-simultaneous payouts for the same vendor both read
--      the same vendor_fee_balance, both withhold the full deduction from their
--      payouts, both insert a credit → ledger over-credited (balance can go
--      negative), vendor under-paid twice for the same debt. The vendor_payouts
--      23505 guard is per-order-item and cannot protect the per-vendor balance.
--   2. VOR-9: the credit was written AFTER the Stripe transfer; a credit-insert
--      failure was swallowed (crumb only) → deduction withheld from the payout
--      but never credited to the ledger → the SAME fee deducted again on the
--      vendor's next payout. buyer-confirm was worse: its transfer-failure path
--      never wrote the credit at all (guaranteed double-deduct after a retry).
--
-- Fix: ONE atomic claim, called BEFORE the payout row is inserted:
--   - serializes per-vendor claimers via FOR UPDATE on the vendor_fee_balance
--     row (a real table, maintained by trigger_update_vendor_fee_balance which
--     recomputes the SUM on every ledger write — mig 003);
--   - grants LEAST(balance, cap) and inserts the ledger credit in the same
--     transaction (the AFTER trigger updates the balance row under our lock);
--   - is REPLAY-SAFE per order item: a credit already claimed for
--     p_order_item_id is returned as-is instead of double-claiming (fulfill
--     retry after a downstream failure, or a concurrent same-item route).
--     Enforced by the new partial unique index (credit-side mirror of mig
--     155's uq_vendor_fee_ledger_debit_item).
--
-- Companion code (same commit): fulfill / buyer-confirm / confirm-handoff swap
-- getVendorFeeBalance + calculateAutoDeductAmount + post-transfer
-- recordFeeCredit for claimVendorFeeDeduction (vendor-fees.ts). Code is
-- pre-migration-safe: if this RPC is missing, the claim errors → the routes
-- deduct 0 and logError — the fee simply stays on the ledger for a later
-- payout (no money misrecorded).
--
-- All existing credit rows have NULL order_item_id (recordFeeCredit never set
-- it), so the new partial unique index cannot collide with existing data.

-- Credit-side idempotency: at most one auto-deduct credit per order item.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_fee_ledger_credit_item
  ON vendor_fee_ledger (order_item_id)
  WHERE type = 'credit' AND order_item_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_vendor_fee_deduction(
  p_vendor_profile_id UUID,
  p_order_id UUID,
  p_order_item_id UUID,
  p_max_deduct_cents INTEGER
) RETURNS INTEGER AS $$
DECLARE
  v_existing INTEGER;
  v_balance INTEGER;
  v_grant INTEGER;
BEGIN
  -- Replay guard: this order item already claimed a credit — return it
  -- unchanged (retry after a downstream failure must not re-deduct).
  SELECT amount_cents INTO v_existing
  FROM vendor_fee_ledger
  WHERE order_item_id = p_order_item_id AND type = 'credit'
  LIMIT 1;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  IF p_max_deduct_cents IS NULL OR p_max_deduct_cents <= 0 THEN
    RETURN 0;
  END IF;

  -- Serialize per-vendor claimers. No balance row = no ledger activity ever =
  -- nothing to deduct.
  SELECT balance_cents INTO v_balance
  FROM vendor_fee_balance
  WHERE vendor_profile_id = p_vendor_profile_id
  FOR UPDATE;

  IF NOT FOUND OR v_balance <= 0 THEN
    RETURN 0;
  END IF;

  v_grant := LEAST(v_balance, p_max_deduct_cents);

  INSERT INTO vendor_fee_ledger
    (vendor_profile_id, order_id, order_item_id, amount_cents, type, description)
  VALUES
    (p_vendor_profile_id, p_order_id, p_order_item_id, v_grant, 'credit',
     'Auto-deducted from Stripe payout')
  ON CONFLICT (order_item_id) WHERE type = 'credit' AND order_item_id IS NOT NULL
  DO NOTHING;

  IF NOT FOUND THEN
    -- Lost a same-item race that committed between the replay guard and our
    -- balance lock — return that claim's grant.
    SELECT amount_cents INTO v_existing
    FROM vendor_fee_ledger
    WHERE order_item_id = p_order_item_id AND type = 'credit'
    LIMIT 1;
    RETURN COALESCE(v_existing, 0);
  END IF;

  RETURN v_grant;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.claim_vendor_fee_deduction IS
  'Atomically claims an auto-deduct fee credit for a payout: locks the vendor''s balance row, grants LEAST(balance, cap), inserts the ledger credit, returns granted cents. Replay-safe per order item (partial unique idx uq_vendor_fee_ledger_credit_item). Called BEFORE the payout insert by fulfill / buyer-confirm / confirm-handoff (VOR-8/VOR-9, mig 197). Service-role only.';

-- New function: lock down per the mig 149/152 discipline (service-role only).
REVOKE EXECUTE ON FUNCTION public.claim_vendor_fee_deduction(UUID, UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_vendor_fee_deduction(UUID, UUID, UUID, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.claim_vendor_fee_deduction(UUID, UUID, UUID, INTEGER);
--   DROP INDEX IF EXISTS uq_vendor_fee_ledger_credit_item;
-- (Companion code degrades safely without the RPC: deduction 0 + logError,
--  fees stay on the ledger.)
