-- Migration: Fix vendor_referral_credits duplicate SELECT policy
-- Created: 2026-01-30
--
-- Issue: Two SELECT policies exist on vendor_referral_credits:
--   - vendor_referral_credits_access (from 20260126_005)
--   - vendor_referral_credits_select (from 20260130_007)
--
-- Fix: Drop the older one (vendor_referral_credits_access)
-- Impact: None - both policies have equivalent logic

DROP POLICY IF EXISTS "vendor_referral_credits_access" ON public.vendor_referral_credits;

-- Note: vendor_referral_credits_select remains and handles:
--   - Referrer can see credits they earned
--   - Referred vendor can see their referral status
