-- Migration 154: Market Manager Lockout — history audit table + suspend status
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- To revert this migration on any environment, run as a single transaction.
-- WARNING: rollback drops the manager history audit log. If the column has
-- accumulated suspend/restore state changes since apply, those are also lost.
--
--   BEGIN;
--     DROP TABLE IF EXISTS market_manager_history;
--     ALTER TABLE markets DROP COLUMN IF EXISTS manager_status;
--   COMMIT;
--
-- Risk profile:
--   PRE-application: zero data loss; safe.
--   POST-application:
--     - Dropping `market_manager_history` discards audit log of who managed
--       which market and when. Historical data is unrecoverable from prod
--       unless backed up separately.
--     - Dropping `markets.manager_status` removes the active/suspended flag.
--       Existing rows lose state — code that reads it must default to 'active'.
--
-- =============================================================================
-- WHY THIS MIGRATION EXISTS
-- =============================================================================
-- Session 87 audit identified the manager turnover threat: an outgoing manager
-- could self-serve compile reports + extract data before losing dashboard
-- access. Session 88 plan (manager_export_and_lockout_plan.md) addresses this
-- with a layered defense:
--
--   Layer 1: Dashboard lockout — manager_user_id changes immediately revoke
--            access; suspended flag pauses access without reassignment.
--   Layer 2: Export request flow — all exports admin-approved (Phase 2-3,
--            future migration).
--
-- This migration is Phase 1 foundation:
--   - Audit table tracks every manager assignment + removal + reason
--   - Suspend flag enables non-destructive pause
--   - Backfill captures current state as history baseline
--
-- Code changes (separate commits, same session):
--   - Server-side route guards on /[vertical]/market-manager/[marketId]/*
--   - /access-removed and /access-suspended landing pages
--   - Admin reassign / suspend / restore UI + PATCH route
--   - 3 notification templates: manager_access_removed/_suspended/_restored
--
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Audit table: market_manager_history
-- ----------------------------------------------------------------------------
-- Append-only log of who managed which market and when. One row per
-- assignment period. `ended_at IS NULL` means currently active.
-- Partial unique index enforces at-most-one active row per market.

CREATE TABLE IF NOT EXISTS market_manager_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  manager_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  manager_email_snapshot TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ended_at TIMESTAMPTZ NULL,
  ended_by_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  end_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ended_at IS NULL OR ended_at >= assigned_at)
);

COMMENT ON TABLE market_manager_history IS
  'Append-only audit log of market manager assignments. One row per assignment period; ended_at IS NULL = currently active. At most one active row per market (enforced by partial unique index).';

COMMENT ON COLUMN market_manager_history.manager_email_snapshot IS
  'Email at time of assignment. Preserves identity even if user account is deleted or email changes later.';

COMMENT ON COLUMN market_manager_history.assigned_by_user_id IS
  'Admin who performed the assignment. NULL for backfill rows (no admin actor known) and for self-assignment flows.';

COMMENT ON COLUMN market_manager_history.end_reason IS
  'Free-text admin note explaining removal: turnover, resignation, conflict, etc. NULL for backfilled active rows.';

-- ----------------------------------------------------------------------------
-- 2. Indexes
-- ----------------------------------------------------------------------------

-- Primary query: load history for a market (manager admin page)
CREATE INDEX IF NOT EXISTS idx_market_manager_history_market_assigned
  ON market_manager_history(market_id, assigned_at DESC);

-- At most one active assignment per market — enforced via partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS uq_market_manager_history_active
  ON market_manager_history(market_id)
  WHERE ended_at IS NULL;

-- Audit query: find all markets a user has managed
CREATE INDEX IF NOT EXISTS idx_market_manager_history_user
  ON market_manager_history(manager_user_id, assigned_at DESC)
  WHERE manager_user_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. RLS — default-deny, service-client-only access (matches mig 137 pattern)
-- ----------------------------------------------------------------------------

ALTER TABLE market_manager_history ENABLE ROW LEVEL SECURITY;
-- No policies added. Service client bypasses RLS; anon + authenticated blocked
-- from direct reads. All access via API routes that enforce auth upstream.

-- ----------------------------------------------------------------------------
-- 4. markets.manager_status — pause without reassignment
-- ----------------------------------------------------------------------------
-- 'active' (default): normal operation
-- 'suspended':        manager retains identity but dashboard locks down,
--                     shows /access-suspended landing page
--
-- Note: not adding 'removed' status — when admin removes a manager,
-- markets.manager_user_id is set NULL or to a new user. There's no
-- separate "removed" status because the absence of a manager IS the state.

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS manager_status TEXT NOT NULL DEFAULT 'active'
    CHECK (manager_status IN ('active', 'suspended'));

COMMENT ON COLUMN markets.manager_status IS
  'Active = manager has full dashboard access. Suspended = paused pending review; manager sees /access-suspended page. Independent of manager_user_id; suspending does not unassign.';

-- ----------------------------------------------------------------------------
-- 5. Backfill: seed history rows from current markets.manager_user_id
-- ----------------------------------------------------------------------------
-- For each market with a current manager, insert one active history row
-- using best-available assignment data. assigned_by_user_id is NULL
-- (no admin actor known for pre-history assignments).
--
-- Uses INSERT ... SELECT ... ON CONFLICT DO NOTHING so the migration is
-- idempotent: re-running on an already-backfilled env is a no-op.
-- The active partial unique index protects against duplicate active rows.

INSERT INTO market_manager_history (
  market_id,
  manager_user_id,
  manager_email_snapshot,
  assigned_at,
  assigned_by_user_id,
  ended_at,
  end_reason
)
SELECT
  m.id,
  m.manager_user_id,
  COALESCE(m.manager_email, ''),
  COALESCE(m.manager_invited_at, m.created_at, NOW()),
  NULL,  -- no admin actor known for historical assignments
  NULL,  -- currently active
  NULL
FROM markets m
WHERE m.manager_user_id IS NOT NULL
  AND NOT EXISTS (
    -- Skip if an active history row already exists for this market
    SELECT 1
    FROM market_manager_history h
    WHERE h.market_id = m.id
      AND h.ended_at IS NULL
  );

-- ----------------------------------------------------------------------------
-- 6. Schema cache reload
-- ----------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION (run AFTER the migration. Expect non-zero on populated envs.)
-- ============================================================================
-- After apply, confirm:
--   1. market_manager_history table exists with expected columns
--   2. markets.manager_status column exists with default 'active'
--   3. Backfill seeded at least one row per market with a current manager
--
-- Sample queries (paste into SQL editor; expected results in comments):
--
--   -- (a) Table exists, RLS enabled
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'market_manager_history';
--   -- expected: 1 row, relrowsecurity = true
--
--   -- (b) Column exists with default
--   SELECT column_name, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'markets' AND column_name = 'manager_status';
--   -- expected: column_default = ''active''::text, is_nullable = NO
--
--   -- (c) Backfill: count of active history rows should match count of markets with managers
--   SELECT
--     (SELECT COUNT(*) FROM markets WHERE manager_user_id IS NOT NULL) AS markets_with_managers,
--     (SELECT COUNT(*) FROM market_manager_history WHERE ended_at IS NULL) AS active_history_rows;
--   -- expected: both counts equal (assuming backfill ran fresh)
--
--   -- (d) Partial unique index enforces at-most-one active per market
--   SELECT market_id, COUNT(*) AS active_count
--   FROM market_manager_history WHERE ended_at IS NULL
--   GROUP BY market_id HAVING COUNT(*) > 1;
--   -- expected: zero rows (if any rows return, manual cleanup needed before code ships)
