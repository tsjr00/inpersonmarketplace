-- Add event_token column to catering_requests for shareable event page URLs
-- Token is generated when event is approved, used as /events/{token} URL

ALTER TABLE catering_requests
  ADD COLUMN IF NOT EXISTS event_token TEXT UNIQUE;

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_catering_requests_event_token
  ON catering_requests (event_token)
  WHERE event_token IS NOT NULL;

-- RLS: allow anonymous SELECT by token (public event pages)
CREATE POLICY IF NOT EXISTS "public_event_token_read"
  ON catering_requests
  FOR SELECT
  TO anon, authenticated
  USING (event_token IS NOT NULL AND status IN ('approved', 'completed'));

NOTIFY pgrst, 'reload schema';
