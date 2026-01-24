-- Migration: Listing Images Storage Bucket
-- Date: 2026-01-24
-- Purpose: Create storage bucket for listing images with optimized settings
-- Note: Images are resized client-side before upload (max 1200px, JPEG ~80% quality)

-- ============================================
-- PART 1: Create Storage Bucket
-- ============================================

-- Create the storage bucket for listing images
-- File size limit is 1MB since images are pre-optimized client-side
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'listing-images',
    'listing-images',
    true,  -- Public bucket so images can be displayed
    1048576,  -- 1MB limit (client resizes to ~100-300KB typically)
    ARRAY['image/jpeg', 'image/webp']  -- Only optimized formats
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- PART 2: Storage Policies
-- ============================================

-- Allow authenticated vendors to upload listing images
-- Files are stored as: listings/{listingId}/{imageId}.jpg
CREATE POLICY "Authenticated users can upload to listing-images"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'listing-images');

-- Allow authenticated users to update images in this bucket
CREATE POLICY "Authenticated users can update listing-images"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'listing-images')
    WITH CHECK (bucket_id = 'listing-images');

-- Allow authenticated users to delete images in this bucket
CREATE POLICY "Authenticated users can delete listing-images"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'listing-images');

-- Allow public read access to all listing images (bucket is public)
CREATE POLICY "Public can view listing images"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'listing-images');

-- ============================================
-- PART 3: Ensure listing_images table has proper indexes
-- ============================================

-- Index for fast lookup by listing
CREATE INDEX IF NOT EXISTS idx_listing_images_listing_id
ON listing_images(listing_id);

-- Index for ordering images
CREATE INDEX IF NOT EXISTS idx_listing_images_order
ON listing_images(listing_id, display_order);

-- Migration complete
