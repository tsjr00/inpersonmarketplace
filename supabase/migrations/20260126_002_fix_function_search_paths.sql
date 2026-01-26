-- Migration: Fix Function Search Path Security Warnings (Round 2)
-- Created: 2026-01-26
-- Purpose: Set search_path on functions created after the initial security fix
--
-- Fixes 15 functions flagged by Supabase security linter:
--   - trigger_generate_referral_code
--   - is_listing_accepting_orders
--   - get_listing_market_availability
--   - check_subscription_completion
--   - update_vendor_last_login
--   - update_vendor_activity_on_order
--   - get_next_market_datetime
--   - award_referral_credit_on_first_sale
--   - create_market_box_pickups
--   - vendor_skip_week
--   - update_vendor_activity_on_listing
--   - generate_vendor_referral_code
--   - update_vendor_rating_stats
--   - scan_vendor_activity
--   - get_market_cutoff

-- ============================================================================
-- Referral System Functions (20260121_001)
-- ============================================================================

ALTER FUNCTION public.trigger_generate_referral_code() SET search_path = public;
ALTER FUNCTION public.generate_vendor_referral_code(UUID) SET search_path = public;
ALTER FUNCTION public.award_referral_credit_on_first_sale() SET search_path = public;

-- ============================================================================
-- Market Cutoff Functions (20260119_002)
-- ============================================================================

ALTER FUNCTION public.get_next_market_datetime(INTEGER, TIME, TEXT) SET search_path = public;
ALTER FUNCTION public.get_market_cutoff(UUID) SET search_path = public;
ALTER FUNCTION public.is_listing_accepting_orders(UUID) SET search_path = public;
ALTER FUNCTION public.get_listing_market_availability(UUID) SET search_path = public;

-- ============================================================================
-- Market Box Functions (20260116_006, 20260123_001)
-- ============================================================================

ALTER FUNCTION public.create_market_box_pickups() SET search_path = public;
ALTER FUNCTION public.check_subscription_completion() SET search_path = public;
ALTER FUNCTION public.vendor_skip_week(UUID, TEXT) SET search_path = public;

-- ============================================================================
-- Vendor Activity Monitoring Functions (20260121_002)
-- ============================================================================

ALTER FUNCTION public.update_vendor_last_login() SET search_path = public;
ALTER FUNCTION public.update_vendor_activity_on_listing() SET search_path = public;
ALTER FUNCTION public.update_vendor_activity_on_order() SET search_path = public;
ALTER FUNCTION public.scan_vendor_activity(TEXT) SET search_path = public;

-- ============================================================================
-- Order Ratings Function (20260123_002)
-- ============================================================================

ALTER FUNCTION public.update_vendor_rating_stats() SET search_path = public;

-- ============================================================================
-- Verify: Check for any remaining functions without search_path
-- ============================================================================

DO $$
DECLARE
  unsafe_count INTEGER;
  func_names TEXT;
BEGIN
  SELECT COUNT(*), STRING_AGG(p.proname, ', ')
  INTO unsafe_count, func_names
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proconfig IS NULL
    AND p.prokind = 'f'
    AND p.proname NOT LIKE 'pg_%'
    AND p.proname NOT LIKE '_pg_%';

  IF unsafe_count > 0 THEN
    RAISE NOTICE 'Functions without search_path: % (%)', unsafe_count, func_names;
  ELSE
    RAISE NOTICE 'All public functions have search_path set.';
  END IF;
END $$;
