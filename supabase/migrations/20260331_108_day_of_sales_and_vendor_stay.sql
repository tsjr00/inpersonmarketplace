-- ============================================================================
-- Migration 108: Day-of event sales flag + vendor stay policy
-- ============================================================================
-- Enables same-day ordering at events and captures organizer preference
-- for whether vendors must stay the full event.
--
-- event_allow_day_of_orders: When true, the SQL pickup dates function
-- switches cutoff to 0 on event day (accepting until event ends).
-- Admin sets this at event creation — no action needed on event day.
--
-- vendor_stay_policy: Organizer preference disclosed on vendor invitation.
-- ============================================================================

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS event_allow_day_of_orders BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE catering_requests
  ADD COLUMN IF NOT EXISTS vendor_stay_policy TEXT;

COMMENT ON COLUMN markets.event_allow_day_of_orders IS
  'When true AND local_today >= event_start_date, cutoff switches to 0 '
  '(accepting orders until event ends). Admin/self-service sets at creation. '
  'No admin action needed on event day — date-driven in SQL function.';

COMMENT ON COLUMN catering_requests.vendor_stay_policy IS
  'Organizer preference for vendor departure. Disclosed on vendor invitation. '
  'Values: may_leave_when_sold_out | stay_full_event | vendor_discretion';

NOTIFY pgrst, 'reload schema';
