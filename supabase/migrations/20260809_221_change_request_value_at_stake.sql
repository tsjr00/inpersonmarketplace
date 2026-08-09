-- ============================================================================
-- Migration 221: record the MONEY at stake on a change request, not just a count
-- Date: 2026-08-09
-- ============================================================================
-- WHY
--
-- Owner, 2026-08-09: "the admin should see how much is at stake — if they need
-- to be involved then we want to give them the info needed to communicate with
-- the organizer and make decisions."
--
-- Mig 220 stored `preorder_count_at_request`. A count does not tell an admin
-- whether they are deciding about $80 or $4,000, and those are different
-- conversations with the organizer. It is also the number that justifies our
-- being in the loop at all: a person reviews these BECAUSE money moves, so the
-- amount is the substance of the decision rather than a nice-to-have.
--
-- Stored as a SNAPSHOT alongside the count, for the same reason: recomputed at
-- review time it would be a different figure (orders keep arriving), and the
-- admin should be able to see what the organizer was actually told when they
-- asked. The admin queue additionally computes the CURRENT figure live, so a
-- material drift between the two is visible rather than silent.
--
-- ADDITIVE: one nullable-with-default column. No backfill needed — mig 220 was
-- applied hours ago and the table is empty; any pre-existing row would simply
-- read 0, which is honest for a request raised before we measured this.
-- ============================================================================

-- ── PRE-CHECK ──
--
--   SELECT count(*) FROM event_change_requests;   -- expect 0
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'event_change_requests'
--      AND column_name = 'preorder_value_cents_at_request';   -- expect 0 rows

BEGIN;

ALTER TABLE public.event_change_requests
  ADD COLUMN IF NOT EXISTS preorder_value_cents_at_request integer NOT NULL DEFAULT 0;

-- Cents, never negative. Mirrors the count's constraint.
ALTER TABLE public.event_change_requests
  DROP CONSTRAINT IF EXISTS ck_ecr_value_non_negative;
ALTER TABLE public.event_change_requests
  ADD CONSTRAINT ck_ecr_value_non_negative
  CHECK (preorder_value_cents_at_request >= 0);

COMMENT ON COLUMN public.event_change_requests.preorder_value_cents_at_request IS
  'Money at stake when the request was raised, in cents — the sum of non-cancelled, non-refunded order_items at the event''s market. Snapshot, like preorder_count_at_request: the admin judges what the organizer was told, and the queue computes the current figure live alongside it.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── POST-APPLY VERIFICATION ──
--
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_name = 'event_change_requests'
--      AND column_name = 'preorder_value_cents_at_request';
--   -- expect: integer, NO, 0
--
-- ── ROLLBACK ──
--
--   ALTER TABLE public.event_change_requests
--     DROP CONSTRAINT IF EXISTS ck_ecr_value_non_negative;
--   ALTER TABLE public.event_change_requests
--     DROP COLUMN IF EXISTS preorder_value_cents_at_request;
--   NOTIFY pgrst, 'reload schema';
