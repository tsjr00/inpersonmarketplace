-- Migration: Fix Security Linter Warnings
-- Created: 2026-01-18
-- Purpose: Address Supabase security linter errors and warnings

-- ============================================================================
-- 1. FIX: spatial_ref_sys RLS (PostGIS system table)
-- ============================================================================
-- This is a PostGIS reference table with coordinate systems. It's read-only.
ALTER TABLE IF EXISTS public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;

-- Allow public read access (it's reference data)
DROP POLICY IF EXISTS "spatial_ref_sys_select" ON public.spatial_ref_sys;
CREATE POLICY "spatial_ref_sys_select" ON public.spatial_ref_sys
    FOR SELECT USING (true);

-- ============================================================================
-- 2. FIX: create_profile_for_user function search_path
-- ============================================================================
-- Recreate with explicit search_path to prevent search_path injection attacks
CREATE OR REPLACE FUNCTION public.create_profile_for_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, email, display_name, roles)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    ARRAY['buyer']::user_role[]
  );
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. FIX: fulfillments RLS policies (overly permissive)
-- ============================================================================
-- Drop the permissive policies
DROP POLICY IF EXISTS "fulfillments_insert" ON public.fulfillments;
DROP POLICY IF EXISTS "fulfillments_update" ON public.fulfillments;
DROP POLICY IF EXISTS "fulfillments_delete" ON public.fulfillments;

-- Create proper restrictive policies

-- Vendors can insert fulfillments for their own transactions
CREATE POLICY "fulfillments_insert" ON public.fulfillments
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM transactions t
            JOIN vendor_profiles vp ON t.vendor_profile_id = vp.id
            WHERE t.id = transaction_id
            AND vp.user_id = auth.uid()
        )
    );

-- Vendors can update their own fulfillments
CREATE POLICY "fulfillments_update" ON public.fulfillments
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM transactions t
            JOIN vendor_profiles vp ON t.vendor_profile_id = vp.id
            WHERE t.id = transaction_id
            AND vp.user_id = auth.uid()
        )
    );

-- Only admins can delete fulfillments
CREATE POLICY "fulfillments_delete" ON public.fulfillments
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid()
            AND (role = 'admin' OR 'admin' = ANY(roles))
        )
    );

-- ============================================================================
-- NOTE: extension_in_public (postgis) - This is informational only
-- Moving PostGIS to another schema can break existing queries.
-- It's safe to leave in public schema for this application.
-- ============================================================================
