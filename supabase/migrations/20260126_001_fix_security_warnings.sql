-- Migration: Fix Supabase Security Linter Warnings
-- Created: 2026-01-26
-- Fixes:
--   1. market_vendor_counts view - add SECURITY INVOKER
--   2. vendor_referral_summary view - add SECURITY INVOKER
--   3. spatial_ref_sys table - enable RLS with permissive policy

-- ============================================================================
-- 1. Fix market_vendor_counts view - add explicit SECURITY INVOKER
-- ============================================================================

-- Drop and recreate with security_invoker = true
DROP VIEW IF EXISTS market_vendor_counts;

CREATE VIEW market_vendor_counts
WITH (security_invoker = true)
AS
SELECT
  lm.market_id,
  COUNT(DISTINCT l.vendor_profile_id) as vendor_count
FROM listing_markets lm
JOIN listings l ON l.id = lm.listing_id
WHERE l.status = 'published'
  AND l.deleted_at IS NULL
GROUP BY lm.market_id;

-- Grant read access to authenticated users and anon
GRANT SELECT ON market_vendor_counts TO authenticated;
GRANT SELECT ON market_vendor_counts TO anon;

COMMENT ON VIEW market_vendor_counts IS 'Calculates vendor counts per market based on published listings. Uses SECURITY INVOKER to respect RLS.';

-- ============================================================================
-- 2. Fix vendor_referral_summary view - add explicit SECURITY INVOKER
-- ============================================================================

-- Drop and recreate with security_invoker = true
DROP VIEW IF EXISTS vendor_referral_summary;

CREATE VIEW vendor_referral_summary
WITH (security_invoker = true)
AS
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
   WHERE referrer_vendor_id = vp.id AND status = 'pending') AS pending_credits_cents,

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

-- Grant select to authenticated users (vendors need to see their own summary)
GRANT SELECT ON vendor_referral_summary TO authenticated;

COMMENT ON VIEW vendor_referral_summary IS 'Summarizes referral credits for each vendor. Uses SECURITY INVOKER to respect RLS on underlying tables.';

-- ============================================================================
-- 3. Fix spatial_ref_sys table - REQUIRES SUPERUSER ACCESS
-- ============================================================================

-- spatial_ref_sys is a PostGIS system table containing coordinate system definitions.
-- It's read-only reference data that doesn't contain user information.
--
-- NOTE: This fix requires superuser privileges and cannot be run from the
-- standard SQL Editor. Options:
--   A) Contact Supabase support to run with elevated privileges
--   B) Accept the warning (minimal security risk - it's reference data)
--   C) Disable PostGIS extension if not needed
--
-- The SQL below is commented out but preserved for reference:
--
-- ALTER TABLE spatial_ref_sys ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "Anyone can read spatial reference systems" ON spatial_ref_sys;
-- CREATE POLICY "Anyone can read spatial reference systems"
--   ON spatial_ref_sys FOR SELECT USING (true);

-- ============================================================================
-- Done!
-- ============================================================================
