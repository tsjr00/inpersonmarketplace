-- ============================================================================
-- Grandfather Verification Records for Existing Farmers Market Vendors
-- Run on: Dev, Staging (and eventually Production)
--
-- Creates verification records if missing, then sets all 3 onboarding gates
-- to 'approved' for every farmers_market vendor that has active listings.
-- ============================================================================

-- Step 0: Fix sync_verification_status() trigger function
-- It was created with SECURITY DEFINER but search_path was later set to ''
-- (empty), so it can't resolve table names. Fix to search_path = public.
CREATE OR REPLACE FUNCTION sync_verification_status()
RETURNS TRIGGER AS $$
BEGIN
    -- When verification is approved, update vendor status
    IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
        UPDATE public.vendor_profiles
        SET status = 'approved'
        WHERE id = NEW.vendor_profile_id
        AND status = 'submitted';
    END IF;

    -- When verification is rejected, update vendor status
    IF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
        UPDATE public.vendor_profiles
        SET status = 'rejected'
        WHERE id = NEW.vendor_profile_id
        AND status = 'submitted';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Step 1: Ensure all vendors have a verification record
-- (Migration 012 backfill should have done this, but be safe)
INSERT INTO vendor_verifications (vendor_profile_id)
SELECT vp.id
FROM vendor_profiles vp
WHERE vp.vertical_id = 'farmers_market'
  AND NOT EXISTS (
    SELECT 1 FROM vendor_verifications vv WHERE vv.vendor_profile_id = vp.id
  )
ON CONFLICT DO NOTHING;

-- Step 2: Update verification records for vendors with active listings
WITH vendor_categories AS (
  SELECT
    vp.id AS vendor_profile_id,
    COALESCE(
      array_agg(DISTINCT l.category) FILTER (WHERE l.category IS NOT NULL),
      '{}'::text[]
    ) AS categories
  FROM vendor_profiles vp
  JOIN listings l ON l.vendor_profile_id = vp.id
    AND l.deleted_at IS NULL
  WHERE vp.vertical_id = 'farmers_market'
    AND vp.deleted_at IS NULL
  GROUP BY vp.id
),
category_json AS (
  SELECT
    vc.vendor_profile_id,
    vc.categories,
    COALESCE(
      (
        SELECT jsonb_object_agg(
          cat,
          CASE
            -- Categories that don't require docs
            WHEN cat IN (
              'Produce', 'Plants & Flowers', 'Art & Decor',
              'Clothing & Fashion', 'Home & Functional', 'Health & Wellness'
            )
            THEN jsonb_build_object(
              'status', 'not_required',
              'reviewed_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
              'notes', 'No documentation required for this category'
            )
            -- Categories that require docs — mark as approved (grandfathered)
            ELSE jsonb_build_object(
              'status', 'approved',
              'doc_type', 'grandfathered',
              'documents', '[]'::jsonb,
              'reviewed_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
              'notes', 'Grandfathered: existing vendor with active listings'
            )
          END
        )
        FROM unnest(vc.categories) AS cat
      ),
      '{}'::jsonb
    ) AS cat_verifications
  FROM vendor_categories vc
)
UPDATE vendor_verifications vv
SET
  -- Gate 1: Business Verification = approved
  status = 'approved',
  submitted_at = COALESCE(vv.submitted_at, now()),
  reviewed_at = now(),
  notes = 'Grandfathered: existing vendor with active listings',
  documents = CASE
    WHEN vv.documents IS NULL OR vv.documents = '[]'::jsonb
    THEN ('[{"filename": "grandfathered_business_doc", "type": "business_license", "url": "", "uploaded_at": "'
      || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') || '"}]')::jsonb
    ELSE vv.documents
  END,

  -- Gate 2: Category Authorization = all categories approved
  requested_categories = cj.categories,
  category_verifications = cj.cat_verifications,

  -- Gate 3: COI = approved
  coi_status = 'approved',
  coi_verified_at = now(),
  coi_documents = CASE
    WHEN vv.coi_documents IS NULL OR vv.coi_documents = '[]'::jsonb
    THEN ('[{"filename": "grandfathered_coi", "url": "", "uploaded_at": "'
      || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') || '"}]')::jsonb
    ELSE vv.coi_documents
  END,

  -- Acknowledgment & completion timestamps
  prohibited_items_acknowledged_at = COALESCE(vv.prohibited_items_acknowledged_at, now()),
  onboarding_completed_at = COALESCE(vv.onboarding_completed_at, now()),
  updated_at = now()
FROM category_json cj
WHERE vv.vendor_profile_id = cj.vendor_profile_id;

-- Step 3: Also ensure vendor_profiles status is 'approved' for these vendors
-- (so the listing form doesn't force draft mode)
UPDATE vendor_profiles vp
SET
  status = 'approved',
  updated_at = now()
FROM listings l
WHERE l.vendor_profile_id = vp.id
  AND l.deleted_at IS NULL
  AND vp.vertical_id = 'farmers_market'
  AND vp.deleted_at IS NULL
  AND vp.status != 'approved';
