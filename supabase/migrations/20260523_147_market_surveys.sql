-- Migration 147: Post-market surveys (Phase E)
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
--   DROP TABLE IF EXISTS market_surveys;
--   ALTER TABLE user_profiles DROP COLUMN IF EXISTS survey_emails_opted_out;
-- COMMIT;
--
-- Pre-application risk:
--   Zero on empty data. Once managers/admins start reading aggregated
--   results, rollback drops the data permanently. Safe on Dev/Staging
--   before Prod gets it.
--
-- Dependencies:
--   - mig 001 (vendor_profiles, markets)
--   - mig 133 (markets.manager_email, manager_user_id — admin tab uses these)
--   - mig 140 (markets.logo_url — referenced from email templates Stage 2)
--   - mig 145 (market_vendors — for vendor attendance lookup in cron Stage 2)
-- =============================================================================
--
-- What this migration creates:
--
-- 1. `market_surveys` table — single table for both VENDOR and BUYER surveys
--    via a `kind` discriminator. One row per (audience, market, date)
--    enforced by two UNIQUE NULLS NOT DISTINCT constraints. Each row goes
--    through lifecycle: created (cron INSERT) → notified_at stamped →
--    submitted_at + ratings + comment filled (user POST).
--
--    Audience model:
--      - kind='vendor': vendor_profile_id set, buyer_user_id NULL
--      - kind='buyer':  buyer_user_id set, vendor_profile_id NULL
--      - CHECK constraint enforces exactly one populated per kind
--
--    Category ratings (separate columns per Session 84 D6 decision —
--    easier aggregation):
--      Shared:        rating_overall (1-5)
--      Vendor-only:   rating_foot_traffic, rating_sales,
--                     rating_market_organization, rating_manager_support
--      Buyer-only:    rating_variety, rating_quality, rating_atmosphere,
--                     rating_layout, rating_accessibility
--
--    All ratings NULL until submitted. App layer enforces "all required
--    categories filled before submit" — DB allows partial fills so a
--    draft state would technically be storable, but the UI doesn't
--    expose drafting for v1.
--
--    Buyer access via opaque token (32 random chars stored in
--    access_token); vendor access via auth (no token needed).
--
-- 2. `user_profiles.survey_emails_opted_out` (BOOLEAN, default FALSE) —
--    one-click unsubscribe target. Vendor surveys are not opt-out (it's
--    part of being on the platform); only buyer survey emails honor
--    this flag. The cron Stage 2 checks this before sending buyer
--    emails. In-app notifications still fire for opted-out users.
--
-- 3. RLS: default-deny via service-role. Managers/admins read via API
--    routes that use service client. Vendors/buyers read their own
--    via API routes that filter by auth.uid()/vendor_profile_id.
--    Token-based reads (anonymous buyer) bypass RLS via service client.
--    Following the same pattern as mig 137 (market manager tables).

-- ----------------------------------------------------------------------------
-- 1. market_surveys table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS market_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Discriminator + audience
  kind TEXT NOT NULL CHECK (kind IN ('vendor', 'buyer')),
  vendor_profile_id UUID NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  buyer_user_id     UUID NULL REFERENCES auth.users(id)      ON DELETE CASCADE,

  CONSTRAINT ck_market_surveys_audience_xor CHECK (
       (kind = 'vendor' AND vendor_profile_id IS NOT NULL AND buyer_user_id     IS NULL)
    OR (kind = 'buyer'  AND buyer_user_id     IS NOT NULL AND vendor_profile_id IS NULL)
  ),

  -- Market context
  market_id   UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  market_date DATE NOT NULL,

  -- Access controls
  access_token TEXT NULL,                          -- buyer only; vendor uses auth
  expires_at   TIMESTAMPTZ NOT NULL,               -- 30 days from market_date

  -- Response: shared overall rating
  rating_overall INTEGER NULL CHECK (rating_overall BETWEEN 1 AND 5),

  -- Response: vendor category ratings (NULL when kind='buyer')
  rating_foot_traffic         INTEGER NULL CHECK (rating_foot_traffic         BETWEEN 1 AND 5),
  rating_sales                INTEGER NULL CHECK (rating_sales                BETWEEN 1 AND 5),
  rating_market_organization  INTEGER NULL CHECK (rating_market_organization  BETWEEN 1 AND 5),
  rating_manager_support      INTEGER NULL CHECK (rating_manager_support      BETWEEN 1 AND 5),

  -- Response: buyer category ratings (NULL when kind='vendor')
  rating_variety       INTEGER NULL CHECK (rating_variety       BETWEEN 1 AND 5),
  rating_quality       INTEGER NULL CHECK (rating_quality       BETWEEN 1 AND 5),
  rating_atmosphere    INTEGER NULL CHECK (rating_atmosphere    BETWEEN 1 AND 5),
  rating_layout        INTEGER NULL CHECK (rating_layout        BETWEEN 1 AND 5),
  rating_accessibility INTEGER NULL CHECK (rating_accessibility BETWEEN 1 AND 5),

  -- Shared comment + submission stamp
  comment      TEXT NULL,
  submitted_at TIMESTAMPTZ NULL,

  -- Audit
  notified_at  TIMESTAMPTZ NULL,                   -- when cron sent the request
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Uniqueness: one survey per (audience, market, date)
  CONSTRAINT uq_market_surveys_vendor UNIQUE NULLS NOT DISTINCT
    (vendor_profile_id, market_id, market_date),
  CONSTRAINT uq_market_surveys_buyer  UNIQUE NULLS NOT DISTINCT
    (buyer_user_id, market_id, market_date)
);

