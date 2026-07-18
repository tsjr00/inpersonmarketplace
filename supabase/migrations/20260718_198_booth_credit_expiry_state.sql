-- Migration 198: get_booth_credit_expiry_state — SQL aggregate for the Phase 19
-- booth-credit expiry sweep (CRN-16, pre-re-release review, FINDINGS_LEDGER.md)
--
-- Phase 19 of cron/expire-orders fetched the ENTIRE booth_credits ledger every
-- day and grouped/summed it in JS — unbounded growth (the ledger only ever
-- gains rows; every grant, redemption, release, and expiry is a new row).
-- This RPC pushes the aggregation into SQL and returns one row per
-- (vendor, market) with a positive balance; the cron keeps the decision logic
-- (expire vs warn) on that small result set.
--
-- Semantics are an EXACT mirror of the JS being replaced (expire-orders
-- Phase 19, mirrored from mig 169's design):
--   - balance = SUM(amount_cents)  (the boothCreditBalance business rule)
--   - only groups with balance > 0 matter
--   - "grant" rows = amount_cents > 0 AND source NOT IN ('redeemed','expired')
--   - a group with NO grant rows, or ANY grant row with NULL or future
--     expires_at, has a live grant (generous v1 — NULL keeps the whole
--     balance alive)
--   - nearest_live_grant_expiry = MIN future grant expiry (NULLs excluded) —
--     drives the 14-day warning window
--
-- Companion code (same batch, PRE-MIGRATION SAFE): Phase 19 calls this RPC;
-- if it errors (migration not applied), the phase logs and SKIPS — credits
-- expire a day late, no money misrecorded. The full-table fetch is deleted.

CREATE OR REPLACE FUNCTION public.get_booth_credit_expiry_state()
RETURNS TABLE(
  vendor_profile_id UUID,
  market_id UUID,
  balance_cents BIGINT,
  has_live_grant BOOLEAN,
  nearest_live_grant_expiry TIMESTAMPTZ
) AS $$
  SELECT
    bc.vendor_profile_id,
    bc.market_id,
    SUM(bc.amount_cents) AS balance_cents,
    (
      COUNT(*) FILTER (
        WHERE bc.amount_cents > 0 AND bc.source NOT IN ('redeemed', 'expired')
      ) = 0
      OR bool_or(
        bc.amount_cents > 0 AND bc.source NOT IN ('redeemed', 'expired')
        AND (bc.expires_at IS NULL OR bc.expires_at >= NOW())
      )
    ) AS has_live_grant,
    MIN(bc.expires_at) FILTER (
      WHERE bc.amount_cents > 0 AND bc.source NOT IN ('redeemed', 'expired')
        AND bc.expires_at IS NOT NULL AND bc.expires_at >= NOW()
    ) AS nearest_live_grant_expiry
  FROM booth_credits bc
  GROUP BY bc.vendor_profile_id, bc.market_id
  HAVING SUM(bc.amount_cents) > 0
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.get_booth_credit_expiry_state IS
  'Per (vendor, market) booth-credit expiry state for the daily Phase 19 sweep: positive balances only, with has_live_grant (any non-redeemed/expired positive row with NULL/future expires_at — or no grant rows at all) and the nearest future grant expiry for the 14-day warning. Exact SQL mirror of the JS it replaced (CRN-16, mig 198). Service-role only.';

-- New function: lock down per the mig 149/152 discipline (service-role only).
REVOKE EXECUTE ON FUNCTION public.get_booth_credit_expiry_state() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_booth_credit_expiry_state() TO service_role;

NOTIFY pgrst, 'reload schema';

-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.get_booth_credit_expiry_state();
-- (Companion code degrades safely without the RPC: Phase 19 logs + skips.)
