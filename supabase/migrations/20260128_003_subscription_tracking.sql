-- Migration: Add subscription tracking fields for premium tiers
-- This enables tracking Stripe subscriptions for vendor and buyer premium upgrades

-- ============================================
-- VENDOR_PROFILES: Add subscription columns
-- ============================================
ALTER TABLE vendor_profiles
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS subscription_cycle TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tier_started_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tier_expires_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT DEFAULT NULL;

-- Vendor constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendor_profiles_subscription_status_check'
  ) THEN
    ALTER TABLE vendor_profiles
      ADD CONSTRAINT vendor_profiles_subscription_status_check
      CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'trialing') OR subscription_status IS NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendor_profiles_subscription_cycle_check'
  ) THEN
    ALTER TABLE vendor_profiles
      ADD CONSTRAINT vendor_profiles_subscription_cycle_check
      CHECK (subscription_cycle IN ('monthly', 'annual') OR subscription_cycle IS NULL);
  END IF;
END $$;

-- ============================================
-- USER_PROFILES: Add subscription columns
-- ============================================
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS buyer_tier TEXT DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS subscription_cycle TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tier_started_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tier_expires_at TIMESTAMPTZ DEFAULT NULL;

-- Drop old constraint if exists (used 'free' instead of 'standard')
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS valid_buyer_tier;

-- Normalize existing data before adding constraint
UPDATE user_profiles SET buyer_tier = 'standard' WHERE buyer_tier IS NULL OR buyer_tier = 'free';

-- User constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_buyer_tier_check'
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_buyer_tier_check
      CHECK (buyer_tier IN ('standard', 'premium'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_subscription_status_check'
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_subscription_status_check
      CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'trialing') OR subscription_status IS NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_subscription_cycle_check'
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_subscription_cycle_check
      CHECK (subscription_cycle IN ('monthly', 'annual') OR subscription_cycle IS NULL);
  END IF;
END $$;

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_vendor_stripe_customer ON vendor_profiles(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_subscription_status ON vendor_profiles(subscription_status) WHERE subscription_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_stripe_customer ON user_profiles(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_buyer_tier ON user_profiles(buyer_tier) WHERE buyer_tier = 'premium';
CREATE INDEX IF NOT EXISTS idx_user_subscription_status ON user_profiles(subscription_status) WHERE subscription_status IS NOT NULL;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON COLUMN vendor_profiles.subscription_status IS 'Stripe subscription status: active, past_due, canceled, trialing';
COMMENT ON COLUMN vendor_profiles.subscription_cycle IS 'Billing cycle: monthly or annual';
COMMENT ON COLUMN vendor_profiles.tier_started_at IS 'When the current tier started';
COMMENT ON COLUMN vendor_profiles.tier_expires_at IS 'When the current tier expires (for canceled subscriptions)';
COMMENT ON COLUMN vendor_profiles.stripe_customer_id IS 'Stripe Customer ID for subscription billing';

COMMENT ON COLUMN user_profiles.buyer_tier IS 'Buyer tier: standard (free) or premium';
COMMENT ON COLUMN user_profiles.stripe_customer_id IS 'Stripe Customer ID for subscription billing';
COMMENT ON COLUMN user_profiles.stripe_subscription_id IS 'Stripe Subscription ID for premium membership';
