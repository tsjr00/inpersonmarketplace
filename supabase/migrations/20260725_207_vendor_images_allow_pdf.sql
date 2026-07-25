-- Migration 207: allow application/pdf in the vendor-images bucket
--
-- Tester finding F4 (2026-07-24): uploading a spot-map PDF failed with
-- "mime type application/pdf is not supported". Root cause: the booth-map route
-- (mig 205 companion code) accepts PDF and uploads to the `vendor-images`
-- bucket, but that bucket's allowed_mime_types was
-- ['image/jpeg','image/png','image/gif','image/webp'] (mig 20260120_001) — set
-- that way because the bucket was BUILT for vendor images (logos, covers,
-- listing photos), NOT as an anti-PDF security control. Supabase Storage
-- rejected the PDF at upload.
--
-- Owner decision: allow PDF (Option 1). Risk is minimal — the booth-map route
-- enforces a stricter 3 MB cap in code than the bucket's 5 MB limit, files are
-- public + linked-not-executed, and we already accept PDFs in the
-- market-documents bucket. Every other route targeting vendor-images validates
-- its own MIME types in code, so only the booth-map route accepts PDF in
-- practice — this bucket setting is just a backstop.
--
-- ADDITIVE + idempotent: appends 'application/pdf' only if not already present.

UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'application/pdf')
WHERE id = 'vendor-images'
  AND NOT ('application/pdf' = ANY(allowed_mime_types));

-- Verification:
--   SELECT id, allowed_mime_types FROM storage.buckets WHERE id = 'vendor-images';
--   -- expect application/pdf present alongside the four image types.
--
-- ROLLBACK:
-- UPDATE storage.buckets
-- SET allowed_mime_types = array_remove(allowed_mime_types, 'application/pdf')
-- WHERE id = 'vendor-images';
