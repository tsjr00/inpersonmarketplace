-- Migration 239: Invitation gate — self-service events hold vendor invitations
-- until the organizer has answered the details vendors need (owner, 2026-08-29).
--
-- Class: ADDITIVE, idempotent, safe to paste on Dev/Staging/Prod in any order.
--
-- Before this: a self-service request with an address was auto-approved AND
-- auto-invited in the same intake call (api/event-requests/route.ts), before
-- the organizer could set a vendor fee (only possible post-approval) or fill in
-- budget / event-context / logistics. Trucks were deciding on a blank.
--
-- After: intake still auto-approves and scores a PRELIMINARY match (dry run,
-- no rows written). Invitations go out when the organizer clicks
-- "Send invitations" on their Organizer Event Dashboard, which is enabled once
-- the required details (lib/events/invitation-gate.ts) are complete.
--
-- Columns:
--   has_run_before             Budget Part 1 — "have you run this or a similar
--                              event before?" (NULL = unanswered)
--   vendor_fee_decided_at      stamped by PUT /api/events/[token]/vendor-fee on
--                              ANY save, including "no fee". event_vendor_fee_cents
--                              NULL already means free, so the stamp is the only
--                              way to tell "chose free" from "never looked".
--   event_context_confirmed_at stamped by PATCH /api/events/[token]/details when
--                              the update carries any Event Context field. The
--                              booleans there DEFAULT false, so an unsaved group
--                              is indistinguishable from "all no" without it.
--   logistics_confirmed_at     same idea for background checks + the risk
--                              checklist (the checklist writes NULL for "none").
--   invitations_released_at    the organizer's click. NULL on a self-service
--                              event = invitations are HELD: intake, the daily
--                              re-match sweep and "Refresh matches" all skip it.
--
-- Backfill: events whose invitations already went out are released as of that
-- moment, so nothing already in flight is retroactively held.

ALTER TABLE public.catering_requests
  ADD COLUMN IF NOT EXISTS has_run_before BOOLEAN NULL;
ALTER TABLE public.catering_requests
  ADD COLUMN IF NOT EXISTS vendor_fee_decided_at TIMESTAMPTZ NULL;
ALTER TABLE public.catering_requests
  ADD COLUMN IF NOT EXISTS event_context_confirmed_at TIMESTAMPTZ NULL;
ALTER TABLE public.catering_requests
  ADD COLUMN IF NOT EXISTS logistics_confirmed_at TIMESTAMPTZ NULL;
ALTER TABLE public.catering_requests
  ADD COLUMN IF NOT EXISTS invitations_released_at TIMESTAMPTZ NULL;

UPDATE public.catering_requests
   SET invitations_released_at = auto_invite_sent_at
 WHERE invitations_released_at IS NULL
   AND auto_invite_sent_at IS NOT NULL;

-- A fee that already exists was obviously decided.
UPDATE public.catering_requests
   SET vendor_fee_decided_at = COALESCE(updated_at, created_at, now())
 WHERE vendor_fee_decided_at IS NULL
   AND event_vendor_fee_cents IS NOT NULL;

COMMENT ON COLUMN public.catering_requests.invitations_released_at IS
  'Self-service: organizer clicked Send invitations (mig 239). NULL = invitations held until required details are complete.';
COMMENT ON COLUMN public.catering_requests.has_run_before IS
  'Budget Part 1 (mig 239): organizer has run this or a similar event before. NULL = unanswered.';

NOTIFY pgrst, 'reload schema';

-- Verify (expected: 5 rows)
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'catering_requests'
--    AND column_name IN ('has_run_before','vendor_fee_decided_at','event_context_confirmed_at','logistics_confirmed_at','invitations_released_at');

-- ROLLBACK
-- ALTER TABLE public.catering_requests
--   DROP COLUMN IF EXISTS has_run_before,
--   DROP COLUMN IF EXISTS vendor_fee_decided_at,
--   DROP COLUMN IF EXISTS event_context_confirmed_at,
--   DROP COLUMN IF EXISTS logistics_confirmed_at,
--   DROP COLUMN IF EXISTS invitations_released_at;
