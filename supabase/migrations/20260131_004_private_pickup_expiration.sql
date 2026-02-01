-- Add expiration date for private pickup locations
-- Allows vendors to set a date after which a pickup location is no longer visible
-- Useful for one-time events or temporary locations

-- Add expires_at column to markets table
ALTER TABLE markets
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NULL;

-- Add comment explaining the field
COMMENT ON COLUMN markets.expires_at IS 'Optional expiration date for private pickup locations. If set, location is hidden after this date. NULL means permanent/recurring.';

-- Create index for efficient filtering of non-expired markets
CREATE INDEX IF NOT EXISTS idx_markets_expires_at
ON markets (expires_at)
WHERE expires_at IS NOT NULL;

-- Create a view for active markets (not expired)
-- This simplifies queries throughout the application
CREATE OR REPLACE VIEW active_markets AS
SELECT *
FROM markets
WHERE status = 'active'
  AND (expires_at IS NULL OR expires_at > NOW());

-- Grant access to the view
GRANT SELECT ON active_markets TO authenticated;
GRANT SELECT ON active_markets TO anon;
