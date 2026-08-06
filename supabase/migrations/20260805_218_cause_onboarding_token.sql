-- ============================================================================
-- Migration 218: Durable onboarding token for cause beneficiaries
-- Date: 2026-08-05
-- ============================================================================
-- WHY
--
-- A beneficiary org has to complete Stripe Connect onboarding itself — the form
-- collects the org's bank account, tax ID and a representative's personal
-- details, which a platform admin has no business typing and usually cannot
-- supply. So the admin must be able to EMAIL the org a link.
--
-- Stripe account links cannot be emailed. Per Stripe's own docs they:
--   * expire a few minutes after creation,
--   * are single-use — one visit consumes them, and
--   * are routinely consumed by mail scanners and link-preview bots before a
--     human ever clicks ("many clients automatically visit links, which causes
--     an Account Link to expire").
-- Emailing one would produce a dead link most of the time, and the org would
-- blame us for it.
--
-- So we email OUR link and mint Stripe's on arrival. This token identifies the
-- beneficiary on a public, unauthenticated route (/cause/onboard/<token>) which
-- generates a FRESH Stripe account link per visit and redirects. A bot hitting
-- it costs nothing — it burns one generated Stripe link, and the org gets
-- another when they actually click. Same durable-token shape the event organizer
-- flow already uses (catering_requests tokens → /events/<token>/…).
--
-- SECURITY NOTES
--   * The token is a bearer credential: whoever holds it can start onboarding
--     for that org. It grants NOTHING else — no reads of platform data, no
--     money movement, no admin surface. Worst case is a stranger being shown
--     Stripe's form for an org whose bank details they do not have.
--   * gen_random_uuid() is the same unguessable source used for every other id
--     in this schema.
--   * Revocable: set the column to NULL (or regenerate) and old emails die.
--     Column is nullable precisely so revocation is possible.
--   * Deliberately NOT reusing stripe_account_id as the token — that value ends
--     up in Stripe dashboards, logs and support threads, and must never be a
--     credential.
--
-- INERT ON ARRIVAL: nullable, no backfill. Existing rows get a token the first
-- time an admin sends an invitation.
-- ============================================================================

BEGIN;

ALTER TABLE public.cause_beneficiaries
  ADD COLUMN IF NOT EXISTS onboarding_token UUID,
  ADD COLUMN IF NOT EXISTS onboarding_invited_at TIMESTAMPTZ;

-- Lookup path for the public route. UNIQUE because the token IS the identifier
-- on that route — two orgs sharing one would be an authorization bug, not a
-- collision annoyance. Partial: NULL means "never invited" and many rows will
-- sit that way.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cause_beneficiaries_onboarding_token
  ON public.cause_beneficiaries (onboarding_token)
  WHERE onboarding_token IS NOT NULL;

COMMENT ON COLUMN public.cause_beneficiaries.onboarding_token IS
  'Durable bearer token for the public Stripe onboarding route /cause/onboard/<token>. Exists because Stripe account links expire in minutes, are single-use, and are consumed by email scanners — so we email THIS and mint a fresh Stripe link on each visit. Grants only "start onboarding for this org"; no data access, no money movement. Revoke by setting NULL (mig 218).';
COMMENT ON COLUMN public.cause_beneficiaries.onboarding_invited_at IS
  'When the onboarding invitation was last emailed. Display only — lets an admin see whether an org has been asked yet, and how long ago, before chasing them (mig 218).';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- VERIFICATION (run after applying)
-- ============================================================================
-- 1) Columns:
--    SELECT column_name FROM information_schema.columns
--     WHERE table_name='cause_beneficiaries' AND column_name LIKE 'onboarding%';  -- expect 2
-- 2) Nothing backfilled — every existing org is still un-invited:
--    SELECT COUNT(*) FROM cause_beneficiaries WHERE onboarding_token IS NOT NULL;  -- expect 0
-- 3) Unique index present:
--    SELECT indexname FROM pg_indexes
--     WHERE tablename='cause_beneficiaries' AND indexname='uq_cause_beneficiaries_onboarding_token';
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP INDEX IF EXISTS uq_cause_beneficiaries_onboarding_token;
-- ALTER TABLE public.cause_beneficiaries
--   DROP COLUMN IF EXISTS onboarding_token,
--   DROP COLUMN IF EXISTS onboarding_invited_at;
-- NOTIFY pgrst, 'reload schema';
