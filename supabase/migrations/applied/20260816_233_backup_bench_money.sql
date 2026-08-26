-- ============================================================================
-- Migration 233: Backup bench Phase 3 — cancellation money (owner, 2026-08-16)
-- Requires 228 + 229 + 232. Paste-and-go class, but NOT purely additive:
--   * 5 new nullable columns on event_vendor_fee_payments (additive)
--   * 2 CHECK constraints WIDENED (permissive direction — every existing row
--     passes; old value set ⊂ new value set)
--   * 1 partial-unique-index predicate widened (permissive direction)
--   * 2 RPCs replaced (mig 229 bodies + the 'covered' edits, spliced not
--     retyped; CREATE OR REPLACE keeps grants, re-asserted anyway)
--
-- Model (decisions.md "Backup vendors — model decided" + 2026-08-16 answers):
--   Vendor cancels ≥72h out → fee refunded (with transfer reversal), no stain.
--   Vendor cancels <72h    → fee FORFEITED instantly (no money moves — the
--     split happened at pay time). Organizer may WAIVE (= refund) until
--     event date + 14 days.
--   Promoted backup's spot is COVERED by the defector's unclaimed forfeit —
--     a 'covered' row (amounts snapshot the forfeited row, covering_payment_id
--     links them). Free spot IS the step-in bonus; no cash moves on activation.
--   Covered rows OCCUPY capacity (else a third payer could take the promoted
--     backup's slot) and the pay gate answers 'spot_covered' for them.
--
-- ALSO FIXES (owner-confirmed live on all 3 envs 2026-08-16, damage scan = 0
-- rows everywhere): market_vendors_response_status_check never allowed
-- 'cancelled', so the vendor cancel route's status write failed SILENTLY
-- since mig 070 — half-cancellations (listings removed, buyers refunded,
-- backup promoted, vendor still 'accepted'). The route now aborts loudly on
-- that error; this widens the CHECK so the write succeeds.
--
-- Pre-check (optional):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'market_vendors_response_status_check';
--   -- expect: invited/accepted/declined only
--
-- Post-checks (run all four; expected results in comments):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'market_vendors_response_status_check';
--   -- expect: ARRAY['invited','accepted','declined','cancelled']
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'ck_evfp_status';
--   -- expect: pending_payment/paid/refunded/released/forfeited/covered
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_name = 'event_vendor_fee_payments'
--      AND column_name IN ('cancel_requested_at','cancel_reason','forfeited_at',
--                          'waiver_decided_at','covering_payment_id');
--   -- expect: 5
--   SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_evfp_one_live_per_vendor';
--   -- expect: predicate includes 'covered'
-- ============================================================================

-- ── 1. New columns (all nullable — additive) ────────────────────────────────
ALTER TABLE public.event_vendor_fee_payments
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS forfeited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS waiver_decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS covering_payment_id UUID REFERENCES public.event_vendor_fee_payments(id);

COMMENT ON COLUMN public.event_vendor_fee_payments.cancel_reason IS
  'The cancelling vendor''s stated reason — shown to the organizer on the waiver card.';
COMMENT ON COLUMN public.event_vendor_fee_payments.covering_payment_id IS
  'On a ''covered'' row: the forfeited payment whose money pays for this spot (backup step-in bonus). A forfeit is "unclaimed" while no LIVE covered row references it.';

-- ── 2. Widen the evfp status CHECK: + 'forfeited' + 'covered' ──────────────
-- The original CHECK was inline/unnamed in mig 228's CREATE TABLE, so its
-- auto-name may vary — find it by definition (enumerate-by-query, never
-- hand-typed names), drop it, re-add named.
DO $$
DECLARE v_name text;
BEGIN
  SELECT conname INTO v_name
    FROM pg_constraint
   WHERE conrelid = 'public.event_vendor_fee_payments'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%pending_payment%';
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.event_vendor_fee_payments DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

ALTER TABLE public.event_vendor_fee_payments
  ADD CONSTRAINT ck_evfp_status
  CHECK (status IN ('pending_payment', 'paid', 'refunded', 'released', 'forfeited', 'covered'));

-- ── 3. Widen the one-live-row index: 'covered' joins the live set ──────────
-- (a covered backup must not be able to open a second attempt, and the
-- covered row must block a duplicate cover)
DROP INDEX IF EXISTS public.uq_evfp_one_live_per_vendor;
CREATE UNIQUE INDEX uq_evfp_one_live_per_vendor
  ON public.event_vendor_fee_payments (market_id, vendor_profile_id)
  WHERE status IN ('pending_payment', 'paid', 'covered');

-- ── 4. Widen market_vendors.response_status: + 'cancelled' ─────────────────
-- Name CONFIRMED identical on Dev/Staging/Prod by owner query 2026-08-16.
ALTER TABLE public.market_vendors
  DROP CONSTRAINT IF EXISTS market_vendors_response_status_check;
ALTER TABLE public.market_vendors
  ADD CONSTRAINT market_vendors_response_status_check
  CHECK (response_status = ANY (ARRAY['invited'::text, 'accepted'::text, 'declined'::text, 'cancelled'::text]));

-- ── 5. RPC replacements — mig 229 bodies with the 'covered' edits ──────────
-- Edit surface (everything else verbatim from 229):
--   create_...: already-paid EXISTS → status lookup distinguishing
--               paid ('already_paid') from covered ('spot_covered');
--               both capacity counts include 'covered'.
--   mark_...:   capacity count includes 'covered'.

CREATE OR REPLACE FUNCTION public.create_event_fee_payment_if_eligible(
  p_market_id uuid,
  p_vendor_profile_id uuid,
  p_fee_cents integer,
  p_vendor_pays_cents integer,
  p_organizer_receives_cents integer,
  p_platform_keeps_cents integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_event RECORD;
  v_mv RECORD;
  v_existing text;
  v_spots integer;
  v_paid integer;
  v_remaining integer;
  v_protected_others integer;
  v_in_own_window boolean;
  v_payment_id uuid;
BEGIN
  -- Serialize per event market (same pattern as book_weekly_booth_atomic).
  PERFORM pg_advisory_xact_lock(hashtext('event_fee_' || p_market_id::text));

  SELECT id, vendor_count, event_vendor_fee_cents, status
    INTO v_event
    FROM catering_requests
   WHERE market_id = p_market_id;

  IF v_event.id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'event_not_found');
  END IF;
  IF v_event.event_vendor_fee_cents IS NULL OR v_event.event_vendor_fee_cents <= 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_fee');
  END IF;
  IF v_event.status NOT IN ('approved', 'ready') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'event_not_open');
  END IF;
  -- Amounts are snapshotted by the caller from the CURRENT fee; refuse a
  -- stale snapshot (fee changed mid-flight) rather than charging the old one.
  IF p_fee_cents IS DISTINCT FROM v_event.event_vendor_fee_cents THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'fee_changed');
  END IF;

  SELECT response_status, organizer_selected_at
    INTO v_mv
    FROM market_vendors
   WHERE market_id = p_market_id AND vendor_profile_id = p_vendor_profile_id;

  IF v_mv.response_status IS DISTINCT FROM 'accepted' OR v_mv.organizer_selected_at IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_selected');
  END IF;

  -- Mig 233: a 'covered' spot (backup stepping into a defector's forfeit) is
  -- settled — nothing to pay, distinct message from already_paid.
  SELECT status INTO v_existing
    FROM event_vendor_fee_payments
   WHERE market_id = p_market_id AND vendor_profile_id = p_vendor_profile_id
     AND status IN ('paid', 'covered')
   LIMIT 1;
  IF v_existing = 'paid' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'already_paid');
  ELSIF v_existing = 'covered' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'spot_covered');
  END IF;

  v_spots := GREATEST(COALESCE(v_event.vendor_count, 2), 1);
  -- Mig 233: covered rows OCCUPY capacity.
  SELECT count(*) INTO v_paid
    FROM event_vendor_fee_payments
   WHERE market_id = p_market_id AND status IN ('paid', 'covered');
  v_remaining := v_spots - v_paid;

  IF v_remaining <= 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'event_full');
  END IF;

  v_in_own_window := v_mv.organizer_selected_at > NOW() - INTERVAL '12 hours';

  IF NOT v_in_own_window THEN
    -- Reserve a spot for every OTHER contender still inside their window.
    SELECT count(*) INTO v_protected_others
      FROM market_vendors mv
     WHERE mv.market_id = p_market_id
       AND mv.vendor_profile_id <> p_vendor_profile_id
       AND mv.response_status = 'accepted'
       AND mv.organizer_selected_at IS NOT NULL
       AND mv.organizer_selected_at > NOW() - INTERVAL '12 hours'
       AND NOT EXISTS (
         SELECT 1 FROM event_vendor_fee_payments p
          WHERE p.market_id = mv.market_id
            AND p.vendor_profile_id = mv.vendor_profile_id
            AND p.status IN ('paid', 'covered')
       );
    IF v_protected_others >= v_remaining THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'spots_protected');
    END IF;
  END IF;

  -- Refresh a prior attempt instead of tripping the one-live-row index:
  -- a released/refunded row never blocks; a stale pending row is reused.
  UPDATE event_vendor_fee_payments
     SET status = 'released', updated_at = NOW()
   WHERE market_id = p_market_id AND vendor_profile_id = p_vendor_profile_id
     AND status = 'pending_payment';

  INSERT INTO event_vendor_fee_payments (
    catering_request_id, market_id, vendor_profile_id,
    fee_cents, vendor_pays_cents, organizer_receives_cents, platform_keeps_cents
  ) VALUES (
    v_event.id, p_market_id, p_vendor_profile_id,
    p_fee_cents, p_vendor_pays_cents, p_organizer_receives_cents, p_platform_keeps_cents
  ) RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object('allowed', true, 'payment_id', v_payment_id,
                            'remaining_before', v_remaining);
