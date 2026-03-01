-- Migration: 20260228_060_vendor_trial_system
-- Purpose: Add trial tracking columns to vendor_profiles for auto-granted Basic tier trial
-- Affects: vendor_profiles table

-- Add trial columns
ALTER TABLE vendor_profiles
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_grace_ends_at TIMESTAMPTZ;

-- Partial index for cron efficiency — only scan active trials
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_trial_active
  ON vendor_profiles (trial_ends_at)
  WHERE trial_ends_at IS NOT NULL
    AND subscription_status = 'trialing';

-- Comment for documentation
COMMENT ON COLUMN vendor_profiles.trial_started_at IS 'When the free trial was granted (set on admin approval)';
COMMENT ON COLUMN vendor_profiles.trial_ends_at IS 'When the free trial period ends (approval + 90 days)';
COMMENT ON COLUMN vendor_profiles.trial_grace_ends_at IS 'When the post-trial grace period ends (trial_ends_at + 14 days). Cleared after processing.';
