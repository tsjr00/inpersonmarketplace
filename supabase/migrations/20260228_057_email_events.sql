-- Migration 057: Email events table for Resend webhook tracking
-- Stores bounces, complaints, and delivery delays from Resend webhooks.
-- Deliveries are not stored (too much volume) — only problematic events.

CREATE TABLE IF NOT EXISTS email_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  resend_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  email_to TEXT NOT NULL,
  email_from TEXT,
  subject TEXT,
  bounce_type TEXT,
  error_message TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_email_events_type ON email_events(event_type);
CREATE INDEX idx_email_events_email ON email_events(email_to);
CREATE INDEX idx_email_events_created ON email_events(created_at DESC);

-- RLS: admin-only read, no public access (service client writes)
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view email events"
  ON email_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = (SELECT auth.uid())
        AND (user_profiles.role IN ('admin', 'platform_admin')
             OR 'admin' = ANY(user_profiles.roles)
             OR 'platform_admin' = ANY(user_profiles.roles))
    )
  );
