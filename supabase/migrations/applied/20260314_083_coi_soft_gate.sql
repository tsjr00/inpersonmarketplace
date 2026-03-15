-- Migration 083: Make COI a soft gate for regular publishing, hard gate for event approval
--
-- Business rule VJ-R1 (confirmed Session 49): COI is OPTIONAL for regular vendor publishing
-- Business requirement: COI is REQUIRED for event-vendor approval
--
-- Changes:
-- 1. Remove COI check from can_vendor_publish() — vendors can publish without approved COI
-- 2. Add comment documenting that event-approval route enforces COI separately

-- ============================================================================
-- 1. Update can_vendor_publish() — remove COI gate for regular publishing
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
  IF v_record.category_verifications ? p_category THEN
    v_cat_status := v_record.category_verifications -> p_category ->> 'status';
    IF v_cat_status IS NOT NULL AND v_cat_status != 'approved' AND v_cat_status != 'not_required' THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Gate 3 REMOVED: COI is now a SOFT gate for regular publishing (VJ-R1)
  -- COI is enforced as a HARD gate only for event-vendor approval
  -- (checked in /api/admin/vendors/[id]/event-approval route)

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION can_vendor_publish IS 'Returns true when vendor has passed onboarding gates for the given category. COI is a soft gate (not required for publishing, required for event approval).';

-- ============================================================================
-- Notify PostgREST to reload schema cache
-- ============================================================================
NOTIFY pgrst, 'reload schema';
