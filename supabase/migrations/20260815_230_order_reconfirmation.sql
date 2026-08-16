-- ============================================================================
-- Migration 230: Attendee re-confirmation after a consequential event change
-- Date: 2026-08-15. ADDITIVE ONLY — 6 nullable columns + 2 partial indexes on
-- `orders`. No status-enum change (deliberate: an awaiting order still behaves
-- like a paid order everywhere except the vendor's prep count), no RLS change
-- (buyers already read their own orders; the token route uses the service
-- client), no data backfill.
--
-- Design: owner spec 2026-08-08 (backlog "SPEC — RE-CONFIRMATION FLOW") +
-- implementation choices approved 2026-08-15 ("build it that way"):
--   · A change to an event's day, place, or start time (>30min — same
--     changeRequiresReconfirmation test the consequence gate uses) stamps
--     every live order at that event market: reconfirm_required_at = now,
--     a reconfirm_token minted (kept across re-asks), reconfirmed_at cleared.
--   · The buyer confirms per COMBINED ORDER ("I am still coming"), via a
--     token page — the link NEVER confirms on GET (mail scanners click
--     links; the button POSTs).
--   · Unconfirmed at the market's cutoff (NOT event start) → full refund.
--     Sweep runs hourly (/api/cron/event-reconfirm).
--
-- State model (no enum): awaiting = required_at NOT NULL AND reconfirmed_at
-- NULL AND reconfirm_refunded_at NULL. A NEW consequential change re-asks by
-- clearing reconfirmed_at + the ping stamps; the token survives so old links
-- keep working.
--
-- Apply: paste-and-go class (additive).
-- Post-check: SELECT count(*) FROM information_schema.columns
--             WHERE table_name='orders' AND column_name LIKE 'reconfirm%';
--             -- expect 6
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS reconfirm_required_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconfirm_token UUID,
  ADD COLUMN IF NOT EXISTS reconfirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconfirm_reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconfirm_final_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconfirm_refunded_at TIMESTAMPTZ;

-- The token is a bearer credential for exactly one action ("this order still
-- stands") — same class as the cause-onboarding token (mig 218): a duplicate
-- would be an authorization bug, so partial UNIQUE, not a plain index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_reconfirm_token
  ON public.orders (reconfirm_token)
  WHERE reconfirm_token IS NOT NULL;

-- The hourly sweep's working set: stamped, unanswered, not yet refunded.
CREATE INDEX IF NOT EXISTS idx_orders_reconfirm_pending
  ON public.orders (reconfirm_required_at)
  WHERE reconfirm_required_at IS NOT NULL
    AND reconfirmed_at IS NULL
    AND reconfirm_refunded_at IS NULL;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK:
--   DROP INDEX IF EXISTS uq_orders_reconfirm_token;
--   DROP INDEX IF EXISTS idx_orders_reconfirm_pending;
--   ALTER TABLE public.orders
--     DROP COLUMN IF EXISTS reconfirm_required_at,
--     DROP COLUMN IF EXISTS reconfirm_token,
--     DROP COLUMN IF EXISTS reconfirmed_at,
--     DROP COLUMN IF EXISTS reconfirm_reminder_sent_at,
--     DROP COLUMN IF EXISTS reconfirm_final_sent_at,
--     DROP COLUMN IF EXISTS reconfirm_refunded_at;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================================
