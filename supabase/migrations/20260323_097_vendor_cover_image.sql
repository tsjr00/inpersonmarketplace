-- Migration 097: Add cover image for vendor profiles
-- Landscape photo of food truck, farm stand, etc.
-- Displayed below description on vendor profile page.

ALTER TABLE public.vendor_profiles
ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

COMMENT ON COLUMN public.vendor_profiles.cover_image_url IS
  'Landscape cover photo URL (food truck, farm stand, etc). Displayed on public vendor profile below description.';
