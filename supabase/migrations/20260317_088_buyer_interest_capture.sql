-- ============================================================================
-- Migration: Buyer Interest Capture
-- Created: 2026-03-17
-- Purpose: Capture buyer demand signals when browse results are empty.
--          Stores email/phone + zip code for geographic demand analysis.
-- ============================================================================

CREATE TABLE IF NOT EXISTS buyer_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_id TEXT NOT NULL DEFAULT 'food_trucks' REFERENCES verticals(vertical_id),
  email TEXT,
  phone TEXT,
  zip_code TEXT,
  city TEXT,
  source TEXT NOT NULL DEFAULT 'browse_empty', -- where the capture happened
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT buyer_interests_has_contact CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_buyer_interests_vertical ON buyer_interests(vertical_id);
CREATE INDEX idx_buyer_interests_zip ON buyer_interests(zip_code) WHERE zip_code IS NOT NULL;
CREATE INDEX idx_buyer_interests_created ON buyer_interests(created_at DESC);
-- Prevent duplicate signups per email+vertical
CREATE UNIQUE INDEX idx_buyer_interests_email_vertical
  ON buyer_interests(email, vertical_id) WHERE email IS NOT NULL;

-- RLS
ALTER TABLE buyer_interests ENABLE ROW LEVEL SECURITY;

-- Public can insert (no auth required — this is a lead capture form)
CREATE POLICY "buyer_interests_insert"
  ON buyer_interests FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only admins can read
CREATE POLICY "buyer_interests_admin_select"
  ON buyer_interests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid()
      AND (role = 'admin' OR 'admin' = ANY(roles))
    )
  );

-- ============================================================================
-- END MIGRATION
-- ============================================================================
