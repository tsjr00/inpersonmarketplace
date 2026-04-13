-- Migration 121: Event data integrity — CHECK + cleanup + organizer RLS
--
-- T6-1: CHECK constraint on event times (require start+end when date set)
-- T6-2: Cleanup trigger for cancelled/declined events
-- T6-3: Organizer RLS for attendee data (wave reservations + order items)
--
-- Pre-check required before applying: run
--   SELECT id, company_name FROM catering_requests
--   WHERE event_date IS NOT NULL AND (event_start_time IS NULL OR event_end_time IS NULL);
-- If rows returned, backfill times before applying.

-- ── T6-1: Event times CHECK ──────────────────────────────────────────

-- Backfill: set default times for any events missing them
UPDATE catering_requests
   SET event_start_time = COALESCE(event_start_time, '11:00:00'),
       event_end_time = COALESCE(event_end_time, '14:00:00')
 WHERE event_date IS NOT NULL
   AND (event_start_time IS NULL OR event_end_time IS NULL);

ALTER TABLE catering_requests
  ADD CONSTRAINT ck_event_requires_times
  CHECK (event_date IS NULL OR (event_start_time IS NOT NULL AND event_end_time IS NOT NULL));

-- ── T6-2: Cleanup function for cancelled/declined events ─────────────

CREATE OR REPLACE FUNCTION public.cleanup_cancelled_event()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('cancelled', 'declined') AND OLD.status NOT IN ('cancelled', 'declined') THEN
    IF NEW.market_id IS NOT NULL THEN
      -- Cancel all open wave reservations
      UPDATE event_wave_reservations
         SET status = 'cancelled'
       WHERE market_id = NEW.market_id
         AND status IN ('reserved');

      -- Decrement wave reserved_count for freed reservations and reopen full waves
      UPDATE event_waves ew
         SET reserved_count = GREATEST(0, ew.reserved_count - sub.freed),
             status = CASE WHEN ew.status = 'full' THEN 'open' ELSE ew.status END
        FROM (
          SELECT wave_id, COUNT(*) as freed
            FROM event_wave_reservations
           WHERE market_id = NEW.market_id AND status = 'cancelled'
           GROUP BY wave_id
        ) sub
       WHERE ew.id = sub.wave_id;

      -- Deactivate the market
      UPDATE markets SET active = false WHERE id = NEW.market_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_cancelled_event ON catering_requests;
CREATE TRIGGER trg_cleanup_cancelled_event
  AFTER UPDATE OF status ON catering_requests
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_cancelled_event();

COMMENT ON FUNCTION public.cleanup_cancelled_event IS 'Cleans up wave reservations and deactivates market when event is cancelled or declined. Fired by trigger on catering_requests.status change.';

-- ── T6-3: Organizer RLS for attendee data ─────────────────────────────

-- Organizer can see wave reservations for their own events
DROP POLICY IF EXISTS "organizer_read_wave_reservations" ON event_wave_reservations;
CREATE POLICY "organizer_read_wave_reservations" ON event_wave_reservations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM markets m
      JOIN catering_requests cr ON cr.id = m.catering_request_id
      WHERE m.id = event_wave_reservations.market_id
        AND cr.organizer_user_id = (SELECT auth.uid())
    )
  );

-- Organizer can see order items for their own events
DROP POLICY IF EXISTS "organizer_read_event_order_items" ON order_items;
CREATE POLICY "organizer_read_event_order_items" ON order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM markets m
      JOIN catering_requests cr ON cr.id = m.catering_request_id
      WHERE m.id = order_items.market_id
        AND m.market_type = 'event'
        AND cr.organizer_user_id = (SELECT auth.uid())
    )
  );
