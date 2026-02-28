-- Migration 058: Support tickets table for public contact form
-- Stores support requests from /{vertical}/support page.
-- Public form (no auth required) — service client writes.

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vertical_id TEXT NOT NULL REFERENCES verticals(vertical_id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('technical_problem', 'order_issue', 'account_help', 'feature_request', 'general')),
  message TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in_progress', 'resolved', 'closed')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_support_tickets_vertical ON support_tickets(vertical_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);
CREATE INDEX idx_support_tickets_created ON support_tickets(created_at DESC);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_support_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_support_tickets_updated_at();

-- RLS: admin-only read/update, no public access (service client writes)
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view support tickets"
  ON support_tickets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = (SELECT auth.uid())
        AND (user_profiles.role IN ('admin', 'platform_admin')
             OR 'admin' = ANY(user_profiles.roles)
             OR 'platform_admin' = ANY(user_profiles.roles))
    )
  );

CREATE POLICY "Admin can update support tickets"
  ON support_tickets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = (SELECT auth.uid())
        AND (user_profiles.role IN ('admin', 'platform_admin')
             OR 'admin' = ANY(user_profiles.roles)
             OR 'platform_admin' = ANY(user_profiles.roles))
    )
  );
