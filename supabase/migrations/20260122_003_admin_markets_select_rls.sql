-- Migration: Allow admins to SELECT all markets (including pending)
-- Date: 2026-01-22
-- Purpose: Fix RLS policy so admins can see vendor-submitted markets pending approval

-- ============================================
-- Add explicit SELECT policy for admins
-- ============================================
-- The existing "Markets manageable by admins" uses FOR ALL but may not be
-- correctly allowing SELECT of pending markets. This adds an explicit policy.

-- First, check if the is_admin function exists (from base RLS migration)
-- If not, create a helper function for the check

-- Drop existing SELECT-specific admin policy if it exists (to avoid conflict)
DROP POLICY IF EXISTS "Admins can view all markets" ON markets;

-- Create explicit SELECT policy for admins
CREATE POLICY "Admins can view all markets"
    ON markets FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            WHERE up.user_id = auth.uid()
            AND ('admin' = ANY(up.roles) OR up.role = 'admin')
        )
    );

-- ============================================
-- Also allow vendors to see their own pending market submissions
-- ============================================
DROP POLICY IF EXISTS "Vendors can view their submitted markets" ON markets;

CREATE POLICY "Vendors can view their submitted markets"
    ON markets FOR SELECT
    USING (
        submitted_by_vendor_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM vendor_profiles vp
            WHERE vp.id = markets.submitted_by_vendor_id
            AND vp.user_id = auth.uid()
        )
    );

-- ============================================
-- Comments
-- ============================================
COMMENT ON POLICY "Admins can view all markets" ON markets IS
    'Allows admins to view all markets regardless of active or approval status';

COMMENT ON POLICY "Vendors can view their submitted markets" ON markets IS
    'Allows vendors to view markets they submitted (to see approval status)';