END;
$$;

-- Webhook-side flip: first PAYMENT wins, decided here under the same lock.
-- Returns paid=true, or paid=false + needs_refund=true for the rare loser
-- (event filled between session-create and payment completion).
CREATE OR REPLACE FUNCTION public.mark_event_fee_paid_if_capacity(
  p_payment_id uuid,
  p_session_id text,
  p_payment_intent_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_spots integer;
  v_paid integer;
BEGIN
  SELECT p.id, p.market_id, p.status, cr.vendor_count
    INTO v_row
    FROM event_vendor_fee_payments p
    JOIN catering_requests cr ON cr.id = p.catering_request_id
   WHERE p.id = p_payment_id;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('paid', false, 'reason', 'not_found');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('event_fee_' || v_row.market_id::text));

  -- Idempotent: webhook retries land here.
  IF v_row.status = 'paid' THEN
    RETURN jsonb_build_object('paid', true, 'reason', 'already_paid');
  END IF;
  IF v_row.status IN ('refunded') THEN
    RETURN jsonb_build_object('paid', false, 'reason', 'already_refunded');
  END IF;

  v_spots := GREATEST(COALESCE(v_row.vendor_count, 2), 1);
  -- Mig 233: covered rows OCCUPY capacity.
  SELECT count(*) INTO v_paid
    FROM event_vendor_fee_payments
   WHERE market_id = v_row.market_id AND status IN ('paid', 'covered');

  IF v_paid >= v_spots THEN
    UPDATE event_vendor_fee_payments
       SET status = 'released',
           stripe_checkout_session_id = p_session_id,
           stripe_payment_intent_id = p_payment_intent_id,
           updated_at = NOW()
     WHERE id = p_payment_id;
    RETURN jsonb_build_object('paid', false, 'reason', 'event_full', 'needs_refund', true);
  END IF;

  UPDATE event_vendor_fee_payments
     SET status = 'paid',
         paid_at = NOW(),
         stripe_checkout_session_id = p_session_id,
         stripe_payment_intent_id = p_payment_intent_id,
         updated_at = NOW()
   WHERE id = p_payment_id;

  RETURN jsonb_build_object('paid', true);
