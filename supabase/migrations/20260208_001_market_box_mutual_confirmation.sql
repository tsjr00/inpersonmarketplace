-- Add mutual confirmation columns to market_box_pickups
-- Mirrors the 30-second confirmation window used for regular order handoffs:
-- Both buyer and vendor must confirm pickup within 30 seconds of each other.

ALTER TABLE public.market_box_pickups
  ADD COLUMN IF NOT EXISTS buyer_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS vendor_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_window_expires_at timestamptz;

COMMENT ON COLUMN public.market_box_pickups.buyer_confirmed_at IS 'When buyer confirmed they received the box';
COMMENT ON COLUMN public.market_box_pickups.vendor_confirmed_at IS 'When vendor confirmed they handed off the box';
COMMENT ON COLUMN public.market_box_pickups.confirmation_window_expires_at IS '30-second window for mutual confirmation - expires if other party does not confirm in time';
