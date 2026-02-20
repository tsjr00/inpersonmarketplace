-- Migration 039: Add 'event' as a valid market_type
-- Events are time-bounded, multi-vendor gatherings (festivals, fairs, concerts)
-- with advance ordering (FM-style), distinct from recurring parks/markets.

-- 1. Expand CHECK constraint to allow 'event'
ALTER TABLE markets DROP CONSTRAINT IF EXISTS markets_market_type_check;
ALTER TABLE markets ADD CONSTRAINT markets_market_type_check
  CHECK (market_type = ANY (ARRAY['traditional', 'private_pickup', 'event']));

-- 2. Event date columns
ALTER TABLE markets ADD COLUMN IF NOT EXISTS event_start_date DATE NULL;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS event_end_date DATE NULL;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS event_url TEXT NULL;

-- 3. Event dates required when market_type = 'event'
ALTER TABLE markets ADD CONSTRAINT markets_event_dates_check
  CHECK (
    market_type != 'event'
    OR (event_start_date IS NOT NULL AND event_end_date IS NOT NULL
        AND event_end_date >= event_start_date)
  );

-- 4. Index for querying future events
CREATE INDEX IF NOT EXISTS idx_markets_event_dates
  ON markets (vertical_id, event_start_date, event_end_date)
  WHERE market_type = 'event' AND active = true;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