COMMENT ON TABLE market_surveys IS
  'Mig 147 / Phase E: post-market surveys, one row per (audience, market, date). Cron creates rows after each market day; vendors/buyers fill them out via auth or tokenized link respectively. Manager/admin read aggregated results. See src/lib/surveys/types.ts for category metadata.';

COMMENT ON COLUMN market_surveys.kind IS
  'Discriminator: ''vendor'' or ''buyer''. The CHECK constraint ck_market_surveys_audience_xor enforces exactly one of vendor_profile_id / buyer_user_id is populated per kind. Category columns are NULLed for the other kind (e.g., a buyer survey has rating_foot_traffic = NULL forever).';

COMMENT ON COLUMN market_surveys.access_token IS
  '32-character opaque random token for anonymous buyer access. URL: /[vertical]/survey/<token>. Vendor surveys use auth instead — access_token is NULL for kind=vendor.';

COMMENT ON COLUMN market_surveys.expires_at IS
  '30 days after market_date. After expiry, the survey cannot be submitted. Existing submissions still readable in aggregate.';

-- ----------------------------------------------------------------------------
-- 2. Indexes
-- ----------------------------------------------------------------------------

-- Manager + admin results aggregation (per market, by date)
CREATE INDEX IF NOT EXISTS idx_market_surveys_market_date
  ON market_surveys (market_id, market_date);

-- Vendor "my pending surveys" lookup (used by dashboard banner + page)
CREATE INDEX IF NOT EXISTS idx_market_surveys_vendor_pending
  ON market_surveys (vendor_profile_id, expires_at)
  WHERE submitted_at IS NULL AND kind = 'vendor';

-- Buyer "my pending surveys" lookup (signed-in buyer-side card)
CREATE INDEX IF NOT EXISTS idx_market_surveys_buyer_pending
  ON market_surveys (buyer_user_id, expires_at)
  WHERE submitted_at IS NULL AND kind = 'buyer';

-- Tokenized buyer link lookup (unique non-null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_surveys_token
  ON market_surveys (access_token)
  WHERE access_token IS NOT NULL;

-- Cron generation lookup: "what markets need surveys generated?"
-- Cron walks markets with recent close times; checks for existing
-- (market_id, market_date) rows to avoid duplicates. The UNIQUE
-- constraint above is the canonical dedup gate; this index speeds the
-- "does a row exist?" probe.
CREATE INDEX IF NOT EXISTS idx_market_surveys_notified
  ON market_surveys (market_id, market_date, kind)
  WHERE notified_at IS NULL;

-- ----------------------------------------------------------------------------
-- 3. Row-Level Security (default-deny — service client only)
-- ----------------------------------------------------------------------------

ALTER TABLE market_surveys ENABLE ROW LEVEL SECURITY;

-- No policies — matches mig 137 pattern. All access goes through API
-- routes using createServiceClient(). Routes enforce auth via the
-- authenticated supabase client BEFORE hitting the service client.

COMMENT ON TABLE market_surveys IS
  'Mig 147 / Phase E: post-market surveys. RLS enabled with NO POLICIES — default-deny. All reads/writes via API routes using service client; routes enforce auth + ownership before touching the table.';

-- ----------------------------------------------------------------------------
-- 4. Buyer opt-out flag on user_profiles
-- ----------------------------------------------------------------------------

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS survey_emails_opted_out BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN user_profiles.survey_emails_opted_out IS
  'Mig 147: when TRUE, buyer survey EMAILS are not sent to this user. In-app notifications still fire. Vendor surveys are not opt-out (part of being on the platform). Toggled via the unsubscribe link in survey emails: /[vertical]/account/email-preferences?token=<token>.';

NOTIFY pgrst, 'reload schema';
