-- Migration 209: operator acknowledgment of platform agreement clauses
--
-- Tester finding F6 (2026-07-24, owner-approved): every market/park agreement
-- now includes fixed platform clauses. The operator SEES the truck-facing
-- clauses (read-only, can't uncheck) and must ACKNOWLEDGE their own
-- compliance-monitoring commitment with a checkbox before they can save the
-- agreement section (lib/markets/platform-agreement-clauses.ts).
--
-- ADDITIVE. Two nullable/defaulted columns on markets:
--   operator_platform_ack     BOOLEAN — true once the operator acknowledges.
--   operator_platform_ack_at  TIMESTAMPTZ — when (audit trail).
--
-- Companion code (same commit, PRE-MIGRATION SAFE): the platform-ack GET/PATCH
-- route + OptinManager read/write these columns through a tolerant select
-- (missing column -> not-acknowledged), so the agreement editor renders even
-- before this migration applies.

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS operator_platform_ack BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS operator_platform_ack_at TIMESTAMPTZ;

COMMENT ON COLUMN markets.operator_platform_ack IS
  'Operator has acknowledged the platform compliance-monitoring clause included in every agreement (F6, mig 209). FALSE = not yet acknowledged.';
COMMENT ON COLUMN markets.operator_platform_ack_at IS
  'Timestamp of the operator''s platform-clause acknowledgment (mig 209). NULL = never.';

NOTIFY pgrst, 'reload schema';

-- ROLLBACK:
-- ALTER TABLE markets DROP COLUMN IF EXISTS operator_platform_ack;
-- ALTER TABLE markets DROP COLUMN IF EXISTS operator_platform_ack_at;
