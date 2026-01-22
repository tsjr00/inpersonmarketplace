-- Migration: Allow vendors to submit traditional market suggestions
-- Date: 2026-01-22
-- Purpose: Fix RLS policy to allow vendors to INSERT traditional markets with pending approval status

-- ============================================
-- Add RLS policy for traditional market suggestions
-- ============================================
-- Vendors need to be able to submit traditional market suggestions
-- These will have approval_status = 'pending' and submitted_by_vendor_id set

CREATE POLICY "Vendors can suggest traditional markets"
    ON markets FOR INSERT
    WITH CHECK (
        market_type = 'traditional'
        AND approval_status = 'pending'
        AND submitted_by_vendor_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM vendor_profiles vp
            WHERE vp.id = markets.submitted_by_vendor_id
            AND vp.user_id = auth.uid()
            AND vp.status = 'approved'
        )
    );

-- ============================================
-- Comments
-- ============================================
COMMENT ON POLICY "Vendors can suggest traditional markets" ON markets IS
    'Allows approved vendors to submit traditional market suggestions for admin review';
