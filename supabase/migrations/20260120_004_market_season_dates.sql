-- Migration: Add season opening/closing dates to markets
-- Purpose: Track when traditional markets open and close for the season

ALTER TABLE markets
ADD COLUMN IF NOT EXISTS season_start DATE,
ADD COLUMN IF NOT EXISTS season_end DATE;

COMMENT ON COLUMN markets.season_start IS 'Date when the market season begins (e.g., first market day of the year)';
COMMENT ON COLUMN markets.season_end IS 'Date when the market season ends (e.g., last market day of the year)';
