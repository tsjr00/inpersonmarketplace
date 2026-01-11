-- Migration: 20260110_002_pending_vendor_drafts_multiselect.sql
-- Description: Allow pending vendors to create draft listings, enable multi-select vendor types
-- Date: January 10, 2026
-- Phase: D Bug Fixes

-- ============================================
-- PART 1: Allow pending vendors to create draft listings
-- ============================================

-- Drop existing insert policy
DROP POLICY IF EXISTS "listings_insert" ON public.listings;

-- New policy: Approved vendors can create any status, submitted/draft vendors can create drafts only
-- Note: vendor_status enum values are: 'draft', 'submitted', 'approved', 'rejected', 'suspended'
CREATE POLICY "listings_insert" ON public.listings
FOR INSERT WITH CHECK (
  -- Approved vendors can create listings (any status)
  vendor_profile_id IN (
    SELECT id FROM public.vendor_profiles
    WHERE user_id = (SELECT auth.uid())
    AND status = 'approved'
  )
  OR
  -- Submitted (pending approval) vendors can create DRAFT listings only
  (
    vendor_profile_id IN (
      SELECT id FROM public.vendor_profiles
      WHERE user_id = (SELECT auth.uid())
      AND status = 'submitted'
    )
    AND status = 'draft'
  )
);

-- ============================================
-- PART 2: Enable multi-select vendor types for farmers_market
-- ============================================

-- Update farmers_market vendor_fields to use multi_select for vendor_type
UPDATE public.verticals
SET config = jsonb_set(
  config,
  '{vendor_fields}',
  '[
    {"key":"legal_name","type":"text","label":"Legal Name","required":true},
    {"key":"phone","type":"phone","label":"Phone Number","required":true},
    {"key":"email","type":"email","label":"Email Address","required":true},
    {"key":"business_name","type":"text","label":"Farm / Business Name","required":true},
    {"key":"vendor_type","type":"multi_select","label":"What do you sell?","options":["Produce","Meat","Dairy","Baked Goods","Prepared Foods","Preserves","Plants","Crafts","Other"],"required":true},
    {"key":"cottage_food_cert","type":"file","label":"Cottage Food Permit or Exemption","accept":["pdf","jpg","png"],"required":false},
    {"key":"organic_cert","type":"file","label":"Organic Certification (if applicable)","accept":["pdf","jpg","png"],"required":false}
  ]'::jsonb
),
updated_at = NOW()
WHERE vertical_id = 'farmers_market';

-- ============================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================

-- Verify listings_insert policy exists
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'listings' AND cmd = 'INSERT';

-- Verify vendor_fields updated to multi_select
-- SELECT vertical_id, config->'vendor_fields' FROM public.verticals WHERE vertical_id = 'farmers_market';
