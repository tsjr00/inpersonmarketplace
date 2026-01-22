-- Migration: Allow vendors to create schedules for their traditional market suggestions
-- Date: 2026-01-22
-- Purpose: Fix RLS policy to allow vendors to INSERT schedules for markets they submitted

-- ============================================
-- Add RLS policy for traditional market suggestion schedules
-- ============================================
-- When a vendor submits a traditional market, they also need to create schedules for it

CREATE POLICY "Vendors can create schedules for their market suggestions"
    ON market_schedules FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM markets m
            JOIN vendor_profiles vp ON m.submitted_by_vendor_id = vp.id
            WHERE m.id = market_schedules.market_id
            AND m.market_type = 'traditional'
            AND m.approval_status = 'pending'
            AND vp.user_id = auth.uid()
        )
    );

-- ============================================
-- Comments
-- ============================================
COMMENT ON POLICY "Vendors can create schedules for their market suggestions" ON market_schedules IS
    'Allows vendors to create schedules for traditional markets they have submitted for approval';
