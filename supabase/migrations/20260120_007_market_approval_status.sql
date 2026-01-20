-- Migration: Add approval status for traditional markets
-- Purpose: Allow vendors to submit traditional markets for admin approval
--
-- Workflow:
--   - Vendor submits a traditional market → status = 'pending'
--   - Admin reviews and approves → status = 'approved' (visible on markets page)
--   - Admin rejects → status = 'rejected'
--   - Private pickup locations: status = 'approved' by default (no approval needed)

-- ============================================================================
-- ADD STATUS COLUMN
-- ============================================================================

-- Create enum for market approval status
DO $$ BEGIN
    CREATE TYPE market_approval_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add status column to markets table
ALTER TABLE markets
ADD COLUMN IF NOT EXISTS approval_status market_approval_status DEFAULT 'approved';

-- Add submitted_by to track which vendor submitted the market
ALTER TABLE markets
ADD COLUMN IF NOT EXISTS submitted_by_vendor_id UUID REFERENCES vendor_profiles(id);

-- Add rejection reason for admin feedback
ALTER TABLE markets
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Add submitted_at timestamp
ALTER TABLE markets
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

-- ============================================================================
-- SET EXISTING MARKETS TO APPROVED
-- ============================================================================

-- All existing markets should be approved (they were created by admin or seed)
UPDATE markets SET approval_status = 'approved' WHERE approval_status IS NULL;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN markets.approval_status IS 'Approval status: pending (awaiting admin review), approved (visible on markets page), rejected';
COMMENT ON COLUMN markets.submitted_by_vendor_id IS 'Vendor who submitted this market for approval (for traditional markets)';
COMMENT ON COLUMN markets.rejection_reason IS 'Admin reason for rejecting a market submission';
COMMENT ON COLUMN markets.submitted_at IS 'When the market was submitted for approval';
