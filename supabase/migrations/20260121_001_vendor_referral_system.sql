-- Migration: Vendor-to-Vendor Referral System
-- Created: 2026-01-21
-- Description: Adds referral tracking for vendor-to-vendor referrals with credit system

-- ============================================================================
-- 1. Add referral columns to vendor_profiles
-- ============================================================================

-- Unique referral code for each vendor
ALTER TABLE vendor_profiles
ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

-- Track who referred this vendor
ALTER TABLE vendor_profiles
ADD COLUMN IF NOT EXISTS referred_by_vendor_id UUID REFERENCES vendor_profiles(id);

-- Founding vendor status
ALTER TABLE vendor_profiles
ADD COLUMN IF NOT EXISTS is_founding_vendor BOOLEAN DEFAULT FALSE;

ALTER TABLE vendor_profiles
ADD COLUMN IF NOT EXISTS founding_vendor_granted_at TIMESTAMPTZ;

-- ============================================================================
-- 2. Create referral credits table
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendor_referral_credits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- The vendor who made the referral (earns the credit)
  referrer_vendor_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,

  -- The vendor who was referred
  referred_vendor_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,

  -- Credit amount in cents ($10.00 = 1000)
  credit_amount_cents INTEGER NOT NULL DEFAULT 1000,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'earned', 'applied', 'expired', 'voided')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  earned_at TIMESTAMPTZ,         -- when first sale triggered credit
  applied_at TIMESTAMPTZ,        -- when credit was used
  expires_at TIMESTAMPTZ,        -- 12 months after earned_at

  -- Usage tracking
  applied_to TEXT,               -- 'subscription', 'platform_fee', etc.
  applied_amount_cents INTEGER,  -- partial application support

  -- Audit fields
  voided_reason TEXT,
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES auth.users(id),

  -- Ensure one referral credit per referred vendor
  UNIQUE(referrer_vendor_id, referred_vendor_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_referral_credits_referrer
  ON vendor_referral_credits(referrer_vendor_id);

CREATE INDEX IF NOT EXISTS idx_referral_credits_referred
  ON vendor_referral_credits(referred_vendor_id);

CREATE INDEX IF NOT EXISTS idx_referral_credits_status
  ON vendor_referral_credits(status);

CREATE INDEX IF NOT EXISTS idx_referral_credits_expires
  ON vendor_referral_credits(expires_at)
  WHERE status = 'earned';

-- ============================================================================
-- 3. Generate referral codes for existing vendors
-- ============================================================================

-- Function to generate a unique referral code
CREATE OR REPLACE FUNCTION generate_vendor_referral_code(vendor_id UUID)
RETURNS TEXT AS $$
DECLARE
  base_code TEXT;
  final_code TEXT;
  counter INTEGER := 0;
BEGIN
  -- Get vendor name and create base code
  SELECT
    UPPER(
      REGEXP_REPLACE(
        LEFT(COALESCE(
          profile_data->>'farm_name',
          profile_data->>'business_name',
          'VENDOR'
        ), 10),
        '[^A-Za-z0-9]', '', 'g'
      )
    ) || '-' ||
    TO_CHAR(NOW(), 'YYYY')
  INTO base_code
  FROM vendor_profiles
  WHERE id = vendor_id;

  final_code := base_code;

  -- Check for uniqueness, add suffix if needed
  WHILE EXISTS (SELECT 1 FROM vendor_profiles WHERE referral_code = final_code) LOOP
    counter := counter + 1;
    final_code := base_code || '-' || counter;
  END LOOP;

  RETURN final_code;
END;
$$ LANGUAGE plpgsql;

-- Generate codes for all existing vendors without one
DO $$
DECLARE
  v RECORD;
BEGIN
  FOR v IN SELECT id FROM vendor_profiles WHERE referral_code IS NULL LOOP
    UPDATE vendor_profiles
    SET referral_code = generate_vendor_referral_code(v.id)
    WHERE id = v.id;
  END LOOP;
END $$;

-- ============================================================================
-- 4. Trigger to generate referral code on new vendor creation
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_generate_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := generate_vendor_referral_code(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS vendor_referral_code_trigger ON vendor_profiles;

CREATE TRIGGER vendor_referral_code_trigger
  BEFORE INSERT ON vendor_profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_generate_referral_code();

-- ============================================================================
-- 5. Function to award referral credit on first sale
-- ============================================================================

CREATE OR REPLACE FUNCTION award_referral_credit_on_first_sale()
RETURNS TRIGGER AS $$
DECLARE
  seller_vendor_id UUID;
  referrer_id UUID;
  has_previous_sale BOOLEAN;
  year_credits_cents INTEGER;
  max_annual_credits INTEGER := 10000; -- $100/year cap
BEGIN
  -- Only process completed orders
  IF NEW.status != 'fulfilled' THEN
    RETURN NEW;
  END IF;

  -- Get the vendor who made this sale (from order_items)
  SELECT DISTINCT oi.vendor_profile_id INTO seller_vendor_id
  FROM order_items oi
  WHERE oi.order_id = NEW.id
  LIMIT 1;

  IF seller_vendor_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if this vendor was referred
  SELECT referred_by_vendor_id INTO referrer_id
  FROM vendor_profiles
  WHERE id = seller_vendor_id;

  IF referrer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if this is their first completed sale
  SELECT EXISTS (
    SELECT 1 FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE oi.vendor_profile_id = seller_vendor_id
      AND o.status = 'fulfilled'
      AND o.id != NEW.id
  ) INTO has_previous_sale;

  IF has_previous_sale THEN
    RETURN NEW;
  END IF;

  -- Check referrer's annual cap
  SELECT COALESCE(SUM(credit_amount_cents), 0) INTO year_credits_cents
  FROM vendor_referral_credits
  WHERE referrer_vendor_id = referrer_id
    AND status IN ('earned', 'applied')
    AND earned_at >= DATE_TRUNC('year', NOW());

  IF year_credits_cents >= max_annual_credits THEN
    -- Referrer has hit annual cap, update status but don't award
    UPDATE vendor_referral_credits
    SET status = 'voided',
        voided_reason = 'Annual cap reached',
        voided_at = NOW()
    WHERE referrer_vendor_id = referrer_id
      AND referred_vendor_id = seller_vendor_id
      AND status = 'pending';
    RETURN NEW;
  END IF;

  -- Award the credit!
  UPDATE vendor_referral_credits
  SET status = 'earned',
      earned_at = NOW(),
      expires_at = NOW() + INTERVAL '12 months'
  WHERE referrer_vendor_id = referrer_id
    AND referred_vendor_id = seller_vendor_id
    AND status = 'pending';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on orders table
DROP TRIGGER IF EXISTS referral_credit_on_sale_trigger ON orders;

CREATE TRIGGER referral_credit_on_sale_trigger
  AFTER UPDATE ON orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'fulfilled')
  EXECUTE FUNCTION award_referral_credit_on_first_sale();

-- ============================================================================
-- 6. View for referral summary (useful for dashboard)
-- ============================================================================

CREATE OR REPLACE VIEW vendor_referral_summary AS
SELECT
  vp.id AS vendor_id,
  vp.referral_code,
  vp.referred_by_vendor_id,

  -- Counts
  (SELECT COUNT(*) FROM vendor_referral_credits
   WHERE referrer_vendor_id = vp.id AND status = 'pending') AS pending_count,

  (SELECT COUNT(*) FROM vendor_referral_credits
   WHERE referrer_vendor_id = vp.id AND status = 'earned') AS earned_count,

  (SELECT COUNT(*) FROM vendor_referral_credits
   WHERE referrer_vendor_id = vp.id AND status = 'applied') AS applied_count,

  -- Credit amounts
  (SELECT COALESCE(SUM(credit_amount_cents), 0) FROM vendor_referral_credits
   WHERE referrer_vendor_id = vp.id AND status = 'earned') AS available_credits_cents,

  (SELECT COALESCE(SUM(credit_amount_cents), 0) FROM vendor_referral_credits
   WHERE referrer_vendor_id = vp.id
   AND status IN ('earned', 'applied')
   AND earned_at >= DATE_TRUNC('year', NOW())) AS year_earned_cents,

  -- Cap info
  10000 AS annual_cap_cents,

  10000 - (SELECT COALESCE(SUM(credit_amount_cents), 0) FROM vendor_referral_credits
   WHERE referrer_vendor_id = vp.id
   AND status IN ('earned', 'applied')
   AND earned_at >= DATE_TRUNC('year', NOW())) AS remaining_cap_cents

FROM vendor_profiles vp;

-- ============================================================================
-- 7. RLS Policies
-- ============================================================================

ALTER TABLE vendor_referral_credits ENABLE ROW LEVEL SECURITY;

-- Vendors can view their own referral credits (as referrer)
CREATE POLICY "Vendors can view own referral credits"
  ON vendor_referral_credits FOR SELECT
  USING (
    referrer_vendor_id IN (
      SELECT id FROM vendor_profiles WHERE user_id = auth.uid()
    )
  );

-- Vendors can view if they were referred (as referred)
CREATE POLICY "Vendors can view own referred status"
  ON vendor_referral_credits FOR SELECT
  USING (
    referred_vendor_id IN (
      SELECT id FROM vendor_profiles WHERE user_id = auth.uid()
    )
  );

-- Only system can insert/update referral credits (via triggers and API)
CREATE POLICY "System can manage referral credits"
  ON vendor_referral_credits FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid()
      AND 'admin' = ANY(roles)
    )
  );

-- ============================================================================
-- 8. Index on vendor_profiles referral_code for lookups
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_vendor_profiles_referral_code
  ON vendor_profiles(referral_code);

CREATE INDEX IF NOT EXISTS idx_vendor_profiles_referred_by
  ON vendor_profiles(referred_by_vendor_id);

-- ============================================================================
-- Done!
-- ============================================================================

COMMENT ON TABLE vendor_referral_credits IS
  'Tracks vendor-to-vendor referral credits. Credits are pending until referred vendor makes first sale, then earned.';

COMMENT ON COLUMN vendor_profiles.referral_code IS
  'Unique referral code for this vendor, used in referral links';

COMMENT ON COLUMN vendor_profiles.referred_by_vendor_id IS
  'The vendor who referred this vendor to the platform';
