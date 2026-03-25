-- ============================================================================
-- Add missing stripe_subscription_id column to vendor_profiles
--
-- Migration 20260128_003 added this column to user_profiles (buyer path)
-- but omitted it from vendor_profiles. This caused the webhook handler
-- (handleSubscriptionCheckoutComplete) to silently fail when upgrading
-- vendors to premium — the entire UPDATE was rejected because the column
-- didn't exist, so tier was never set to 'premium'.
--
-- Also fixes up test vendor who already paid via Stripe but never got
-- their tier updated due to this bug.
-- ============================================================================

-- Step 1: Add the missing column
ALTER TABLE vendor_profiles
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT DEFAULT NULL;

COMMENT ON COLUMN vendor_profiles.stripe_subscription_id
  IS 'Stripe Subscription ID for premium tier billing';

-- Step 2: Fix test vendor who already paid but tier was never set
-- (vegvendor1+test@test.com attempted upgrade, Stripe charged successfully,
--  but webhook failed to update DB due to missing column)
UPDATE vendor_profiles
SET
  tier = 'premium',
  subscription_status = 'active',
  tier_started_at = now(),
  updated_at = now()
WHERE profile_data->>'email' ILIKE '%vegvendor1%'
  AND vertical_id = 'farmers_market'
  AND (tier IS NULL OR tier = 'standard');
