-- Migration: Add RLS policy for vendors to manage their private pickup schedules
-- Purpose: Allow vendors to INSERT/UPDATE/DELETE schedules for their own private pickup markets

-- Vendors can manage schedules for their own private pickup markets
CREATE POLICY "Vendors can manage their private pickup schedules"
    ON market_schedules FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM markets m
            JOIN vendor_profiles vp ON m.vendor_profile_id = vp.id
            WHERE m.id = market_schedules.market_id
            AND m.market_type = 'private_pickup'
            AND vp.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM markets m
            JOIN vendor_profiles vp ON m.vendor_profile_id = vp.id
            WHERE m.id = market_schedules.market_id
            AND m.market_type = 'private_pickup'
            AND vp.user_id = auth.uid()
        )
    );
