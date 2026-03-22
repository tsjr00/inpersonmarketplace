-- Migration 096: Add configurable pickup lead time for vendors
-- Allows FT vendors to set their prep time (15 or 30 minutes)
-- Default 30 minutes matches current behavior and marketing copy

ALTER TABLE public.vendor_profiles
ADD COLUMN IF NOT EXISTS pickup_lead_minutes INTEGER DEFAULT 30;

-- Constrain to valid values (15 or 30)
ALTER TABLE public.vendor_profiles
ADD CONSTRAINT chk_pickup_lead_minutes
CHECK (pickup_lead_minutes IN (15, 30));

COMMENT ON COLUMN public.vendor_profiles.pickup_lead_minutes IS
  'Minimum prep time in minutes before a pickup slot is available. FT vendors choose 15 or 30.';
