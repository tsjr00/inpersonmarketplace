-- =============================================================================
-- Migration 196: payments.stripe_fee_cents — capture the ACTUAL Stripe fee
-- =============================================================================
-- WHY (review slice-10 ADM-2 follow-up, user request 2026-07-17): admin money
-- reports estimate Stripe processing cost at 2.9% + $0.30/charge. That's only
-- the US-domestic-card floor — international cards (+~1.5%), currency conversion
-- (+~1%), and some wallets/brands cost more, so the estimate UNDERSTATES what
-- the platform actually pays. The authoritative figure is the Stripe BALANCE
-- TRANSACTION `fee` on each charge (fee_details breaks it down). Because this
-- app uses DESTINATION CHARGES (payments.ts transfer_data.destination), the
-- platform is merchant of record and bears that fee — so the charge's balance-
-- transaction fee is exactly "what we pay Stripe."
--
-- This migration adds the storage column; a webhook change (captures the fee at
-- settlement from the charge's balance_transaction) and a one-time backfill
-- populate it. Reports prefer this actual value and fall back to the estimate
-- only when it's NULL (external payments, or not-yet-captured rows).
-- =============================================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS stripe_fee_cents INTEGER;

COMMENT ON COLUMN payments.stripe_fee_cents IS
  'Actual Stripe processing fee for this charge, in cents, read from the charge''s balance_transaction.fee (destination charge → platform bears it). NULL = not captured (pre-mig-196 rows until backfilled, external payments with no Stripe fee, or a charge whose balance_transaction was not yet available). Admin reports use this when present and fall back to the 2.9%+$0.30 estimate when NULL.';

NOTIFY pgrst, 'reload schema';

-- Verification (run after applying):
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_name = 'payments' AND column_name = 'stripe_fee_cents';
--
-- ROLLBACK: ALTER TABLE payments DROP COLUMN IF EXISTS stripe_fee_cents;
