-- ============================================================================
-- Migration 220: event change requests — the override behind the hard block
-- Date: 2026-08-09
-- ============================================================================
-- WHY
--
-- An organizer inside the change block is refused: their event is close enough
-- that attendees could not answer a re-confirmation in time. Refusing without a
-- way out would be the address deadlock in a different costume — a state with
-- no exit — so the refusal routes to an admin instead.
--
-- A ROW, NOT AN EMAIL. Three things need it: the admin needs a queue they
-- cannot lose, the organizer needs to see where their request stands instead of
-- wondering, and the organizer score (backlogged) needs a history of who does
-- this and how often. An email satisfies none of those.
--
-- OWNER DECISIONS ENCODED HERE (2026-08-09)
--
--   · The admin is ALWAYS in the loop. An earlier proposal auto-approved
--     self-declared emergencies on the strength of attribution alone; rejected.
--   · A free-text explanation is REQUIRED on every reason, not just "other" —
--     the category is for us, the sentence is what vendors read.
--   · The vendor notification carries the organizer's own words, attributed:
--     "the organizer has reported an emergency of… <their explanation>", so
--     vendors know the change came from the organizer and not from us.
--   · Pre-orders: the ADMIN DECIDES CASE BY CASE. No automatic rule — by the
--     time a request reaches here a human is already involved, and the
--     situations that get this far are exactly the ones a rule gets wrong.
--   · A DECLINE REQUIRES A REASON. A silent refusal 48 hours before someone's
--     event is how you lose a customer permanently. Enforced by CHECK, not by
--     convention.
--   · An admin may EDIT the requested change before approving on ADMIN-ASSISTED
--     events only. On self-service they approve or decline what was asked.
--     `applied_changes` therefore exists separately from `requested_changes`.
--
-- ADDITIVE: one table, no changes to anything existing.
-- ============================================================================

-- ── PRE-CHECK (expect 0 rows; the table should not already exist) ──
--
--   SELECT to_regclass('public.event_change_requests');

BEGIN;

CREATE TABLE IF NOT EXISTS public.event_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  catering_request_id uuid NOT NULL
    REFERENCES public.catering_requests(id) ON DELETE CASCADE,

  -- SET NULL not CASCADE: if the organizer's account is deleted the request is
  -- still part of the event's history, and an admin may be mid-review.
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  reason_category text NOT NULL CHECK (reason_category IN (
    'venue_cancelled',
    'weather_safety',
    'personal_emergency',
    'venue_scheduling_conflict',
    'wrong_date_booked',
    'other'
  )),

  -- Required on EVERY category. Length-bounded because it is emailed verbatim
  -- to vendors; the application also runs it through the same moderation as
  -- intake before it is stored.
  explanation text NOT NULL CHECK (
    length(btrim(explanation)) BETWEEN 10 AND 1000
  ),

  -- What they asked for. Restricted by the application to the three fields the
  -- block actually covers (event_date, address, event_start_time/end_time), so
  -- this stays validatable rather than an arbitrary blob.
  requested_changes jsonb NOT NULL,

  -- Snapshot of what the change cost AT THE MOMENT OF ASKING. Recomputing later
  -- would give a different answer (orders keep arriving), and the admin needs to
  -- judge the request as it stood, not as it drifted.
  preorder_count_at_request integer NOT NULL DEFAULT 0
    CHECK (preorder_count_at_request >= 0),

  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'declined', 'withdrawn', 'expired'
  )),

  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,

  -- Mandatory on a decline. See the CHECK below.
  review_note text,

  -- What was ACTUALLY applied. Differs from requested_changes only when an
  -- admin edited it, which is permitted on admin-assisted events only.
  applied_changes jsonb,

  -- The admin's per-case call on existing pre-orders (owner: case by case).
  order_action text CHECK (order_action IS NULL OR order_action IN (
    'refund_all',
    'keep_all',
    'handled_manually'
  )),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- A decline without a reason is not a decline we are willing to send.
  CONSTRAINT ck_ecr_decline_needs_reason CHECK (
    status <> 'declined'
    OR (review_note IS NOT NULL AND length(btrim(review_note)) > 0)
  ),

  -- A resolved request must say who resolved it and when. Prevents a row that
  -- claims to be approved with nobody accountable for it.
  CONSTRAINT ck_ecr_resolved_has_reviewer CHECK (
    status NOT IN ('approved', 'declined')
    OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

-- One open request per event. Without this an organizer refreshing an error
-- page produces a queue of duplicates and the admin cannot tell which is live.
-- Partial, so the history of resolved requests is unlimited.
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_change_requests_one_pending
  ON public.event_change_requests (catering_request_id)
  WHERE status = 'pending';

-- The admin queue: oldest pending first, because these are time-critical.
CREATE INDEX IF NOT EXISTS idx_event_change_requests_pending
  ON public.event_change_requests (created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_event_change_requests_event
  ON public.event_change_requests (catering_request_id, created_at DESC);

-- Shared updated_at trigger, same as mig 116's event_ratings.
DROP TRIGGER IF EXISTS update_event_change_requests_updated_at
  ON public.event_change_requests;
CREATE TRIGGER update_event_change_requests_updated_at
  BEFORE UPDATE ON public.event_change_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS on with NO policies: every read and write goes through an API route using
-- the service client, which bypasses RLS. Same posture as event_company_payments.
-- Enabling it without policies means a leaked anon key still reads nothing.
ALTER TABLE public.event_change_requests ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.event_change_requests IS
  'Organizer requests to change a locked event (mig 220). Raised when the hard change block refuses an edit; an admin always reviews. Declines require a reason; the explanation is emailed to vendors verbatim and attributed to the organizer.';
COMMENT ON COLUMN public.event_change_requests.preorder_count_at_request IS
  'Pre-order count when the request was raised — judged as it stood, not as it drifted.';
COMMENT ON COLUMN public.event_change_requests.applied_changes IS
  'What was actually applied. Differs from requested_changes only when an admin edited it, which is allowed on admin-assisted events only.';
COMMENT ON COLUMN public.event_change_requests.order_action IS
  'Admin per-case decision on existing pre-orders. Deliberately no default rule.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── POST-APPLY VERIFICATION ──
--
--   SELECT to_regclass('public.event_change_requests');            -- not null
--   SELECT count(*) FROM pg_indexes
--    WHERE tablename = 'event_change_requests';                    -- expect 4
--   SELECT relrowsecurity FROM pg_class
--    WHERE oid = 'public.event_change_requests'::regclass;         -- expect true
--
-- Constraint smoke tests (each should RAISE):
--   INSERT INTO event_change_requests (catering_request_id, reason_category, explanation, requested_changes, status, reviewed_by, reviewed_at)
--     VALUES (gen_random_uuid(), 'other', 'too short'::text, '{}'::jsonb, 'declined', gen_random_uuid(), now());
--     -- fails: FK + decline-needs-reason
--
-- ── ROLLBACK ──
--
--   DROP TABLE IF EXISTS public.event_change_requests;
--   NOTIFY pgrst, 'reload schema';
