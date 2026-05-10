-- Migration 133: Market Manager v1 schema
--
-- Adds the manager-assignment columns needed for the Market Manager
-- dashboard work (per market_manager_v2_plan.md Phase 1+2 +
-- market_manager_v1_plan.md schema section).
--
-- Manager assignment is dual-key: admin can set manager_email before
-- the user signs up. After signup, manager_user_id is backfilled
-- (logic ships in a later phase). Card / dashboard auth checks both.
--
-- Note: `market_vendors.booth_number` was originally planned to be
-- added here, but migration 001 (phase_k1_markets_tables) already
-- created the column. No re-assertion needed; existing column is used.

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS manager_email TEXT,
  ADD COLUMN IF NOT EXISTS manager_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_invited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manager_accepted_at TIMESTAMPTZ;

-- Lookup indexes — both queried on every authenticated buyer dashboard
-- load (the email index serves the OR branch when manager_user_id has
-- not been backfilled yet)
CREATE INDEX IF NOT EXISTS idx_markets_manager_email
  ON markets(LOWER(manager_email))
  WHERE manager_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_markets_manager_user_id
  ON markets(manager_user_id)
  WHERE manager_user_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
