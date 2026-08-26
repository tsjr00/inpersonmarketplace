-- ============================================================================
-- Migration 228: Event Vendor Fees — schema (V1 Phase 1)
-- Date: 2026-08-14. ADDITIVE ONLY — 2 columns, 1 table, 2 helper functions,
-- indexes + RLS. Nothing existing is altered; INERT until the app code ships
-- (and the app code is inert until a fee is set — decision 7: zero-fee events
-- are byte-identical to today).
--
-- Design: decisions.md → "Event Vendor Fees — V1 design decisions (2026-08-14)"
-- + apps/web/.claude/spot_fees_design_brief.md (phased plan).
--
-- Apply: paste-and-go class (additive). Pre-check optional:
--   SELECT to_regclass('public.event_vendor_fee_payments');  -- NULL before
-- Post-check:
--   SELECT to_regclass('public.event_vendor_fee_payments');  -- non-NULL after
-- ============================================================================

-- ── 1. The fee, on the REQUEST (source of truth per mig 219's ownership rule;
--       no market copy). NULL or 0 = free event, no pay step exists. ─────────
ALTER TABLE public.catering_requests
  ADD COLUMN IF NOT EXISTS event_vendor_fee_cents INTEGER;
ALTER TABLE public.catering_requests
  DROP CONSTRAINT IF EXISTS ck_catering_requests_vendor_fee_non_negative;
ALTER TABLE public.catering_requests
  ADD CONSTRAINT ck_catering_requests_vendor_fee_non_negative
  CHECK (event_vendor_fee_cents IS NULL OR event_vendor_fee_cents >= 0);

-- ── 2. When the organizer selected this vendor — starts the 12h protected
--       window (decision 4). Protection is DERIVED (selected_at + 12h), never
--       stored, so the organizer override needs no clock mutation. ───────────
ALTER TABLE public.market_vendors
  ADD COLUMN IF NOT EXISTS organizer_selected_at TIMESTAMPTZ;

-- ── 3. The payment row. Mirrors weekly_booth_rentals' shape: amounts are
--       SNAPSHOTS from calculateBoothRentalFees at session-create (decision 6:
--       booth math verbatim), so a later fee change affects only future payers.
--       Status flips to 'paid' ONLY in the Stripe webhook (R8 pattern). ──────
CREATE TABLE IF NOT EXISTS public.event_vendor_fee_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catering_request_id UUID NOT NULL REFERENCES public.catering_requests(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  vendor_profile_id UUID NOT NULL REFERENCES public.vendor_profiles(id) ON DELETE CASCADE,
  -- Snapshot amounts (cents) — calculateBoothRentalFees(fee_cents):
  fee_cents INTEGER NOT NULL CHECK (fee_cents > 0),
  vendor_pays_cents INTEGER NOT NULL CHECK (vendor_pays_cents > 0),
  organizer_receives_cents INTEGER NOT NULL CHECK (organizer_receives_cents >= 0),
  platform_keeps_cents INTEGER NOT NULL CHECK (platform_keeps_cents >= 0),
  -- pending_payment → paid (webhook only) → refunded; 'released' = spot lost
  -- (raced out / never paid / organizer override) — terminal, non-monetary.
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment', 'paid', 'refunded', 'released')),
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  refund_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One live payment attempt per vendor per event market. Terminal rows
-- (refunded/released) don't block a fresh attempt.
CREATE UNIQUE INDEX IF NOT EXISTS uq_evfp_one_live_per_vendor
  ON public.event_vendor_fee_payments (market_id, vendor_profile_id)
  WHERE status IN ('pending_payment', 'paid');

CREATE INDEX IF NOT EXISTS idx_evfp_market_status
  ON public.event_vendor_fee_payments (market_id, status);
CREATE INDEX IF NOT EXISTS idx_evfp_vendor
  ON public.event_vendor_fee_payments (vendor_profile_id);

-- Shared updated_at trigger (same helper as mig 116/220).
DROP TRIGGER IF EXISTS update_event_vendor_fee_payments_updated_at
  ON public.event_vendor_fee_payments;
CREATE TRIGGER update_event_vendor_fee_payments_updated_at
  BEFORE UPDATE ON public.event_vendor_fee_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 4. RLS — post-mig-226 posture: NO public read, no USING(true). Writes are
--       service-client only (no INSERT/UPDATE policies at all). ──────────────
ALTER TABLE public.event_vendor_fee_payments ENABLE ROW LEVEL SECURITY;

-- Organizer-own check as SECURITY DEFINER: a plain subquery on
-- catering_requests would evaluate under the caller's RLS, and mig 226
-- removed anon/organizer row access there — the definer reads it directly.
CREATE OR REPLACE FUNCTION public.is_event_organizer(cr_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM catering_requests
    WHERE id = cr_id AND organizer_user_id = auth.uid()
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_event_organizer(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_event_organizer(uuid) FROM anon;

CREATE POLICY evfp_vendor_select ON public.event_vendor_fee_payments
  FOR SELECT USING (
    vendor_profile_id IN (SELECT user_vendor_profile_ids())
  );

CREATE POLICY evfp_organizer_select ON public.event_vendor_fee_payments
  FOR SELECT USING (
    public.is_event_organizer(catering_request_id)
  );

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.event_vendor_fee_payments;
--   DROP FUNCTION IF EXISTS public.is_event_organizer(uuid);
--   ALTER TABLE public.market_vendors DROP COLUMN IF EXISTS organizer_selected_at;
--   ALTER TABLE public.catering_requests
--     DROP CONSTRAINT IF EXISTS ck_catering_requests_vendor_fee_non_negative;
--   ALTER TABLE public.catering_requests DROP COLUMN IF EXISTS event_vendor_fee_cents;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================================
