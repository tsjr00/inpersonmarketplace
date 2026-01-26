-- Migration: Fix Fulfillments RLS Policies (Round 2)
-- Created: 2026-01-26
-- Purpose: Replace overly permissive RLS policies on fulfillments table
--
-- The Supabase security linter flagged:
--   - fulfillments_delete with USING (true)
--   - fulfillments_insert with WITH CHECK (true)
--   - fulfillments_update with both USING (true) and WITH CHECK (true)
--
-- These allow unrestricted access and bypass row-level security.

-- ============================================================================
-- 1. Drop existing permissive policies
-- ============================================================================

DROP POLICY IF EXISTS "fulfillments_insert" ON public.fulfillments;
DROP POLICY IF EXISTS "fulfillments_update" ON public.fulfillments;
DROP POLICY IF EXISTS "fulfillments_delete" ON public.fulfillments;

-- Also drop any other fulfillment policies that might exist
DROP POLICY IF EXISTS "Vendors can insert fulfillments" ON public.fulfillments;
DROP POLICY IF EXISTS "Vendors can update fulfillments" ON public.fulfillments;
DROP POLICY IF EXISTS "Vendors can delete fulfillments" ON public.fulfillments;
DROP POLICY IF EXISTS "Admins can manage fulfillments" ON public.fulfillments;

-- ============================================================================
-- 2. Ensure RLS is enabled
-- ============================================================================

ALTER TABLE public.fulfillments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. Create proper restrictive policies
-- ============================================================================

-- Vendors can INSERT fulfillments for their own transactions
CREATE POLICY "fulfillments_vendor_insert" ON public.fulfillments
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM transactions t
            JOIN vendor_profiles vp ON t.vendor_profile_id = vp.id
            WHERE t.id = transaction_id
            AND vp.user_id = auth.uid()
        )
    );

-- Vendors can UPDATE their own fulfillments
CREATE POLICY "fulfillments_vendor_update" ON public.fulfillments
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM transactions t
            JOIN vendor_profiles vp ON t.vendor_profile_id = vp.id
            WHERE t.id = transaction_id
            AND vp.user_id = auth.uid()
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM transactions t
            JOIN vendor_profiles vp ON t.vendor_profile_id = vp.id
            WHERE t.id = transaction_id
            AND vp.user_id = auth.uid()
        )
    );

-- Only admins can DELETE fulfillments (rare operation, audit sensitive)
CREATE POLICY "fulfillments_admin_delete" ON public.fulfillments
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid()
            AND 'admin' = ANY(roles)
        )
    );

-- Admins can also INSERT/UPDATE fulfillments (for support operations)
CREATE POLICY "fulfillments_admin_insert" ON public.fulfillments
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid()
            AND 'admin' = ANY(roles)
        )
    );

CREATE POLICY "fulfillments_admin_update" ON public.fulfillments
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid()
            AND 'admin' = ANY(roles)
        )
    );

-- ============================================================================
-- 4. Ensure SELECT policy exists (buyers and vendors can view)
-- ============================================================================

-- Check if select policy exists, if not create one
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'fulfillments'
        AND policyname LIKE '%select%'
    ) THEN
        CREATE POLICY "fulfillments_select" ON public.fulfillments
            FOR SELECT USING (
                -- Vendors can see their fulfillments
                EXISTS (
                    SELECT 1 FROM transactions t
                    JOIN vendor_profiles vp ON t.vendor_profile_id = vp.id
                    WHERE t.id = transaction_id
                    AND vp.user_id = auth.uid()
                )
                OR
                -- Buyers can see their transaction's fulfillments
                EXISTS (
                    SELECT 1 FROM transactions t
                    WHERE t.id = transaction_id
                    AND t.buyer_user_id = auth.uid()
                )
                OR
                -- Admins can see all
                EXISTS (
                    SELECT 1 FROM user_profiles
                    WHERE user_id = auth.uid()
                    AND 'admin' = ANY(roles)
                )
            );
    END IF;
END $$;

-- ============================================================================
-- Done!
-- ============================================================================

COMMENT ON TABLE public.fulfillments IS 'Tracks fulfillment status for transactions. RLS restricts access to transaction participants and admins.';
