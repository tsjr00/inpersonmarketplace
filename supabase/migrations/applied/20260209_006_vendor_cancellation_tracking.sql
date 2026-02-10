-- Track vendor order confirmation and cancellation metrics
-- Used to calculate cancellation rate and trigger warnings

-- Add tracking columns to vendor_profiles
ALTER TABLE public.vendor_profiles
  ADD COLUMN IF NOT EXISTS orders_confirmed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS orders_cancelled_after_confirm_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_warning_sent_at timestamptz;

-- Atomic increment for confirmed orders (called from vendor confirm route)
CREATE OR REPLACE FUNCTION public.increment_vendor_confirmed(p_vendor_id uuid)
RETURNS void AS $$
  UPDATE public.vendor_profiles
  SET orders_confirmed_count = orders_confirmed_count + 1
  WHERE id = p_vendor_id;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Atomic increment for cancelled-after-confirm orders
-- Returns the new counts so the caller can check thresholds
CREATE OR REPLACE FUNCTION public.increment_vendor_cancelled(p_vendor_id uuid)
RETURNS TABLE(confirmed_count integer, cancelled_count integer) AS $$
  UPDATE public.vendor_profiles
  SET orders_cancelled_after_confirm_count = orders_cancelled_after_confirm_count + 1
  WHERE id = p_vendor_id
  RETURNING orders_confirmed_count, orders_cancelled_after_confirm_count;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;
