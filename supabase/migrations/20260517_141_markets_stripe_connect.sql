-- Migration 141: markets Stripe Connect columns
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- To revert this migration on any environment, run as a single transaction:
--
--   BEGIN;
--   DROP INDEX IF EXISTS idx_markets_stripe_account_id;
--   ALTER TABLE markets
--     DROP COLUMN IF EXISTS stripe_payouts_enabled,
--     DROP COLUMN IF EXISTS stripe_charges_enabled,
--     DROP COLUMN IF EXISTS stripe_onboarding_complete,
--     DROP COLUMN IF EXISTS stripe_account_id;
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
--
-- Risk profile:
--   PRE-application or DEV-only: zero data loss; safe.
--   POST-application where managers have completed Connect onboarding:
--     ROLLBACK ORPHANS the Stripe Connect accounts (DB forgets the IDs;
--     Stripe still has them and they continue to incur dashboard quota).
--     Recovery: re-onboard each affected manager, or manually backfill
--     stripe_account_id from Stripe dashboard before drop.
--
-- No dependencies on other migrations. Adds nullable + default-false
-- columns; existing markets rows unaffected.
-- =============================================================================
--
-- Mirrors the `vendor_profiles.stripe_*` pattern (mig 091-era columns)
-- exactly — same names, same types, same defaults. The library at
-- `src/lib/stripe/connect.ts` is reused for the manager Connect
-- onboarding flow; no SDK changes.
--
-- Phase C Stage 2 (2026-05-17). Foundation for the booth-rental payment
-- flow (Stage 3): platform creates a manager "market" Connect account
-- separate from the manager's vendor account (if they're also a
-- vendor — same human, two Connect identities). Booth-rental fees
-- route to this account.

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN markets.stripe_account_id IS
  'Stripe Connect Express account ID for the market manager (acct_xxx). NULL until manager completes onboarding. One account per market — different markets get different accounts even when managed by the same person.';

-- Partial index for webhook lookup by Stripe account ID. Stage 3
-- webhook handler will need to resolve `account.updated` events to
-- a market row; this keeps that lookup cheap.
CREATE INDEX IF NOT EXISTS idx_markets_stripe_account_id
  ON markets(stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
