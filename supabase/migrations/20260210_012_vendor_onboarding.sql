-- ============================================================================
-- Migration: 20260210_012_vendor_onboarding
-- Description: Extend vendor_verifications for 3-gate onboarding system
--   Gate 1: Vendor Approved (business docs reviewed by admin)
--   Gate 2: Category Authorized (per-category TX DSHS document verification)
--   Gate 3: Market Ready (COI verified)
-- ============================================================================

-- ============================================================================
-- 1. Add new columns to vendor_verifications
-- ============================================================================

ALTER TABLE vendor_verifications
  ADD COLUMN IF NOT EXISTS requested_categories TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS category_verifications JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS coi_documents JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS coi_status TEXT DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS coi_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coi_verified_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prohibited_items_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- CHECK constraint for coi_status (not using the verification_status enum
-- because we need 'not_submitted' which isn't in that enum)
ALTER TABLE vendor_verifications
  ADD CONSTRAINT vendor_verifications_coi_status_check
  CHECK (coi_status IN ('not_submitted', 'pending', 'approved', 'rejected'));

COMMENT ON COLUMN vendor_verifications.requested_categories IS 'Categories the vendor wants to sell in (from signup or onboarding)';
COMMENT ON COLUMN vendor_verifications.category_verifications IS 'Per-category verification status and documents: { "Baked Goods": { "status": "approved", "doc_type": "cottage_food_ack", "documents": [...], "reviewed_at": "..." } }';
COMMENT ON COLUMN vendor_verifications.coi_documents IS 'Array of COI document metadata [{path, filename, uploaded_at}]';
COMMENT ON COLUMN vendor_verifications.coi_status IS 'Certificate of Insurance status: not_submitted, pending, approved, rejected';
COMMENT ON COLUMN vendor_verifications.prohibited_items_acknowledged_at IS 'When vendor acknowledged the prohibited items policy';
COMMENT ON COLUMN vendor_verifications.onboarding_completed_at IS 'When all 3 gates were first satisfied';

-- ============================================================================
-- 2. RLS Policies — add INSERT and UPDATE (only SELECT exists today)
-- ============================================================================

-- Clean up duplicate admin SELECT policy from migration 203_003
DROP POLICY IF EXISTS "vendor_verifications_admin_select" ON public.vendor_verifications;

-- Vendors can INSERT their own verification row
DROP POLICY IF EXISTS "vendor_verifications_insert" ON public.vendor_verifications;
CREATE POLICY "vendor_verifications_insert" ON public.vendor_verifications
  FOR INSERT TO public
  WITH CHECK (
    vendor_profile_id IN (SELECT user_vendor_profile_ids())
  );

-- Vendors can UPDATE their own row (doc uploads, category requests, prohibited items ack)
DROP POLICY IF EXISTS "vendor_verifications_vendor_update" ON public.vendor_verifications;
CREATE POLICY "vendor_verifications_vendor_update" ON public.vendor_verifications
  FOR UPDATE TO public
  USING (
    vendor_profile_id IN (SELECT user_vendor_profile_ids())
  )
  WITH CHECK (
    vendor_profile_id IN (SELECT user_vendor_profile_ids())
  );

-- Admins can UPDATE any verification (approve/reject, notes, COI review)
DROP POLICY IF EXISTS "vendor_verifications_admin_update" ON public.vendor_verifications;
CREATE POLICY "vendor_verifications_admin_update" ON public.vendor_verifications
  FOR UPDATE TO public
  USING (
    (SELECT is_platform_admin())
    OR can_admin_vendor(vendor_profile_id)
  )
  WITH CHECK (
    (SELECT is_platform_admin())
    OR can_admin_vendor(vendor_profile_id)
  );

-- ============================================================================
-- 3. Auto-create vendor_verifications row on vendor_profiles INSERT
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_vendor_verification()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO vendor_verifications (vendor_profile_id)
  VALUES (NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS auto_create_vendor_verification_trigger ON vendor_profiles;
CREATE TRIGGER auto_create_vendor_verification_trigger
  AFTER INSERT ON vendor_profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_vendor_verification();

-- ============================================================================
-- 4. Backfill: create verification rows for existing vendor_profiles
-- ============================================================================

INSERT INTO vendor_verifications (vendor_profile_id)
SELECT vp.id FROM vendor_profiles vp
WHERE NOT EXISTS (
  SELECT 1 FROM vendor_verifications vv WHERE vv.vendor_profile_id = vp.id
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5. Helper function: check if vendor can publish listings
-- Returns true when all 3 gates are satisfied for the given category
-- ============================================================================

CREATE OR REPLACE FUNCTION can_vendor_publish(
  p_vendor_profile_id UUID,
  p_category TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_record vendor_verifications%ROWTYPE;
  v_cat_status TEXT;
BEGIN
  SELECT * INTO v_record
  FROM vendor_verifications
  WHERE vendor_profile_id = p_vendor_profile_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Gate 1: Vendor must be approved
  IF v_record.status != 'approved' THEN
    RETURN FALSE;
  END IF;

  -- Gate 2: Category must be authorized (if it requires docs)
  -- Categories with no doc requirements are auto-authorized
  -- The app layer determines which categories need docs;
  -- here we just check if the category has a verification entry and if it's approved
  IF v_record.category_verifications ? p_category THEN
    v_cat_status := v_record.category_verifications -> p_category ->> 'status';
    IF v_cat_status IS NOT NULL AND v_cat_status != 'approved' AND v_cat_status != 'not_required' THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Gate 3: COI must be approved
  IF v_record.coi_status != 'approved' THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION can_vendor_publish IS 'Returns true when vendor has passed all 3 onboarding gates for the given category';
