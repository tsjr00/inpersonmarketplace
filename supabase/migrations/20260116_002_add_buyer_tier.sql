-- Add buyer tier system to user_profiles
-- Tracks premium membership status for buyers

-- Add tier column (free or premium)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS buyer_tier TEXT DEFAULT 'free';

-- Add subscription tracking
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS buyer_tier_expires_at TIMESTAMPTZ;

-- Add Stripe subscription ID for future integration
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Add index for querying by tier
CREATE INDEX IF NOT EXISTS idx_user_profiles_buyer_tier ON user_profiles(buyer_tier);

-- Add check constraint for valid tiers
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS valid_buyer_tier;
ALTER TABLE user_profiles ADD CONSTRAINT valid_buyer_tier
  CHECK (buyer_tier IN ('free', 'premium'));

-- Comments for documentation
COMMENT ON COLUMN user_profiles.buyer_tier IS 'Buyer membership tier: free or premium ($9.99/mo)';
COMMENT ON COLUMN user_profiles.buyer_tier_expires_at IS 'When premium membership expires (null for free tier)';
COMMENT ON COLUMN user_profiles.stripe_subscription_id IS 'Stripe subscription ID for premium membership';

-- Set all existing users to free tier
UPDATE user_profiles
SET buyer_tier = 'free'
WHERE buyer_tier IS NULL;

-- Create a couple test premium buyers for testing
-- (Update these to actual test user IDs after checking the data)
UPDATE user_profiles
SET buyer_tier = 'premium',
    buyer_tier_expires_at = NOW() + INTERVAL '1 year'
WHERE display_name ILIKE '%test%'
  AND NOT EXISTS (
    SELECT 1 FROM vendor_profiles vp WHERE vp.user_id = user_profiles.user_id
  )
LIMIT 2;
