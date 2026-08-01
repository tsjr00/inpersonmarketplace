-- ============================================================================
-- Migration 185: catering_requests.address_reminder_sent_at
-- ============================================================================
-- G5 fix (events gap): a self-service event submitted with NO address stays in
-- status='new' with no recovery. Part B adds a daily cron nudge that re-emails
-- the organizer to add their address. This column dedups that nudge so it fires
-- once, not every cron run. Mirrors the existing `selection_email_sent_at`
-- dedup-timestamp pattern (mig 123).
--
-- ADDITIVE, nullable. NULL = not yet nudged.
-- ============================================================================
-- Dependencies: catering_requests (mig 070).
-- ROLLBACK: ALTER TABLE catering_requests DROP COLUMN IF EXISTS address_reminder_sent_at;
-- ============================================================================
ALTER TABLE catering_requests
  ADD COLUMN IF NOT EXISTS address_reminder_sent_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN catering_requests.address_reminder_sent_at IS
  'When the "add your event address" reminder was emailed to a self-service organizer whose event is stuck in status=new with no address (G5). Dedups the expire-orders nudge. NULL = not yet sent.';

NOTIFY pgrst, 'reload schema';
