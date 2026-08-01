-- Migration 191: recalculate_wave_capacity — exclude backups + recompute wave status
--
-- EVT-9 (pre-re-release review, slice 5 — FINDINGS_LEDGER.md):
-- Wave capacity was effectively write-once and drifted from reality:
--   1. recalculate_wave_capacity (mig 120, hardened in mig 130) had NO caller
--      anywhere in app code — vendor cancellations never reduced capacity.
--   2. It counted BACKUP vendors: the organizer select flow marks non-selected
--      vendors is_backup=true but leaves them response_status='accepted', so
--      the sum over accepted vendors over-promised capacity the selected
--      vendors can't fulfill. (generateEventWaves had the same bug — fixed in
--      the companion code commit.)
--   3. A capacity change never touched event_waves.status, so a 'full' wave
--      stayed unreservable after a capacity raise (reserve_event_wave requires
--      status='open'), and a capacity cut could leave an over-committed wave
--      marked 'open'.
--
-- This replace:
--   - excludes backups: COALESCE(is_backup, false) = false
--   - keeps the mig-130 hard RAISE when a counted vendor lacks
--     event_max_orders_per_wave (no silent fallback)
--   - recomputes status from reserved_count vs the new capacity, touching
--     ONLY the open/full pair (any other status value is left alone)
--
-- Companion code (same commit): generateEventWaves excludes backups; the RPC
-- is now actually CALLED from vendor commitment-cancel, vendor respond
-- (accept), and organizer select (after backups are marked), each guarded to
-- events that have waves.
--
-- CREATE OR REPLACE retains existing grants (service_role only, migs 149/152).

CREATE OR REPLACE FUNCTION public.recalculate_wave_capacity(p_market_id UUID)
RETURNS TABLE(waves_updated INTEGER, new_capacity INTEGER) AS $$
DECLARE
  v_missing_count INTEGER;
  v_capacity INTEGER;
  v_updated INTEGER;
BEGIN
  -- Hard-error if any counted (accepted, non-backup) vendor lacks per-wave
  -- capacity — no silent fallback (mig 130 rule).
  SELECT COUNT(*) INTO v_missing_count
  FROM market_vendors
  WHERE market_id = p_market_id
    AND response_status = 'accepted'
    AND COALESCE(is_backup, false) = false
    AND event_max_orders_per_wave IS NULL;

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'Cannot recalculate wave capacity for market %: % accepted vendor(s) missing event_max_orders_per_wave. Vendor capacity must be declared at acceptance time.',
      p_market_id, v_missing_count;
  END IF;

  -- Sum capacity across ACTIVE accepted vendors only (backups excluded —
  -- they serve no orders unless escalated, at which point is_backup flips
  -- false and a re-run counts them).
  SELECT COALESCE(SUM(event_max_orders_per_wave), 0) INTO v_capacity
  FROM market_vendors
  WHERE market_id = p_market_id
    AND response_status = 'accepted'
    AND COALESCE(is_backup, false) = false;

  -- Apply to all waves at this market and recompute open/full from the new
  -- capacity. Only the open<->full pair is touched.
  UPDATE event_waves
  SET capacity = v_capacity,
      status = CASE
        WHEN status IN ('open', 'full') AND reserved_count >= v_capacity THEN 'full'
        WHEN status IN ('open', 'full') AND reserved_count < v_capacity THEN 'open'
        ELSE status
      END
  WHERE market_id = p_market_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN QUERY SELECT v_updated, v_capacity;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.recalculate_wave_capacity IS
  'Recalculates wave capacity for all waves at a market from ACTIVE (non-backup) accepted vendors'' event_max_orders_per_wave sums, and recomputes open/full status. Hard-errors if any counted vendor is missing per-wave capacity (no silent fallback — migs 130/191). Called from vendor commitment-cancel, vendor accept, and organizer select.';

NOTIFY pgrst, 'reload schema';

-- ROLLBACK: re-apply the mig-130 body (counts backups, never touches status):
--   see supabase/migrations/applied/20260502_130_wave_capacity_no_silent_fallback.sql
