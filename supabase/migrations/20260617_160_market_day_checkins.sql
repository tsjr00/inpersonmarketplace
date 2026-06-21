-- ============================================================================
-- Migration 160: market_day_checkins (Session 92 cont. — Growth Phase D)
-- ============================================================================
-- Vendor market-day check-in / check-out. Self-attestation primary; opt-in
-- browser geolocation is advisory corroboration (distance + within_geofence
-- recorded, NEVER blocks). One row per (market, vendor, market_date).
--
-- Capture rationale (phase_d_checkins_plan.md):
--   - start (checked_in_at) + optional end (checked_out_at) → duration on read
--   - attestation snapshot (text + version) = the compliance backbone
--   - booth/space # = value for FT park owners + FM managers
--   - location (lat/lng/accuracy) + server-computed distance_from_market_m +
--     within_geofence (advisory; RADIUS_M=250 in app code)
--   - manager_confirmed* = forward-compat columns, NO UI in v1
--
-- Visibility: vendors own their rows (RLS below). Managers / event planners read
-- attendance for THEIR market + THEIR vendors via the service client behind the
-- isMarketManager gate (no manager RLS policy needed — mirrors mig 137/157).
--
-- Additive, no backfill. ROLLBACK: DROP TABLE IF EXISTS market_day_checkins;
-- ============================================================================

CREATE TABLE IF NOT EXISTS market_day_checkins (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id              UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  vendor_profile_id      UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  market_date            DATE NOT NULL,
  checked_in_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_out_at         TIMESTAMPTZ NULL,
  method                 TEXT NOT NULL DEFAULT 'self_attest'
                           CHECK (method IN ('self_attest','geolocation','manager','qr')),
  self_attested          BOOLEAN NOT NULL DEFAULT true,
  attestation_text       TEXT NULL,
  attestation_version    TEXT NULL,
  booth_number           TEXT NULL,
  captured_latitude      NUMERIC NULL,
  captured_longitude     NUMERIC NULL,
  location_accuracy_m    NUMERIC NULL,
  distance_from_market_m NUMERIC NULL,
  within_geofence        BOOLEAN NULL,
  checkout_latitude      NUMERIC NULL,
  checkout_longitude     NUMERIC NULL,
  manager_confirmed      BOOLEAN NOT NULL DEFAULT false,
  manager_confirmed_by   UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  manager_confirmed_at   TIMESTAMPTZ NULL,
  notes                  TEXT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (market_id, vendor_profile_id, market_date)
);

CREATE INDEX IF NOT EXISTS idx_market_day_checkins_market_date
  ON market_day_checkins(market_id, market_date);
CREATE INDEX IF NOT EXISTS idx_market_day_checkins_vendor_date
  ON market_day_checkins(vendor_profile_id, market_date);

-- updated_at maintenance (existing shared trigger fn).
DROP TRIGGER IF EXISTS update_market_day_checkins_updated_at ON market_day_checkins;
CREATE TRIGGER update_market_day_checkins_updated_at
  BEFORE UPDATE ON market_day_checkins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE market_day_checkins ENABLE ROW LEVEL SECURITY;

-- Vendor own-row access (get_user_vendor_ids() is SECURITY DEFINER, mig 002).
CREATE POLICY "Vendors view own checkins" ON market_day_checkins
  FOR SELECT USING (vendor_profile_id IN (SELECT get_user_vendor_ids()));

CREATE POLICY "Vendors create own checkins" ON market_day_checkins
  FOR INSERT WITH CHECK (vendor_profile_id IN (SELECT get_user_vendor_ids()));

CREATE POLICY "Vendors update own checkins" ON market_day_checkins
  FOR UPDATE USING (vendor_profile_id IN (SELECT get_user_vendor_ids()))
  WITH CHECK (vendor_profile_id IN (SELECT get_user_vendor_ids()));

COMMENT ON TABLE market_day_checkins IS
  'Vendor market-day check-in/out. Self-attestation primary + advisory geolocation. One row per (market, vendor, market_date). Managers read their market''s rows via service client behind isMarketManager. Growth Phase D, Session 92.';
COMMENT ON COLUMN market_day_checkins.within_geofence IS
  'Advisory: distance_from_market_m <= RADIUS_M (250m in app). NULL if market/location coords missing. Never blocks check-in.';
COMMENT ON COLUMN market_day_checkins.attestation_version IS
  'Version tag of the attestation statement the vendor affirmed (snapshot pattern, mirrors vendor_market_agreement_acceptances).';

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION (run after apply):
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public' AND table_name='market_day_checkins';  -- expect 1
-- SELECT polname FROM pg_policies WHERE tablename='market_day_checkins'; -- expect 3
-- ============================================================================
