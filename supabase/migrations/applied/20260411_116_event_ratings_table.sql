-- Migration 116: Event-general attendee ratings
-- Separate from order_ratings (which rates vendors). This table rates the
-- event experience itself — organizer quality, venue, logistics — not the
-- individual vendors. Visible to the event organizer + platform admin
-- after moderation.
--
-- Author: Session 71
-- Scope: Fix the broken EventFeedbackForm by giving its "How was the event
--        overall?" question a real destination. Vendor ratings from event
--        attendees continue to flow through the existing order_ratings
--        system (unchanged).

CREATE TABLE IF NOT EXISTS event_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catering_request_id uuid NOT NULL REFERENCES catering_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating int2 NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'hidden')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  moderated_at timestamptz,
  moderated_by uuid REFERENCES auth.users(id),

  -- One rating per user per event
  UNIQUE(catering_request_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_ratings_event ON event_ratings(catering_request_id);
CREATE INDEX IF NOT EXISTS idx_event_ratings_user ON event_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_event_ratings_status ON event_ratings(status);

-- Shared updated_at trigger
DROP TRIGGER IF EXISTS update_event_ratings_updated_at ON event_ratings;
CREATE TRIGGER update_event_ratings_updated_at
  BEFORE UPDATE ON event_ratings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE event_ratings ENABLE ROW LEVEL SECURITY;

-- Attendees can insert their own rating for a valid event (active/review/completed)
DROP POLICY IF EXISTS "users_insert_own_event_rating" ON event_ratings;
CREATE POLICY "users_insert_own_event_rating" ON event_ratings
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM catering_requests
      WHERE id = catering_request_id
        AND status IN ('active', 'review', 'completed')
    )
  );

-- Attendees can edit their own rating while it's still pending
DROP POLICY IF EXISTS "users_update_own_event_rating" ON event_ratings;
CREATE POLICY "users_update_own_event_rating" ON event_ratings
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND status = 'pending')
  WITH CHECK (user_id = (SELECT auth.uid()) AND status = 'pending');

-- Attendees can read their own rating (any status)
DROP POLICY IF EXISTS "users_read_own_event_rating" ON event_ratings;
CREATE POLICY "users_read_own_event_rating" ON event_ratings
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Organizer can read approved ratings for their own events
DROP POLICY IF EXISTS "organizer_read_event_ratings" ON event_ratings;
CREATE POLICY "organizer_read_event_ratings" ON event_ratings
  FOR SELECT TO authenticated
  USING (
    status = 'approved'
    AND EXISTS (
      SELECT 1 FROM catering_requests
      WHERE id = event_ratings.catering_request_id
        AND organizer_user_id = (SELECT auth.uid())
    )
  );

-- Platform admin has full access (moderation queue)
DROP POLICY IF EXISTS "admin_all_event_ratings" ON event_ratings;
CREATE POLICY "admin_all_event_ratings" ON event_ratings
  FOR ALL TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

COMMENT ON TABLE event_ratings IS 'Attendee ratings for event experience (not vendor-specific). Separate from order_ratings. Organizer + admin read approved rows after moderation.';
