-- Migration 143: replace_market_optin_selections — atomic optin save
--
-- =============================================================================
-- !!! POST-PROD-APPLICATION REMINDER (added 2026-05-31, mig 149 session) !!!
-- =============================================================================
-- When this migration is applied to PROD, it CREATEs the
-- `replace_market_optin_selections(uuid, jsonb)` function with the default
-- Postgres EXECUTE grant — which includes the `anon` role. That re-opens a
-- security hole that Migration 149 closed on Dev/Staging on 2026-05-31
-- (Supabase advisor flagged it as SECURITY DEFINER callable by anon via
-- /rest/v1/rpc/replace_market_optin_selections).
--
-- AFTER applying this migration to Prod, run (in the same session):
--
--   REVOKE EXECUTE ON FUNCTION
--     public.replace_market_optin_selections(uuid, jsonb)
--   FROM anon;
--
-- Or just re-run the full Migration 149 — REVOKE is idempotent on
-- already-revoked grants. File:
--   supabase/migrations/20260531_149_revoke_anon_from_financial_rpcs.sql
-- (or supabase/migrations/applied/ if 149 has been moved by then).
--
-- Claude review note: surface this reminder to the user before they push
-- migs 138-148 to prod. Don't let the prod application happen without the
-- follow-up REVOKE in the same session.
-- =============================================================================
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- To revert this migration on any environment, run:
--
--   BEGIN;
--   DROP FUNCTION IF EXISTS replace_market_optin_selections(uuid, jsonb);
--   COMMIT;
--
-- Risk profile:
--   PRE-application or DEV-only: zero data loss; safe.
--   POST-application: rollback re-introduces the delete-then-insert
--     non-atomic pair in the PUT route. Mid-save failures (network blip,
--     browser close, server crash) can leave the market with zero
--     selections, triggering a stale-agreement prompt for every existing
--     vendor at that market the next time they check agreement-status.
--
-- Dependencies: mig 136 (market_optin_selections + catalog tables).
-- =============================================================================
--
-- Replaces the sequential .delete()+.insert() pair in the PUT
-- /api/market-manager/[marketId]/optin/selections route with a single
-- PL/pgSQL function. Both operations live in one transaction — either
-- everything saves or the prior state is preserved.
--
-- Catalog validation (statement_ids must exist + be active) remains in
-- the route layer; this function trusts pre-validated inputs.

CREATE OR REPLACE FUNCTION replace_market_optin_selections(
  p_market_id UUID,
  p_selections JSONB
)
RETURNS TABLE (
  selection_id UUID,
  selection_market_id UUID,
  selection_statement_id TEXT,
  selection_placeholder_values JSONB,
  selection_selected_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate input shape — must be a JSON array.
  IF p_selections IS NULL OR jsonb_typeof(p_selections) <> 'array' THEN
    RAISE EXCEPTION 'p_selections must be a JSONB array' USING ERRCODE = 'P0001';
  END IF;

  -- Replace: delete all existing selections, then insert new set in the
  -- same transaction. PL/pgSQL function bodies are implicitly transactional
  -- when called from a single SQL statement (via .rpc() this is the case).
  -- Failure of either op rolls back the other.
  DELETE FROM market_optin_selections mos
    WHERE mos.market_id = p_market_id;

  -- Empty array → caller wanted to clear all selections. Skip insert.
  IF jsonb_array_length(p_selections) > 0 THEN
    INSERT INTO market_optin_selections (
      market_id,
      statement_id,
      placeholder_values
    )
    SELECT
      p_market_id,
      (elem->>'statement_id')::TEXT,
      COALESCE(elem->'placeholder_values', '{}'::jsonb)
    FROM jsonb_array_elements(p_selections) AS elem
    WHERE elem->>'statement_id' IS NOT NULL;
  END IF;

  RETURN QUERY
    SELECT mos.id, mos.market_id, mos.statement_id, mos.placeholder_values, mos.selected_at
      FROM market_optin_selections mos
      WHERE mos.market_id = p_market_id
      ORDER BY mos.selected_at ASC;
END;
$$;

COMMENT ON FUNCTION replace_market_optin_selections IS
  'Atomically replaces all opt-in statement selections for a market in a single transaction. Caller: PUT /api/market-manager/[marketId]/optin/selections route — it pre-validates statement_ids against the active catalog and passes the cleaned array as p_selections. SECURITY DEFINER so service_role can invoke under RLS default-deny.';

NOTIFY pgrst, 'reload schema';
