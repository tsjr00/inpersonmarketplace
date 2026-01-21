-- ============================================================================
-- Seed Script: Vendor Activity Monitoring & Referral System Test Data
-- Run this in DEV/Staging to populate test data
-- ============================================================================

-- ============================================================================
-- 1. VENDOR REFERRALS - Update vendor_profiles with referral data
-- ============================================================================

-- First, ensure all vendors have referral codes
UPDATE vendor_profiles
SET referral_code = generate_vendor_referral_code(id)
WHERE referral_code IS NULL;

-- Get some vendor IDs to work with (we'll use variables via CTEs)
-- Set up referral relationships: Vendor 1 referred Vendors 2, 3, 4
WITH vendors AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
  FROM vendor_profiles
  WHERE status = 'approved'
  LIMIT 10
),
referrer AS (
  SELECT id FROM vendors WHERE rn = 1
),
referred AS (
  SELECT id, rn FROM vendors WHERE rn IN (2, 3, 4)
)
UPDATE vendor_profiles vp
SET referred_by_vendor_id = (SELECT id FROM referrer)
WHERE vp.id IN (SELECT id FROM referred)
  AND vp.referred_by_vendor_id IS NULL;

-- Mark first vendor as a founding vendor
UPDATE vendor_profiles
SET is_founding_vendor = TRUE,
    founding_vendor_granted_at = NOW() - INTERVAL '6 months'
WHERE id = (
  SELECT id FROM vendor_profiles
  WHERE status = 'approved'
  ORDER BY created_at
  LIMIT 1
);