END;
$$;

-- Service-role only (mig 149/152 posture for financial RPCs). CREATE OR
-- REPLACE preserves the ACL from 229; re-asserted for explicitness.
REVOKE EXECUTE ON FUNCTION public.create_event_fee_payment_if_eligible(uuid, uuid, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_event_fee_paid_if_capacity(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_event_fee_payment_if_eligible(uuid, uuid, integer, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_event_fee_paid_if_capacity(uuid, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK:
--   ALTER TABLE public.market_vendors
--     DROP CONSTRAINT IF EXISTS market_vendors_response_status_check;
--   ALTER TABLE public.market_vendors
--     ADD CONSTRAINT market_vendors_response_status_check
--     CHECK (response_status = ANY (ARRAY['invited'::text, 'accepted'::text, 'declined'::text]));
--   ALTER TABLE public.event_vendor_fee_payments DROP CONSTRAINT IF EXISTS ck_evfp_status;
--   ALTER TABLE public.event_vendor_fee_payments
--     ADD CONSTRAINT ck_evfp_status
--     CHECK (status IN ('pending_payment', 'paid', 'refunded', 'released'));
--   DROP INDEX IF EXISTS public.uq_evfp_one_live_per_vendor;
--   CREATE UNIQUE INDEX uq_evfp_one_live_per_vendor
--     ON public.event_vendor_fee_payments (market_id, vendor_profile_id)
--     WHERE status IN ('pending_payment', 'paid');
--   ALTER TABLE public.event_vendor_fee_payments
--     DROP COLUMN IF EXISTS cancel_requested_at,
--     DROP COLUMN IF EXISTS cancel_reason,
--     DROP COLUMN IF EXISTS forfeited_at,
--     DROP COLUMN IF EXISTS waiver_decided_at,
--     DROP COLUMN IF EXISTS covering_payment_id;
--   -- RPCs: re-apply supabase/migrations/20260814_229_event_fee_payment_rpcs.sql verbatim.
--   NOTIFY pgrst, 'reload schema';
--   (Only safe while no forfeited/covered rows exist — the narrowed CHECK
--   would reject them.)
-- ============================================================================
