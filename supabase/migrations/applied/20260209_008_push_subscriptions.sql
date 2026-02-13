-- Migration: Push Notification Subscriptions
-- Date: 2026-02-09
-- Purpose: Store Web Push API subscription data for sending push notifications
-- Each row represents one browser/device push subscription for a user

-- ============================================
-- PART 1: Create Table
-- ============================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

-- Performance index for the hot path in sendPush()
CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- ============================================
-- PART 2: Row Level Security
-- ============================================

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscriptions
CREATE POLICY "push_subscriptions_select" ON push_subscriptions
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- Users can insert their own subscriptions
CREATE POLICY "push_subscriptions_insert" ON push_subscriptions
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

-- Users can delete their own subscriptions
CREATE POLICY "push_subscriptions_delete" ON push_subscriptions
  FOR DELETE USING (user_id = (SELECT auth.uid()));

-- Service role bypasses RLS automatically (used by sendPush in notification service)

-- Migration complete