-- Create referral credit records
-- Credit 1: Pending (referred vendor hasn't made first sale yet)
INSERT INTO vendor_referral_credits (
  referrer_vendor_id,
  referred_vendor_id,
  credit_amount_cents,
  status,
  created_at
)
SELECT
  (SELECT id FROM vendor_profiles WHERE status = 'approved' ORDER BY created_at LIMIT 1),
  (SELECT id FROM vendor_profiles WHERE status = 'approved' ORDER BY created_at LIMIT 1 OFFSET 1),
  1000,
  'pending',
  NOW() - INTERVAL '14 days'
WHERE NOT EXISTS (
  SELECT 1 FROM vendor_referral_credits
  WHERE referrer_vendor_id = (SELECT id FROM vendor_profiles WHERE status = 'approved' ORDER BY created_at LIMIT 1)
    AND referred_vendor_id = (SELECT id FROM vendor_profiles WHERE status = 'approved' ORDER BY created_at LIMIT 1 OFFSET 1)
);

-- Credit 2: Earned (referred vendor made first sale)
INSERT INTO vendor_referral_credits (
  referrer_vendor_id,
  referred_vendor_id,
  credit_amount_cents,
  status,
  created_at,
  earned_at,
  expires_at
)
SELECT
  (SELECT id FROM vendor_profiles WHERE status = 'approved' ORDER BY created_at LIMIT 1),
  (SELECT id FROM vendor_profiles WHERE status = 'approved' ORDER BY created_at LIMIT 1 OFFSET 2),
  1000,
  'earned',
  NOW() - INTERVAL '60 days',
  NOW() - INTERVAL '45 days',
  NOW() + INTERVAL '10 months'
WHERE NOT EXISTS (
  SELECT 1 FROM vendor_referral_credits
  WHERE referrer_vendor_id = (SELECT id FROM vendor_profiles WHERE status = 'approved' ORDER BY created_at LIMIT 1)
    AND referred_vendor_id = (SELECT id FROM vendor_profiles WHERE status = 'approved' ORDER BY created_at LIMIT 1 OFFSET 2)
);

-- Credit 3: Applied (credit was used)
INSERT INTO vendor_referral_credits (
  referrer_vendor_id,
  referred_vendor_id,
  credit_amount_cents,
  status,
  created_at,
  earned_at,
  applied_at,
  applied_to,
  applied_amount_cents
)
SELECT
  (SELECT id FROM vendor_profiles WHERE status = 'approved' ORDER BY created_at LIMIT 1),
  (SELECT id FROM vendor_profiles WHERE status = 'approved' ORDER BY created_at LIMIT 1 OFFSET 3),
  1000,
  'applied',
  NOW() - INTERVAL '90 days',
  NOW() - INTERVAL '75 days',
  NOW() - INTERVAL '30 days',
  'platform_fee',
  1000
WHERE NOT EXISTS (
  SELECT 1 FROM vendor_referral_credits
  WHERE referrer_vendor_id = (SELECT id FROM vendor_profiles WHERE status = 'approved' ORDER BY created_at LIMIT 1)
    AND referred_vendor_id = (SELECT id FROM vendor_profiles WHERE status = 'approved' ORDER BY created_at LIMIT 1 OFFSET 3)
);

-- ============================================================================
-- 2. VENDOR ACTIVITY MONITORING - Update activity timestamps
-- ============================================================================

-- Update all approved vendors with realistic activity data
-- Active vendors (logged in recently)
UPDATE vendor_profiles
SET
  last_login_at = NOW() - (RANDOM() * INTERVAL '7 days'),
  last_active_at = NOW() - (RANDOM() * INTERVAL '3 days'),
  first_listing_at = created_at + INTERVAL '2 days'
WHERE status = 'approved'
  AND id IN (
    SELECT id FROM vendor_profiles
    WHERE status = 'approved'
    ORDER BY RANDOM()
    LIMIT 5
  );

-- Semi-active vendors (logged in 30-60 days ago)
UPDATE vendor_profiles
SET
  last_login_at = NOW() - INTERVAL '30 days' - (RANDOM() * INTERVAL '30 days'),
  last_active_at = NOW() - INTERVAL '30 days' - (RANDOM() * INTERVAL '30 days'),
  first_listing_at = created_at + INTERVAL '5 days'
WHERE status = 'approved'
  AND last_login_at IS NULL
  AND id IN (
    SELECT id FROM vendor_profiles
    WHERE status = 'approved'
      AND last_login_at IS NULL
    ORDER BY RANDOM()
    LIMIT 3
  );

-- Inactive vendors (no login in 90+ days) - these should get flagged
UPDATE vendor_profiles
SET
  last_login_at = NOW() - INTERVAL '95 days',
  last_active_at = NOW() - INTERVAL '100 days',
  first_listing_at = created_at + INTERVAL '3 days'
WHERE status = 'approved'
  AND last_login_at IS NULL
  AND id IN (
    SELECT id FROM vendor_profiles
    WHERE status = 'approved'
      AND last_login_at IS NULL
    ORDER BY RANDOM()
    LIMIT 2
  );

-- Vendor who never created a listing (incomplete onboarding)
UPDATE vendor_profiles
SET
  last_login_at = NOW() - INTERVAL '35 days',
  last_active_at = NOW() - INTERVAL '35 days',
  first_listing_at = NULL
WHERE status = 'approved'
  AND first_listing_at IS NULL
  AND id = (
    SELECT id FROM vendor_profiles
    WHERE status = 'approved'
    ORDER BY RANDOM()
    LIMIT 1
  );

-- ============================================================================
-- 3. CREATE ACTIVITY FLAGS (simulate what the scan would find)
-- ============================================================================

-- Flag: No recent login
INSERT INTO vendor_activity_flags (
  vendor_profile_id,
  vertical_id,
  reason,
  status,
  details,
  created_at
)
SELECT
  vp.id,
  vp.vertical_id,
  'no_recent_login',
  'pending',
  jsonb_build_object(
    'days_since_login', EXTRACT(DAY FROM NOW() - vp.last_login_at)::INTEGER,
    'threshold', 90,
    'last_login_at', vp.last_login_at
  ),
  NOW() - INTERVAL '2 days'
FROM vendor_profiles vp
WHERE vp.status = 'approved'
  AND vp.last_login_at < NOW() - INTERVAL '90 days'
  AND NOT EXISTS (
    SELECT 1 FROM vendor_activity_flags vaf
    WHERE vaf.vendor_profile_id = vp.id
      AND vaf.reason = 'no_recent_login'
      AND vaf.status = 'pending'
  )
LIMIT 2;

-- Flag: No published listings
INSERT INTO vendor_activity_flags (
  vendor_profile_id,
  vertical_id,
  reason,
  status,
  details,
  created_at
)
SELECT
  vp.id,
  vp.vertical_id,
  'no_published_listings',
  'pending',
  jsonb_build_object(
    'published_count', 0,
    'days_since_approval', EXTRACT(DAY FROM NOW() - vp.created_at)::INTEGER
  ),
  NOW() - INTERVAL '1 day'
FROM vendor_profiles vp
WHERE vp.status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM listings l
    WHERE l.vendor_profile_id = vp.id
      AND l.status = 'published'
      AND l.deleted_at IS NULL
  )
  AND vp.created_at < NOW() - INTERVAL '14 days'
  AND NOT EXISTS (
    SELECT 1 FROM vendor_activity_flags vaf
    WHERE vaf.vendor_profile_id = vp.id
      AND vaf.reason = 'no_published_listings'
      AND vaf.status = 'pending'
  )
