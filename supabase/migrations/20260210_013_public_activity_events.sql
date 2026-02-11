-- Migration: Public Activity Events for Social Proof
-- Purpose: Anonymized event log for "Someone in {city} just bought {item}" toasts
-- No PII stored: city from market (not buyer), item/vendor names already public

CREATE TABLE IF NOT EXISTS public.public_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_id TEXT NOT NULL REFERENCES verticals(vertical_id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'purchase', 'new_vendor', 'sold_out', 'new_listing'
  )),
  city TEXT,
  item_name TEXT,
  vendor_display_name TEXT,
  item_category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);

-- Index for efficient recent event queries
CREATE INDEX idx_public_activity_recent
  ON public_activity_events(vertical_id, created_at DESC)
  WHERE expires_at > now();

-- RLS: public read, only service role writes
ALTER TABLE public_activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_activity_events_public_read" ON public_activity_events;
CREATE POLICY "public_activity_events_public_read"
  ON public_activity_events
  FOR SELECT TO public
  USING (true);

-- No INSERT/UPDATE/DELETE policies for anon/authenticated — only service_role can write
