-- ============================================================================
-- Migration: Add Market Status Enum and Vendor Submission Fields
-- Created: 2026-01-17
-- Purpose: Support vendor-submitted markets with approval workflow
-- ============================================================================

-- Add status column (text, not enum, for flexibility)
-- Values: 'pending', 'active', 'inactive', 'rejected'
ALTER TABLE markets
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Add constraint for valid status values
ALTER TABLE markets DROP CONSTRAINT IF EXISTS valid_market_status;
ALTER TABLE markets ADD CONSTRAINT valid_market_status
  CHECK (status IN ('pending', 'active', 'inactive', 'rejected'));

COMMENT ON COLUMN markets.status IS 'Market status: pending (awaiting admin approval), active, inactive, rejected';

-- Migrate existing data: active=true -> status='active', active=false -> status='inactive'
UPDATE markets
SET status = CASE WHEN active = true THEN 'active' ELSE 'inactive' END
WHERE status IS NULL OR status = '';

-- Add vendor submission tracking fields
ALTER TABLE markets
ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES user_profiles(user_id),
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES user_profiles(user_id),
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

COMMENT ON COLUMN markets.submitted_by IS 'User who submitted this market for approval (vendor)';
COMMENT ON COLUMN markets.submitted_at IS 'When the market was submitted';
COMMENT ON COLUMN markets.reviewed_by IS 'Admin who approved/rejected the market';
COMMENT ON COLUMN markets.reviewed_at IS 'When the review decision was made';
COMMENT ON COLUMN markets.rejection_reason IS 'Optional reason for rejection';

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);
CREATE INDEX IF NOT EXISTS idx_markets_submitted_by ON markets(submitted_by);
CREATE INDEX IF NOT EXISTS idx_markets_pending ON markets(status, vertical_id) WHERE status = 'pending';

-- Note: The 'active' boolean column is kept for backward compatibility
-- Code should transition to using 'status' column for more granular control

-- ============================================================================
-- END MIGRATION
-- ============================================================================
