-- Migration 150: Drop wide-open storage RLS policies (X2)
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- To revert this migration on any environment, run as a single transaction.
-- Note: rollback re-opens the security holes documented below. Do NOT roll
-- back unless explicitly directed.
--
--   BEGIN;
--     -- listing-images writes
--     CREATE POLICY "Authenticated users can delete listing-images"
--       ON storage.objects FOR DELETE TO authenticated
--       USING (bucket_id = 'listing-images');
--     CREATE POLICY "Authenticated users can update listing-images"
--       ON storage.objects FOR UPDATE TO authenticated
--       USING (bucket_id = 'listing-images')
--       WITH CHECK (bucket_id = 'listing-images');
--     -- vendor-images writes
--     CREATE POLICY "Authenticated users can delete vendor-images"
--       ON storage.objects FOR DELETE TO authenticated
--       USING (bucket_id = 'vendor-images');
--     CREATE POLICY "Authenticated users can update vendor-images"
--       ON storage.objects FOR UPDATE TO authenticated
--       USING (bucket_id = 'vendor-images')
--       WITH CHECK (bucket_id = 'vendor-images');
--     -- vendor-documents writes + extra SELECT (staging-only originally)
--     CREATE POLICY "Authenticated users can delete vendor-documents"
--       ON storage.objects FOR DELETE TO authenticated
--       USING (bucket_id = 'vendor-documents');
--     CREATE POLICY "Authenticated users can update vendor-documents"
--       ON storage.objects FOR UPDATE TO authenticated
--       USING (bucket_id = 'vendor-documents')
--       WITH CHECK (bucket_id = 'vendor-documents');
--     CREATE POLICY "Public can view vendor documents"
--       ON storage.objects FOR SELECT
--       USING (bucket_id = 'vendor-documents');
--   COMMIT;
--
-- Risk profile:
--   This migration tightens storage permissions only. No tables, columns,
--   triggers, function bodies, or data are touched.
--
--   The wide-open policies being dropped permit ANY authenticated user
--   (including a buyer who signed up 30 seconds ago) to DELETE or UPDATE
--   ANY file in listing-images / vendor-images / vendor-documents buckets.
--   That's the security hole — an attacker who knows or guesses paths
--   could wipe an entire vendor's listing photos, overwrite a market's
--   logo, or destroy verification documents.
--
--   After this migration: only service_role can DELETE/UPDATE in these
--   buckets. App routes have been updated (commit shipping with this mig)
--   to use createServiceClient() for storage writes — auth + ownership
--   gates remain in the app layer; the service client only handles the
--   storage operation. SELECT policies are unchanged for listing-images
--   and vendor-images (intentional public read for <img src> URLs);
--   vendor-documents SELECT is also unchanged for now (vendor_documents_select
--   remains — full vendor-documents privacy lockdown is X3 / mig 151).
--
--   Verified callers refactored to service client for storage writes:
--     vendor/profile-image:                 upload + getPublicUrl + remove
--     vendor/cover-image:                   upload + getPublicUrl + remove
--     vendor/market-box-image:              upload + getPublicUrl + remove
--     vendor/listings/[id]/images (POST):   upload + getPublicUrl + remove×2
--     vendor/listings/[id]/images (DELETE): remove
--     vendor/onboarding/coi:                upload + getPublicUrl
--     vendor/onboarding/documents:          upload + getPublicUrl
--     vendor/onboarding/category-documents: upload + getPublicUrl
--     vendor/profile/certifications/upload: upload + getPublicUrl
--     market-manager/[marketId]/logo:       upload + getPublicUrl + remove
--
--   If a route's storage operation was missed (still uses auth user client),
--   the symptom after this migration applies is an immediate 4xx on that
--   upload/delete operation. Rollback by re-creating the dropped policies
--   (see ROLLBACK block above) — restores prior behavior fully.
--
-- Dependencies: app code must deploy BEFORE this migration applies. The
--   code change switches storage operations to service client; this
--   migration removes the auth-permitted policies the old code used. If
--   applied with old code still running, uploads/deletes break immediately.
--
-- Env compatibility:
--   DROP POLICY IF EXISTS handles both envs cleanly:
--     - Staging: has all 7 policies — all 7 DROPs execute
--     - Prod: has only the 4 image-bucket policies — vendor-documents DROPs
--       are no-ops (prod already cleaned those up at some earlier point)
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. listing-images bucket (both envs identical)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated users can delete listing-images"
  ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can update listing-images"
  ON storage.objects;

-- ----------------------------------------------------------------------------
-- 2. vendor-images bucket (both envs identical)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated users can delete vendor-images"
  ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can update vendor-images"
  ON storage.objects;

-- ----------------------------------------------------------------------------
-- 3. vendor-documents bucket (staging has 3 extra policies — prod is no-op
--    on all three since prod was cleaned up at some earlier point)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated users can delete vendor-documents"
  ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can update vendor-documents"
  ON storage.objects;

-- The duplicate SELECT policy on vendor-documents (staging-only) — the
-- canonical SELECT policy `vendor_documents_select` remains and continues
-- to permit public read until X3 / mig 151 closes that hole as well.
DROP POLICY IF EXISTS "Public can view vendor documents"
  ON storage.objects;

-- ----------------------------------------------------------------------------
-- Kept intentionally (NOT dropped here):
--   - "Public can view listing images" (SELECT on listing-images) — image
--     URLs need anonymous SELECT for <img src> to work without auth.
--   - "Public can view vendor images" (SELECT on vendor-images) — same.
--   - "vendor_documents_select" (SELECT on vendor-documents) — defer to X3.
--     vendor-documents bucket is still public=true and any client can list
--     all files via this policy; that's the next security hole to close.
-- ----------------------------------------------------------------------------
