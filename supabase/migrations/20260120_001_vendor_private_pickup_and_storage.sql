-- Migration: Vendor Private Pickup RLS & Image Storage
-- Date: 2026-01-20
-- Purpose: Allow vendors to create private pickup locations and upload profile images

-- ============================================
-- PART 1: Vendor Private Pickup RLS Policy
-- ============================================
-- Vendors need to INSERT into markets table to create their private pickup locations
-- Currently only admins have INSERT permission

-- Drop existing admin-only policy if it exists (we'll recreate with better scoping)
DROP POLICY IF EXISTS "Markets manageable by admins" ON markets;

-- Admin full access policy
CREATE POLICY "Admins can manage all markets"
    ON markets FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid()
            AND (role = 'admin' OR 'admin' = ANY(roles))
        )
    );

-- Vendors can create their own private pickup locations
CREATE POLICY "Vendors can create private pickup locations"
    ON markets FOR INSERT
    WITH CHECK (
        market_type = 'private_pickup'
        AND EXISTS (
            SELECT 1 FROM vendor_profiles vp
            WHERE vp.id = markets.vendor_profile_id
            AND vp.user_id = auth.uid()
        )
    );

-- Vendors can update their own private pickup locations
CREATE POLICY "Vendors can update own private pickup locations"
    ON markets FOR UPDATE
    USING (
        market_type = 'private_pickup'
        AND EXISTS (
            SELECT 1 FROM vendor_profiles vp
            WHERE vp.id = markets.vendor_profile_id
            AND vp.user_id = auth.uid()
        )
    )
    WITH CHECK (
        market_type = 'private_pickup'
        AND EXISTS (
            SELECT 1 FROM vendor_profiles vp
            WHERE vp.id = markets.vendor_profile_id
            AND vp.user_id = auth.uid()
        )
    );

-- Vendors can delete their own private pickup locations
CREATE POLICY "Vendors can delete own private pickup locations"
    ON markets FOR DELETE
    USING (
        market_type = 'private_pickup'
        AND EXISTS (
            SELECT 1 FROM vendor_profiles vp
            WHERE vp.id = markets.vendor_profile_id
            AND vp.user_id = auth.uid()
        )
    );

-- ============================================
-- PART 2: Vendor Images Storage Bucket
-- ============================================

-- Create the storage bucket for vendor images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'vendor-images',
    'vendor-images',
    true,  -- Public bucket so images can be displayed
    5242880,  -- 5MB limit
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated vendors to upload images
-- The API route verifies vendor ownership before uploading
-- Files are stored as: vendor-profiles/{vendorId}-{timestamp}.{ext}
CREATE POLICY "Authenticated users can upload to vendor-images"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'vendor-images');

-- Allow authenticated users to update images in this bucket
CREATE POLICY "Authenticated users can update vendor-images"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'vendor-images')
    WITH CHECK (bucket_id = 'vendor-images');

-- Allow authenticated users to delete images in this bucket
CREATE POLICY "Authenticated users can delete vendor-images"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'vendor-images');

-- Allow public read access to all vendor images (bucket is public)
CREATE POLICY "Public can view vendor images"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'vendor-images');

-- Migration complete
