-- Migration 076: Add event approval columns to vendor_profiles
-- Allows admin to approve specific FT vendors for private events

ALTER TABLE public.vendor_profiles
  ADD COLUMN IF NOT EXISTS event_approved BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS event_approved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_vendor_profiles_event_approved
  ON public.vendor_profiles (event_approved)
  WHERE event_approved = true;

COMMENT ON COLUMN public.vendor_profiles.event_approved
  IS 'Admin-granted flag: vendor is approved for private events';

NOTIFY pgrst, 'reload schema';
