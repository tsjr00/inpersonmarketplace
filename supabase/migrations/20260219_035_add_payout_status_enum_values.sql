-- Migration 035: Add missing payout_status enum values
-- The 'skipped_dev' and 'pending_stripe_setup' statuses are used in application code
-- but were never added to the payout_status enum in the database.
--
-- ALTER TYPE ... ADD VALUE is not transactional in PostgreSQL, so each statement
-- must succeed independently. IF NOT EXISTS prevents errors if already present.

ALTER TYPE payout_status ADD VALUE IF NOT EXISTS 'skipped_dev';
ALTER TYPE payout_status ADD VALUE IF NOT EXISTS 'pending_stripe_setup';
