-- Migration: User Tutorial Tracking
-- Created: 2026-01-21
-- Description: Adds fields to track tutorial completion for new user onboarding

-- Add tutorial tracking columns to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS tutorial_completed_at TIMESTAMPTZ;

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS tutorial_skipped_at TIMESTAMPTZ;

-- Index for querying users who haven't completed tutorial
CREATE INDEX IF NOT EXISTS idx_user_profiles_tutorial
  ON user_profiles(user_id)
  WHERE tutorial_completed_at IS NULL AND tutorial_skipped_at IS NULL;

COMMENT ON COLUMN user_profiles.tutorial_completed_at IS
  'Timestamp when user completed the onboarding tutorial';

COMMENT ON COLUMN user_profiles.tutorial_skipped_at IS
  'Timestamp when user skipped the onboarding tutorial';
