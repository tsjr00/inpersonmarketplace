-- Migration 072: Add is_private flag to markets
-- Supports private events (catering/pop-up) that are hidden from public browse
-- but accessible via direct URL sharing

ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;

-- Backfill: existing catering event markets should be private
UPDATE public.markets
  SET is_private = true
  WHERE catering_request_id IS NOT NULL;

-- Partial index for efficient browse page filtering
CREATE INDEX IF NOT EXISTS idx_markets_is_private
  ON public.markets (is_private)
  WHERE is_private = true;

NOTIFY pgrst, 'reload schema';
