-- Migration: Vendor Tutorial Tracking
-- Created: 2026-01-21
-- Description: Adds fields to track vendor tutorial completion (separate from buyer tutorial)

-- Add vendor tutorial tracking columns to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS vendor_tutorial_completed_at TIMESTAMPTZ;

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS vendor_tutorial_skipped_at TIMESTAMPTZ;

COMMENT ON COLUMN user_profiles.vendor_tutorial_completed_at IS
  'Timestamp when user completed the vendor onboarding tutorial';

COMMENT ON COLUMN user_profiles.vendor_tutorial_skipped_at IS
  'Timestamp when user skipped the vendor onboarding tutorial';
