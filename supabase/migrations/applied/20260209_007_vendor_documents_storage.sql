-- Migration: Vendor Documents Storage Bucket
-- Date: 2026-02-09
-- Purpose: Create storage bucket for vendor certification documents (permits, licenses, registrations)
-- Specs: PDF/JPG/PNG, 10MB max, public bucket (business permits are not highly sensitive)

-- ============================================
-- PART 1: Create Storage Bucket
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'vendor-documents',
    'vendor-documents',
    true,  -- Public bucket — these are business permits/licenses
    10485760,  -- 10MB limit
    ARRAY['image/jpeg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- PART 2: Storage Policies
-- ============================================

-- Allow authenticated vendors to upload documents
-- The API route verifies vendor ownership before uploading
-- Files are stored as: certifications/{vendorId}/{timestamp}.{ext}
CREATE POLICY "Authenticated users can upload to vendor-documents"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'vendor-documents');

-- Allow authenticated users to update documents in this bucket
CREATE POLICY "Authenticated users can update vendor-documents"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'vendor-documents')
    WITH CHECK (bucket_id = 'vendor-documents');

-- Allow authenticated users to delete documents in this bucket
CREATE POLICY "Authenticated users can delete vendor-documents"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'vendor-documents');

-- Allow public read access to vendor documents (business permits/licenses)
CREATE POLICY "Public can view vendor documents"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'vendor-documents');

-- Migration complete
