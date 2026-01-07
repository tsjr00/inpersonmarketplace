-- =============================================================================
-- Migration: Fix function search_path security warnings
-- =============================================================================
-- Created: 2026-01-06 13:03:00 CST
-- Author: Claude Code
--
-- Purpose: Set search_path to prevent SQL injection via schema manipulation
--
-- Applied to:
-- [ ] Dev (vawpviatqalicckkqchs) - Date: ___________
-- [ ] Staging (vfknvsxfgcwqmlkuzhnq) - Date: ___________
-- =============================================================================

-- Fix all functions by setting search_path = ''
-- This forces fully qualified table names and prevents search_path attacks

ALTER FUNCTION public.create_profile_for_user() SET search_path = '';
ALTER FUNCTION public.track_vendor_status_change() SET search_path = '';
ALTER FUNCTION public.notify_transaction_status_change() SET search_path = '';
ALTER FUNCTION public.sync_verification_status() SET search_path = '';
ALTER FUNCTION public.get_vertical_config(text) SET search_path = '';
ALTER FUNCTION public.get_vendor_fields(text) SET search_path = '';
ALTER FUNCTION public.get_listing_fields(text) SET search_path = '';
ALTER FUNCTION public.user_owns_vendor(uuid) SET search_path = '';
ALTER FUNCTION public.has_role(user_role) SET search_path = '';
ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.is_admin() SET search_path = '';
ALTER FUNCTION public.is_verifier() SET search_path = '';
ALTER FUNCTION public.get_user_vendor_ids() SET search_path = '';
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
ALTER FUNCTION public.soft_delete() SET search_path = '';

-- Verify
DO $$
DECLARE
  unsafe_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unsafe_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proconfig IS NULL
    AND p.prokind = 'f';

  RAISE NOTICE 'Functions without search_path: %', unsafe_count;
END $$;
