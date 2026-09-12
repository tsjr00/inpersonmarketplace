-- ============================================================================
-- Migration 251: only the buyer may acknowledge a handoff, and a logged-in
--                user may only cancel an order (audit findings F-10 and F-1)
-- ============================================================================
-- ✅ PASTE-AND-GO — no code deploy has to precede this file. Every write these
--    guards constrain was read on 2026-09-12 and each one already satisfies
--    them (see "Every constrained writer" below). On PROD, paste in the
--    standing order: 238…247, then 248, 249, 250, then this.
--
-- WHY TRIGGERS AND NOT PRIVILEGES
--   Mig 249 decides WHICH COLUMNS a user may write. It cannot decide WHICH
--   USER, because buyer and vendor are the SAME Postgres role: `authenticated`.
--   No GRANT can express "this column, but only when the caller is the buyer on
--   this row". Only a trigger can compare auth.uid() to the row at write time.
--
-- ── F-10: the buyer's handoff acknowledgment is forgeable ────────────────────
--   Pickup is a two-part handshake: the buyer taps acknowledge (writing
--   buyer_confirmed_at + a 30-second confirmation_window_expires_at), then the
--   vendor taps Fulfill inside that window, and THAT is what pays the vendor.
--   But `order_items_update` (20260201_004:17-24) lets a vendor UPDATE any row
--   whose vendor_profile_id is theirs, with NO WITH CHECK — it restricts which
--   ROWS, never which columns or values — and mig 249 necessarily kept
--   buyer_confirmed_at writable because the buyer's own route writes it.
--   So a vendor can PATCH buyer_confirmed_at onto their own item over
--   PostgREST with their ordinary login, then tap Fulfill: fulfill reads
--   `buyerAlreadyAcknowledged = !!orderItem.buyer_confirmed_at`
--   (fulfill/route.ts:88) and takes the paying branch (:119).
--   ⚠ The 30-second window does NOT stop this. The expiry check is
--   `if (windowExpires && now > windowExpires)` (fulfill/route.ts:121-125), so
--   a forged write that sets only the timestamp and leaves
--   confirmation_window_expires_at NULL skips the check entirely. The window
--   only ever constrained a REAL acknowledgment that went stale.
--   Impact: the vendor is paid without the buyer ever confirming receipt. The
--   money is the buyer's own payment, so the platform's exposure is the
--   chargeback after the transfer has settled — the case the Connect
--   delay_days=3 + $50 minimum-balance stack exists to recover from.
--
-- ── F-1: orders.status is a user-writable field that gates a payout ──────────
--   `orders_update` (20260130_011:69-73) lets the buyer OR any vendor on the
--   order update the row, again with no WITH CHECK, and 249 kept `status`
--   writable because seven user routes write it. The payout gates SHORT-CIRCUIT
--   on it: `const orderIsPaid = ['paid','completed'].includes(orderData?.status)`
--   and the payments-row check runs only when that is false
--   (fulfill/route.ts:100-115; buyer/orders/[id]/confirm:120-135; cron
--   expire-orders Phases 4 and 7; lib/bundles/margin-payout.ts:77).
--   Restricting the reachable values to 'cancelled' closes that at the database,
--   which is stronger than any code gate — no route, and no direct PostgREST
--   call, can set an order to 'paid' with a user session after this lands.
--
-- SECURITY INVOKER IS LOAD-BEARING — DO NOT "HARDEN" THESE TO DEFINER.
--   Inside a SECURITY DEFINER function, current_user resolves to the function's
--   OWNER, not the caller, so `current_user = 'authenticated'` would never be
--   true and BOTH guards would silently never fire — a test that always passes.
--   These must stay INVOKER (the default). Verified mechanism: owner query Q14
--   on Dev, 2026-09-12, showed a trigger running under an app request sees
--   current_user = 'authenticated' with auth.uid() resolved from the JWT claims.
--
--   The F-10 guard reads orders.buyer_user_id as the caller, so RLS applies.
--   That is safe in both directions (orders_select, 20260209_002:39-45, is
--   `buyer_user_id = auth.uid() OR id IN (user_vendor_order_ids()) OR admin`):
--     • the buyer reads their own order  → lookup returns their id → allowed
--     • a vendor on the order reads it   → lookup returns the REAL buyer id
--                                          → mismatch → rejected for the right
--                                          reason, not by accident
--     • anything unreadable              → NULL → rejected (fails closed)
--
-- EVERY CONSTRAINED WRITER (read 2026-09-12; service-role callers are exempt by
-- the current_user check and are listed only to show why they are unaffected):
--   buyer_confirmed_at, user client  → buyer/orders/[id]/confirm:154, :348
--       route already 403s unless auth.uid() is the order's buyer (:74), so the
--       guard restates a rule that route already enforces. PASSES.
--   buyer_confirmed_at → NULL, user client → fulfill/route.ts:128-134, the
--       stale-window reset. Vendors MUST keep this, so clearing is allowed.
--   buyer_confirmed_at, SERVICE client → market-manager bundles collect-ack:104.
--       ⚠ This is the bundle manager stand-in, which sets the buyer's field on
--       the buyer's behalf at collection. It runs on serviceClient (:52), NOT
--       the manager's session (:37, used only for the isMarketManager check),
--       so current_user is service_role and the guard never fires. BUNDLE
--       COLLECTION IS UNAFFECTED. If that route is ever moved to the user
--       client, this trigger will block it — that is the intended alarm.
--   orders.status, user client → all four write 'cancelled', all PASS:
--       vendor/orders/[id]/reject:229 · cancel-nonpayment:103 ·
--       resolve-issue:297 · buyer/orders/[id]/cancel:206
--   orders.status, service client → unaffected: events/[token]/cancel:259 ·
--       admin/events/[id]:698 · cancel-bundle:156 · checkout/session:177,
--       :1207, :1258 · checkout/success:84 ('paid') · cron event-reconfirm:180 ·
--       cron expire-orders:258, :393, :475, :642 ('paid').
--   'refunded' is written to order_items, never to orders by a user client
--       (buyer/orders/[id]/cancel:261 targets order_items).
--
-- ⚠ ONE DELIBERATE BREAK (owner decision 2026-09-12, option (a)):
--   vendor/orders/[id]/confirm-external-payment:111-117 sets orders.status =
--   'paid' with the USER client. This guard blocks it. That route belongs to
--   the external-payments flow, which is INACTIVE (EXTERNAL_PAYMENTS_ENABLED =
--   false, decisions.md 2026-03-24) and whose checkout half mig 249 already
--   made inert by revoking INSERT. The owner chose to let the confirm half go
--   inert too rather than carve a 'paid' exception into a security guard.
--   REVIVAL (matches the note in mig 249's header): move that route's status
--   write to the service client after its own ownership check — the same fix
--   the skip route took for mig 248 — then the guard is satisfied untouched.
--
-- PRE-CHECK — what triggers already exist on these tables (the repo list is NOT
-- authoritative; finding F-9 showed live function bodies the migrations do not
-- contain, so read the live catalog before pasting):
--   SELECT c.relname AS table_name, t.tgname AS trigger_name, p.proname AS fn,
--          pg_get_triggerdef(t.oid) AS definition
--   FROM pg_trigger t
--   JOIN pg_class c ON c.oid = t.tgrelid
--   JOIN pg_proc  p ON p.oid = t.tgfoid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE NOT t.tgisinternal AND n.nspname = 'public'
--     AND c.relname IN ('orders','order_items')
--   ORDER BY 1, 2;
--   Expect (repo-derived, verify against the output): orders_updated_at and
--   order_items_updated_at (BEFORE UPDATE, timestamp only),
--   trigger_set_order_item_expiration (BEFORE INSERT OR UPDATE),
--   referral_credit_on_sale_trigger (AFTER UPDATE on orders),
--   vendor_activity_order_trigger (AFTER INSERT on orders). None of these
--   writes buyer_confirmed_at or status, so ordering against them is immaterial.
--
-- POST-CHECK — re-run the query above; the two trg_251_* rows must be present.
--   Behavioural proof (safe, nothing persists — it ends in a rollback):
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';
--     -- both of these must RAISE 42501:
--     UPDATE public.orders SET status = 'paid' WHERE id = '<any order id>';
--     UPDATE public.order_items SET buyer_confirmed_at = now() WHERE id = '<an item id>';
--   ROLLBACK;
--
-- ROLLBACK: DROP TRIGGER trg_251_orders_status_actor ON public.orders;
--           DROP TRIGGER trg_251_order_items_buyer_ack_actor ON public.order_items;
--           (leave the functions; they are inert without the triggers)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. F-10 — only the order's buyer may SET a handoff acknowledgment.
--    Clearing it (→ NULL) stays open, because fulfill's stale-window reset
--    writes NULL with the vendor's session.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_order_item_buyer_ack()
RETURNS TRIGGER
LANGUAGE plpgsql
-- SECURITY INVOKER (default, deliberate): current_user must be the CALLING
-- role. Making this DEFINER would make current_user the owner and disable the
-- guard silently. See the header.
SET search_path = public
AS $guard$
DECLARE
  v_buyer_user_id uuid;
BEGIN
  -- Service role, postgres, cron, the SQL editor: untouched.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- Only a CHANGE to a non-null acknowledgment is governed.
  IF NEW.buyer_confirmed_at IS NOT DISTINCT FROM OLD.buyer_confirmed_at THEN
    RETURN NEW;
  END IF;

  IF NEW.buyer_confirmed_at IS NULL THEN
    RETURN NEW;  -- fulfill's 30-second stale-window reset
  END IF;

  SELECT o.buyer_user_id INTO v_buyer_user_id
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF v_buyer_user_id IS NULL OR v_buyer_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION
      'Only the buyer on this order may acknowledge receipt (order_item %).', NEW.id
      USING ERRCODE = '42501',
            HINT = 'The vendor confirms the handoff by fulfilling, not by writing the buyer''s acknowledgment.';
  END IF;

  RETURN NEW;
END;
$guard$;

COMMENT ON FUNCTION public.guard_order_item_buyer_ack() IS
'Mig 251 (audit F-10): a logged-in caller may only set order_items.buyer_confirmed_at on an order they are the buyer of. Clearing to NULL is allowed (the vendor fulfill route resets an expired confirmation window). Service-role writes are exempt, which is what keeps the market-manager bundle collect-ack stand-in working. SECURITY INVOKER is required — as DEFINER, current_user would be the owner and the guard would never fire.';

DROP TRIGGER IF EXISTS trg_251_order_items_buyer_ack_actor ON public.order_items;
CREATE TRIGGER trg_251_order_items_buyer_ack_actor
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_order_item_buyer_ack();

-- ----------------------------------------------------------------------------
-- 2. F-1 — a logged-in caller may only move an order to 'cancelled'.
--    Every user-client route that writes orders.status writes exactly that
--    value; 'paid' and the rest are service-role transitions.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_order_status_actor()
RETURNS TRIGGER
LANGUAGE plpgsql
-- SECURITY INVOKER (default, deliberate) — see the header.
SET search_path = public
AS $guard$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'cancelled'::order_status THEN
    RAISE EXCEPTION
      'A logged-in user may only cancel an order; % is set by the platform (order %).', NEW.status, NEW.id
      USING ERRCODE = '42501',
            HINT = 'Payment status is written by the checkout, webhook and cron paths through the service role.';
  END IF;

  RETURN NEW;
END;
$guard$;

COMMENT ON FUNCTION public.guard_order_status_actor() IS
'Mig 251 (audit F-1): a logged-in caller may only set orders.status to ''cancelled''. Closes the payout bypass where a faked ''paid'' status short-circuited the payments-row check in fulfill, buyer-confirm, cron Phases 4 and 7, and the bundle margin payout. Service-role writes (checkout, webhooks, crons) are exempt. Known deliberate break: the inactive external-payments confirm route writes ''paid'' with the user client - revive it by moving that write to the service client.';

DROP TRIGGER IF EXISTS trg_251_orders_status_actor ON public.orders;
CREATE TRIGGER trg_251_orders_status_actor
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_order_status_actor();

-- Triggers do not change PostgREST's exposed surface; no schema reload needed.
-- These functions RETURN TRIGGER, so they cannot be invoked over /rpc/ at all —
-- which is why no EXECUTE revoke accompanies them (guardrail Rule M governs
-- SECURITY DEFINER functions and correctly does not fire here).
