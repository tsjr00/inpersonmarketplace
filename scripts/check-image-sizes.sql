-- Query to get listing images for a specific vendor
-- Run this in Supabase SQL Editor

-- Find Premium Test Farm vendor and their images
SELECT
  vp.id as vendor_id,
  (vp.profile_data->>'business_name') as vendor_name,
  (vp.profile_data->>'farm_name') as farm_name,
  l.id as listing_id,
  l.title as listing_title,
  li.id as image_id,
  li.url as image_url,
  li.storage_path,
  li.created_at
FROM vendor_profiles vp
JOIN listings l ON l.vendor_profile_id = vp.id
JOIN listing_images li ON li.listing_id = l.id
WHERE
  vp.profile_data->>'business_name' ILIKE '%premium%test%'
  OR vp.profile_data->>'farm_name' ILIKE '%premium%test%'
ORDER BY li.created_at DESC;

-- Check file sizes from storage.objects table
-- This includes the actual file size in bytes
SELECT
  li.url,
  li.storage_path,
  so.metadata->>'size' as size_bytes,
  ROUND((so.metadata->>'size')::numeric / 1024, 1) as size_kb,
  so.metadata->>'mimetype' as mime_type,
  so.created_at as uploaded_at
FROM listing_images li
LEFT JOIN storage.objects so ON so.name = li.storage_path AND so.bucket_id = 'listing-images'
ORDER BY li.created_at DESC
LIMIT 20;
