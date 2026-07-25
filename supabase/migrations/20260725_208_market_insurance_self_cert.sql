-- Migration 208: markets insurance self-certification
--
-- Tester finding F7 (2026-07-24, owner decision): for park/market operators,
-- replace the "upload a Certificate of Insurance" requirement with a
-- SELF-CERTIFICATION — the operator attests they carry the correct types and
-- enough insurance to cover the risks of operating their market. Does NOT block
-- progress; admin still verifies the market before approving it.
--
-- ADDITIVE. Two nullable columns on markets:
--   insurance_self_certified     BOOLEAN — true once the operator attests.
--   insurance_self_certified_at  TIMESTAMPTZ — when they attested (audit trail).
--
-- The required-document SET (legal entity, managers list, permission proof) is
-- product metadata in code (document-types.ts `required` flag) — no schema
-- change for that; "required" is advisory (labeled + checklisted), admin still
-- verifies. Only the self-cert attestation needs to persist, hence this column.
--
-- Companion code (same commit, PRE-MIGRATION SAFE): the self-cert GET/PATCH
-- route + VerificationDocumentsCard read/write these columns through a tolerant
-- select (missing column -> not-certified), so the card renders even before
-- this migration applies.

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS insurance_self_certified BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS insurance_self_certified_at TIMESTAMPTZ;

COMMENT ON COLUMN markets.insurance_self_certified IS
  'Operator self-certification that the market/park carries adequate insurance (F7, mig 208). Replaces the COI upload requirement; advisory, admin still verifies. FALSE = not yet attested.';
COMMENT ON COLUMN markets.insurance_self_certified_at IS
  'Timestamp of the operator''s insurance self-certification (mig 208). NULL = never attested.';

NOTIFY pgrst, 'reload schema';

-- ROLLBACK:
-- ALTER TABLE markets DROP COLUMN IF EXISTS insurance_self_certified;
-- ALTER TABLE markets DROP COLUMN IF EXISTS insurance_self_certified_at;
