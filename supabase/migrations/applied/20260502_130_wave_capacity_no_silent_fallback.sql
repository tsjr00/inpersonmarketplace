-- Migration 130: Remove silent fallback from recalculate_wave_capacity
--
-- Per Session 76 audit (D1 / F6c): the function added by migration 120
-- used COALESCE(mv.event_max_orders_per_wave, 25) — silently filling 25
-- when an accepted vendor lacked declared per-wave capacity. This violated
-- the "no silent fallbacks" rule and could cause:
--   • Over-promised capacity → buyers reserve waves the vendor can't fulfill
--   • Under-promised capacity → buyers turned away unnecessarily
--
-- This migration replaces the silent default with a hard RAISE EXCEPTION
-- if any accepted vendor is missing event_max_orders_per_wave. App-layer
-- validation at vendor/events/[marketId]/respond requires the field for
-- FT vendors at acceptance, so this should never fire in normal operation.
-- It surfaces as an explicit error if data drifts or if waves are mistakenly
-- generated for an FM event (FM has no waves — capacity is inventory-driven).
--
-- No data migration needed (Q4: no real events on prod).
-- Reversal: restore the COALESCE(..., 25) form from migration 120.

-- Preserve the original return shape from migration 120
-- (TABLE(waves_updated INTEGER, new_capacity INTEGER)) so any future caller
-- that expects the row format keeps working. CREATE OR REPLACE cannot change
-- the return type, but the shape here matches the original — no DROP needed.
CREATE OR REPLACE FUNCTION public.recalculate_wave_capacity(p_market_id UUID)
RETURNS TABLE(waves_updated INTEGER, new_capacity INTEGER) AS $$
DECLARE
  v_missing_count INTEGER;
  v_capacity INTEGER;
  v_updated INTEGER;
BEGIN
  -- Hard-error if any accepted vendor at this market lacks per-wave capacity
  SELECT COUNT(*) INTO v_missing_count
  FROM market_vendors
  WHERE market_id = p_market_id
    AND response_status = 'accepted'
    AND event_max_orders_per_wave IS NULL;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'Cannot recalculate wave capacity for market %: % accepted vendor(s) missing event_max_orders_per_wave. Vendor capacity must be declared at acceptance time.',
      p_market_id, v_missing_count;
  END IF;

  -- Sum capacity across accepted vendors (now guaranteed non-NULL)
  SELECT COALESCE(SUM(event_max_orders_per_wave), 0) INTO v_capacity
  FROM market_vendors
  WHERE market_id = p_market_id AND response_status = 'accepted';

  -- Apply to all waves at this market
  UPDATE event_waves
  SET capacity = v_capacity
  WHERE market_id = p_market_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN QUERY SELECT v_updated, v_capacity;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.recalculate_wave_capacity IS
  'Recalculates wave capacity for all waves at a market from current vendor event_max_orders_per_wave sums. Hard-errors if any accepted vendor is missing per-wave capacity (no silent fallback — see migration 130).';

-- Reload PostgREST schema cache so the new function signature is picked up
NOTIFY pgrst, 'reload schema';
