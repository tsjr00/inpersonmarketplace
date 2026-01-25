-- Migration: Add 'suspended' status to markets for admin override
-- Purpose: Allow admin to suspend private pickup locations for safety/security reasons

-- Update the CHECK constraint to include 'suspended'
ALTER TABLE markets DROP CONSTRAINT IF EXISTS markets_status_check;

ALTER TABLE markets ADD CONSTRAINT markets_status_check
  CHECK (status IN ('pending', 'active', 'inactive', 'rejected', 'suspended'));

COMMENT ON COLUMN markets.status IS 'Market status: pending, active, inactive, rejected, suspended (admin override)';