LIMIT 1;

-- Flag: Incomplete onboarding (already resolved - for history)
INSERT INTO vendor_activity_flags (
  vendor_profile_id,
  vertical_id,
  reason,
  status,
  details,
  created_at,
  resolved_at,
  resolution_notes,
  action_taken
)
SELECT
  vp.id,
  vp.vertical_id,
  'incomplete_onboarding',
  'dismissed',
  jsonb_build_object(
    'days_since_approval', 45,
    'threshold', 30
  ),
  NOW() - INTERVAL '30 days',
  NOW() - INTERVAL '25 days',
  'Contacted vendor - they are working on their first listing',
  'contacted'
FROM vendor_profiles vp
WHERE vp.status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM vendor_activity_flags vaf
    WHERE vaf.vendor_profile_id = vp.id
      AND vaf.reason = 'incomplete_onboarding'
  )
LIMIT 1;

-- Flag: No recent orders (already actioned)
INSERT INTO vendor_activity_flags (
  vendor_profile_id,
  vertical_id,
  reason,
  status,
  details,
  created_at,
  resolved_at,
  resolution_notes,
  action_taken
)
SELECT
  vp.id,
  vp.vertical_id,
  'no_recent_orders',
  'actioned',
  jsonb_build_object(
    'days_since_order', 150,
    'threshold', 120
  ),
  NOW() - INTERVAL '20 days',
  NOW() - INTERVAL '15 days',
  'Vendor confirmed they are taking a break from selling',
  'suspended'
FROM vendor_profiles vp
WHERE vp.status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM vendor_activity_flags vaf
    WHERE vaf.vendor_profile_id = vp.id
      AND vaf.reason = 'no_recent_orders'
  )
LIMIT 1;

-- ============================================================================
-- 4. ENSURE ACTIVITY SETTINGS EXIST
-- ============================================================================

-- Insert default settings for all verticals if not exists
INSERT INTO vendor_activity_settings (vertical_id)
SELECT id FROM verticals
ON CONFLICT (vertical_id) DO NOTHING;

-- ============================================================================
-- 5. CREATE A SAMPLE SCAN LOG ENTRY
-- ============================================================================

INSERT INTO vendor_activity_scan_log (
  vertical_id,
  vendors_scanned,
  new_flags_created,
  flags_auto_resolved,
  flags_by_reason,
  started_at,
  completed_at,
  duration_ms,
  status
)
VALUES (
  NULL,  -- All verticals
  (SELECT COUNT(*) FROM vendor_profiles WHERE status = 'approved'),
  3,
  1,
  '{"no_recent_login": 2, "no_published_listings": 1}'::JSONB,
  NOW() - INTERVAL '1 day',
  NOW() - INTERVAL '1 day' + INTERVAL '2 seconds',
  2150,
  'completed'
);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Show referral summary
SELECT
  'Referral Credits Summary' as report,
  status,
  COUNT(*) as count,
  SUM(credit_amount_cents) / 100.0 as total_dollars
FROM vendor_referral_credits
GROUP BY status;

-- Show vendors with referral codes
SELECT
  'Vendors with Referral Codes' as report,
  COUNT(*) as total,
  COUNT(referral_code) as with_code,
  COUNT(referred_by_vendor_id) as were_referred,
  COUNT(CASE WHEN is_founding_vendor THEN 1 END) as founding_vendors
FROM vendor_profiles
WHERE status = 'approved';

-- Show activity flags summary
SELECT
  'Activity Flags Summary' as report,
  status,
  reason,
  COUNT(*) as count
FROM vendor_activity_flags
GROUP BY status, reason
ORDER BY status, reason;

-- Show vendors with activity data
SELECT
  'Vendor Activity Data' as report,
  COUNT(*) as total_approved,
  COUNT(last_login_at) as has_login_data,
  COUNT(CASE WHEN last_login_at > NOW() - INTERVAL '7 days' THEN 1 END) as active_last_7_days,
  COUNT(CASE WHEN last_login_at < NOW() - INTERVAL '90 days' THEN 1 END) as inactive_90_plus_days
FROM vendor_profiles
WHERE status = 'approved';
