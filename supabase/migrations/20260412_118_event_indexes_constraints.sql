-- Migration 118: Event system indexes + constraints
--
-- S-1: 7 missing indexes on frequently-queried event columns
-- S-2: FK constraint on catering_requests.organizer_user_id
-- S-3: CHECK constraint on event_wave_reservations (ordered → order_id required)
--
-- Pre-verified: no orphaned organizer_user_ids, no reservations
-- in 'ordered' status with null order_id (checked prod + staging).

-- ── S-1: Indexes ──────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_catering_requests_organizer
  ON catering_requests(organizer_user_id)
  WHERE organizer_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catering_requests_status_created
  ON catering_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_wave_reservations_status
  ON event_wave_reservations(status);

CREATE INDEX IF NOT EXISTS idx_event_company_payments_catering
  ON event_company_payments(catering_request_id);

CREATE INDEX IF NOT EXISTS idx_market_vendors_backup
  ON market_vendors(market_id, is_backup, backup_priority)
  WHERE is_backup = true;

CREATE INDEX IF NOT EXISTS idx_orders_wave_reservation
  ON orders(event_wave_reservation_id)
  WHERE event_wave_reservation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_markets_catering_request
  ON markets(catering_request_id)
  WHERE catering_request_id IS NOT NULL;

-- ── S-2: FK on organizer_user_id ──────────────────────────────────────

ALTER TABLE catering_requests
  ADD CONSTRAINT fk_catering_requests_organizer
  FOREIGN KEY (organizer_user_id) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ── S-3: CHECK on event_wave_reservations ─────────────────────────────

ALTER TABLE event_wave_reservations
  ADD CONSTRAINT ck_ordered_requires_order_id
  CHECK (status != 'ordered' OR order_id IS NOT NULL);
