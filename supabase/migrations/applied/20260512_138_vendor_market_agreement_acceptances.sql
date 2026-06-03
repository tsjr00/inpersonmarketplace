-- Migration 138: vendor_market_agreement_acceptances
--
-- Records vendor's snapshot of the manager's opt-in agreement statements
-- at acceptance time. Per Market Manager v2 plan §7 (Phase B/C — electronic
-- signature substrate for booth rental flow).
--
-- The snapshot is SELF-CONTAINED — survives catalog edits/removals. We
-- store the statement_id, category, statement_text, and any placeholder
-- values used at acceptance time as JSONB. Even if the manager later edits
-- their statement selection or the catalog row is dropped, the historical
-- acceptance remains a valid snapshot of what the vendor agreed to.
--
-- agreement_version is a manager-controlled tag. If the manager materially
-- changes their statement selection (e.g., adds a new mandatory clause),
-- they can bump the version and require vendors to re-accept. The UNIQUE
-- constraint on (vendor_profile_id, market_id, agreement_version) allows
-- re-acceptance only when the version differs.
--
-- RLS: enabled with NO POLICIES — default-deny except service_role. Matches
-- migration 137 pattern. API routes use service client with auth verified
-- upstream by isMarketManager() (for manager-side reads) or by the
-- authenticated vendor for their own acceptances (when those endpoints
-- ship in Phase B).

CREATE TABLE IF NOT EXISTS vendor_market_agreement_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Self-contained snapshot of statements at acceptance time.
  -- Shape: [{ statement_id: TEXT, category: TEXT, statement_text: TEXT, placeholder_values: JSONB }]
  -- See src/lib/markets/optin-types.ts for the runtime types.
  statements_snapshot JSONB NOT NULL,
  -- Optional version identifier set by the manager. NULL = "no versioning"
  -- mode — vendor accepts once and re-acceptance is not required.
  agreement_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One acceptance per (vendor, market, version). Use NULLS NOT DISTINCT so
  -- the NULL agreement_version case is enforced as a single row too (PG 15+).
  UNIQUE NULLS NOT DISTINCT (vendor_profile_id, market_id, agreement_version)
);

COMMENT ON TABLE vendor_market_agreement_acceptances IS
  'Vendor''s electronic-signature snapshot of manager opt-in agreement statements at acceptance time. Self-contained: survives catalog edits/removals.';

COMMENT ON COLUMN vendor_market_agreement_acceptances.statements_snapshot IS
  'JSONB array of {statement_id, category, statement_text, placeholder_values}. Snapshot survives even if the original catalog row is deleted.';

COMMENT ON COLUMN vendor_market_agreement_acceptances.agreement_version IS
  'Manager-controlled version tag. NULL = unversioned (accept-once). Bumping the version forces re-acceptance.';

-- Vendor query: "show me my acceptances across markets"
CREATE INDEX idx_vmaa_vendor ON vendor_market_agreement_acceptances(vendor_profile_id);

-- Manager query: "who accepted at my market recently"
CREATE INDEX idx_vmaa_market ON vendor_market_agreement_acceptances(market_id, accepted_at DESC);

-- RLS default-deny (matches mig 137 pattern). API routes use service client.
ALTER TABLE vendor_market_agreement_acceptances ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
