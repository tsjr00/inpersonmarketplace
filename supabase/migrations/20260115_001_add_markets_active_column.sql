-- Migration: Add active boolean column to markets table
-- Date: 2026-01-15
-- Phase: O
-- Purpose: Fix platform admin markets management - code expects active boolean column

-- Add active column (defaults to true for existing markets)
ALTER TABLE markets
ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- Add comment
COMMENT ON COLUMN markets.active IS 'Whether market is currently active/visible to vendors and buyers';

-- Create index for filtering
CREATE INDEX IF NOT EXISTS idx_markets_active ON markets(active);

-- Update any markets with status='inactive' to have active=false
UPDATE markets
SET active = false
WHERE status = 'inactive';

-- Migration complete
