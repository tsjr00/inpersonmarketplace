-- Migration 190: Re-add 'cancelled' to the catering_requests status CHECK
--
-- EVT-3 (pre-re-release review, slice 5 — FINDINGS_LEDGER.md):
-- Migration 094 dropped and recreated catering_requests_status_check to add
-- the lifecycle statuses (ready/active/review), but the new list omitted
-- 'cancelled' (present in the original mig 070 constraint). Since then, BOTH
-- event-cancel flows — the organizer route (api/events/[token]/cancel) and
-- the admin route (api/admin/events/[id] PATCH status='cancelled') — have
-- failed with a CHECK violation before any cleanup ran: no notifications,
-- no order cancellation, no wave freeing, no market deactivation. The
-- mig-121 trigger cleanup_cancelled_event() has an explicit 'cancelled'
-- branch that has been unreachable the whole time.
--
-- This migration restores 'cancelled' to the allowed set. It ships together
-- with the EVT-4 code batch (refund + session-expire + item cancellation in
-- both cancel routes) — re-enabling cancellation without EVT-4 would activate
-- a flow that cancels paid orders without refunding them.
--
-- Pre-verified: no rows can violate the new constraint (it is strictly wider
-- than the old one).

ALTER TABLE catering_requests DROP CONSTRAINT IF EXISTS catering_requests_status_check;
ALTER TABLE catering_requests ADD CONSTRAINT catering_requests_status_check
  CHECK (status IN ('new', 'reviewing', 'approved', 'declined', 'ready', 'active', 'review', 'completed', 'cancelled'));

NOTIFY pgrst, 'reload schema';

-- ROLLBACK (restores the mig-094 constraint — re-breaks event cancellation):
-- ALTER TABLE catering_requests DROP CONSTRAINT IF EXISTS catering_requests_status_check;
-- ALTER TABLE catering_requests ADD CONSTRAINT catering_requests_status_check
--   CHECK (status IN ('new', 'reviewing', 'approved', 'declined', 'ready', 'active', 'review', 'completed'));
