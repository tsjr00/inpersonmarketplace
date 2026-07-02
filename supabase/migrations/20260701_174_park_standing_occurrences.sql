-- ============================================================================
-- Migration 174: standing-reservation occurrences + strike support (FT P4b, sub-commit 1)
-- ============================================================================
-- Wires the recurring-reservation lifecycle (mig 173) to the booking record
-- (mig 172) so a daily generator can materialize the next occurrence and the
-- compute-on-read strike engine can attribute strikes. ADDITIVE, no backfill.
--
-- (1) park_spot_bookings.standing_reservation_id — marks a booking as an
--     auto-generated occurrence of a standing hold + is the key the strike
--     engine reads (missed-prepay + no-show both attribute back to the hold).
--     NULL for ordinary one-off / prepay-week bookings (existing flow untouched).
--
-- (2) park_spot_bookings.status gains 'expired' — a generated occurrence left
--     unpaid past the prepay cutoff flips pending_payment -> 'expired'. Because
--     the two uniqueness indexes (mig 172) are PARTIAL over
--     status IN ('pending_payment','paid'), flipping to 'expired' RELEASES the
--     spot+date back to the open pool (design line 153) while the row survives
--     as a countable strike (distinct from a manager/vendor 'cancelled').
--
-- (3) park_standing_reservations.strikes_reset_at — manager "reset" baseline for
--     the compute-on-read engine: strikes are counted only for events after this
--     timestamp (NULL = count the full rolling 32-day window). No strike table.
--
-- Dependencies: mig 172 (park_spot_bookings), mig 173 (park_standing_reservations).
-- ============================================================================
-- ROLLBACK (single transaction):
--   BEGIN;
--     -- NOTE: if any rows have status='expired', re-point them first
--     --   (UPDATE park_spot_bookings SET status='cancelled' WHERE status='expired';)
--     --   or the CHECK re-add below will fail.
--     ALTER TABLE park_spot_bookings DROP CONSTRAINT IF EXISTS park_spot_bookings_status_check;
--     ALTER TABLE park_spot_bookings ADD CONSTRAINT park_spot_bookings_status_check
--       CHECK (status IN ('pending_payment','paid','cancelled','completed'));
--     DROP INDEX IF EXISTS idx_park_spot_bookings_standing;
--     ALTER TABLE park_spot_bookings DROP COLUMN IF EXISTS standing_reservation_id;
--     ALTER TABLE park_standing_reservations DROP COLUMN IF EXISTS strikes_reset_at;
--     NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ============================================================================

-- (1) occurrence attribution key
ALTER TABLE park_spot_bookings
  ADD COLUMN IF NOT EXISTS standing_reservation_id UUID NULL
    REFERENCES park_standing_reservations(id) ON DELETE SET NULL;

COMMENT ON COLUMN park_spot_bookings.standing_reservation_id IS
  'FT P4b: if set, this booking is an auto-generated occurrence of a standing (recurring) hold. Key the compute-on-read strike engine reads to attribute missed-prepay (expired) + no-show strikes back to the hold. NULL for ordinary one-off / prepay-week bookings.';

CREATE INDEX IF NOT EXISTS idx_park_spot_bookings_standing
  ON park_spot_bookings(standing_reservation_id)
  WHERE standing_reservation_id IS NOT NULL;

-- (2) add 'expired' to the status domain (inline CHECK from mig 172 is
--     auto-named park_spot_bookings_status_check)
ALTER TABLE park_spot_bookings DROP CONSTRAINT IF EXISTS park_spot_bookings_status_check;
ALTER TABLE park_spot_bookings ADD CONSTRAINT park_spot_bookings_status_check
  CHECK (status IN ('pending_payment','paid','cancelled','completed','expired'));

-- (3) manager reset baseline for the strike engine
ALTER TABLE park_standing_reservations
  ADD COLUMN IF NOT EXISTS strikes_reset_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN park_standing_reservations.strikes_reset_at IS
  'FT P4b: manager-reset baseline. The compute-on-read strike engine counts only strike events (expired occurrences + no-shows) with event_time > strikes_reset_at. NULL = count the full rolling 32-day window.';

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION (run after apply):
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='park_spot_bookings' AND column_name='standing_reservation_id'; -- 1
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='park_standing_reservations' AND column_name='strikes_reset_at'; -- 1
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname='park_spot_bookings_status_check';  -- includes 'expired'
-- ============================================================================
