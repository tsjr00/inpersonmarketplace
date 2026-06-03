-- Migration 152: Revoke PUBLIC EXECUTE on financial / write SECURITY DEFINER functions (X1a follow-up)
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- To revert this migration on any environment, run as a single transaction.
-- WARNING: rollback re-opens the security hole — every anon caller will be
-- able to invoke these financial / write functions via /rest/v1/rpc/<name>
-- because PUBLIC includes the anon role.
--
--   BEGIN;
--     GRANT EXECUTE ON FUNCTION public.atomic_complete_order_if_ready(uuid) TO PUBLIC;
--     GRANT EXECUTE ON FUNCTION public.atomic_decrement_inventory(uuid, integer) TO PUBLIC;
--     GRANT EXECUTE ON FUNCTION public.atomic_restore_inventory(uuid, integer) TO PUBLIC;
--     GRANT EXECUTE ON FUNCTION public.create_company_paid_order(uuid, uuid, uuid, uuid, uuid, uuid) TO PUBLIC;
--     GRANT EXECUTE ON FUNCTION public.subscribe_to_market_box_if_capacity(uuid, uuid, uuid, integer, date, integer, text) TO PUBLIC;
--     GRANT EXECUTE ON FUNCTION public.subscribe_to_market_box_if_capacity(uuid, uuid, uuid, integer, date, integer, text, text) TO PUBLIC;
--     GRANT EXECUTE ON FUNCTION public.reserve_event_wave(uuid, uuid, uuid) TO PUBLIC;
--     GRANT EXECUTE ON FUNCTION public.cancel_wave_reservation(uuid, uuid) TO PUBLIC;
--     GRANT EXECUTE ON FUNCTION public.free_wave_on_order_cancel(uuid) TO PUBLIC;
--     GRANT EXECUTE ON FUNCTION public.recalculate_wave_capacity(uuid) TO PUBLIC;
--     GRANT EXECUTE ON FUNCTION public.get_or_create_cart(uuid, text) TO PUBLIC;
--     GRANT EXECUTE ON FUNCTION public.get_cart_summary(uuid) TO PUBLIC;
--     GRANT EXECUTE ON FUNCTION public.increment_vendor_cancelled(uuid) TO PUBLIC;
--     GRANT EXECUTE ON FUNCTION public.increment_vendor_confirmed(uuid) TO PUBLIC;
--     -- conditional (only on envs where the function exists):
--     GRANT EXECUTE ON FUNCTION public.book_weekly_booth_atomic(uuid, uuid, uuid, date, uuid) TO PUBLIC;
--     GRANT EXECUTE ON FUNCTION public.replace_market_optin_selections(uuid, jsonb) TO PUBLIC;
--     GRANT EXECUTE ON FUNCTION public.validate_cart_item_inventory(uuid, integer) TO PUBLIC;
--     GRANT EXECUTE ON FUNCTION public.validate_cart_item_market(uuid, uuid) TO PUBLIC;
--   COMMIT;
--
-- =============================================================================
-- WHY THIS MIGRATION EXISTS
-- =============================================================================
-- Migration 149 revoked EXECUTE on these functions FROM `anon` to close
-- Supabase advisor warnings about anon-callable SECURITY DEFINER functions.
-- That worked at the advisor level — the explicit `anon=X/...` ACL entries
-- were removed.
--
-- BUT the default Postgres behavior on `CREATE FUNCTION` is to grant
-- `EXECUTE` to `PUBLIC`. Because `anon` is a regular role, it INHERITS
-- EXECUTE through PUBLIC even after the direct grant is revoked. Verified
-- on Prod 2026-06-02:
--
--   SELECT has_function_privilege('anon', 'public.get_or_create_cart(uuid,text)', 'EXECUTE');
--   -- returned: true
--
--   SELECT proacl FROM pg_proc WHERE proname = 'get_or_create_cart';
--   -- returned: {=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   --          ^^^^^^^^^^^ this empty-grantee entry IS the PUBLIC grant
--
-- So the security hole was never actually closed — only its advisor signal
-- was. PostgREST will still expose these functions via /rest/v1/rpc/<name>
-- to anonymous callers because anon's effective EXECUTE is satisfied
-- through PUBLIC.
--
-- This migration closes the gap by revoking from PUBLIC. After this:
--   - PUBLIC:        no EXECUTE
--   - anon:          no EXECUTE (direct grant removed by mig 149,
--                                PUBLIC inheritance removed by this mig)
--   - authenticated: EXECUTE retained (explicit grant in proacl)
--   - service_role:  EXECUTE retained (explicit grant in proacl)
--   - owner:         EXECUTE retained (always)
--
-- =============================================================================
-- VERIFIED CALLER AUDIT (Session 87, 2026-06-02)
-- =============================================================================
-- Every code path that calls these 18 functions was audited against the
-- requirement: "must run with role = authenticated OR service_role (not
-- anon)". Results — zero anon code paths found:
--
--   atomic_complete_order_if_ready:
--     - cron/expire-orders (service)
--     - vendor/orders/[id]/fulfill (auth-gated)
--     - buyer/orders/[id]/confirm (auth-gated)
--     - vendor/orders/[id]/confirm-handoff (auth-gated)
--   atomic_decrement_inventory:
--     - checkout/session (service, behind auth)
--     - checkout/external (service, behind auth)
--   atomic_restore_inventory:
--     - cron/expire-orders (service)
--     - vendor/orders/[id]/reject (auth-gated)
--   create_company_paid_order:
--     - events/[token]/order (auth-gated — token does not bypass getUser)
--   subscribe_to_market_box_if_capacity (both overloads):
--     - lib/stripe/webhooks.ts (service, signature-verified)
--   reserve_event_wave:
--     - events/[token]/waves/reserve POST (auth-gated)
--   cancel_wave_reservation:
--     - events/[token]/waves/reserve DELETE (auth-gated)
--   free_wave_on_order_cancel:
--     - events/[token]/cancel (auth-gated)
--     - vendor/orders/[id]/reject (auth-gated)
--   recalculate_wave_capacity:
--     - ZERO callers in apps/web/src/  (function exists but is unused)
--   get_or_create_cart:
--     - cart/items POST listing-add (auth-gated, verified at cart/items/route.ts:27)
--     - cart/items POST market-box-add (auth-gated)
--     - checkout/session (auth-gated)
--     - checkout/external (auth-gated)
--   get_cart_summary:
--     - cart GET (auth-gated)
--   increment_vendor_cancelled:
--     - vendor/orders/[id]/reject (auth-gated)
--   increment_vendor_confirmed:
--     - vendor/orders/[id]/confirm (auth-gated)
--   book_weekly_booth_atomic:
--     - vendor/markets/[id]/book (auth-gated)
--   replace_market_optin_selections:
--     - market-manager/[marketId]/optin/selections (manager-auth-gated)
--   validate_cart_item_inventory:
--     - cart/items POST + cart/items/[id] PUT (auth-gated)
--   validate_cart_item_market:
--     - ZERO callers in apps/web/src/  (function exists on prod only, unused)
--
-- No anon code paths exist. Public-facing intake forms (vendor signup,
-- market manager intake, organizer event request) use API routes that
-- write directly to tables via the service client — they do not call
-- any of these 18 RPCs. Public browse / read functions (get_*_within_radius,
-- get_listing_*, etc.) are NOT in this list — they remain anon-callable.
--
-- =============================================================================
-- ENV COMPATIBILITY
-- =============================================================================
-- DO blocks with to_regprocedure() let the same file apply cleanly to:
--   - Dev:     same surface as Staging (assumed)
--   - Staging: has book_weekly_booth_atomic + replace_market_optin_selections
--              (added by migs 142, 143); doesn't have validate_cart_item_*.
--   - Prod:    has validate_cart_item_*; doesn't have 142/143 functions yet
--              (will get them when migs 138-148 ship in this same session).
--
-- This migration should run on Prod AFTER migs 138-148 have applied so the
-- 142/143 functions exist and get locked down in the same session. The DO
-- blocks make ordering forgiving (no-op if the function isn't there), but
-- best practice is: 138-148 → 149 re-run → 152 → push code → 151.
--
-- =============================================================================
-- IDEMPOTENCY
-- =============================================================================
-- REVOKE on a privilege the role doesn't have is a no-op. This file can be
-- re-run any number of times safely.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Universally-present functions (revoke on Dev, Staging, Prod)
-- ----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.atomic_complete_order_if_ready(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.atomic_decrement_inventory(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.atomic_restore_inventory(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_company_paid_order(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.subscribe_to_market_box_if_capacity(uuid, uuid, uuid, integer, date, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.subscribe_to_market_box_if_capacity(uuid, uuid, uuid, integer, date, integer, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reserve_event_wave(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_wave_reservation(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.free_wave_on_order_cancel(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recalculate_wave_capacity(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_or_create_cart(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_cart_summary(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_vendor_cancelled(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_vendor_confirmed(uuid) FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- 2. Phase C functions (migs 142, 143) — present on Dev/Staging, not on Prod
--    until migs 138-148 apply. DO blocks make this a no-op on Prod until then.
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('public.book_weekly_booth_atomic(uuid, uuid, uuid, date, uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.book_weekly_booth_atomic(uuid, uuid, uuid, date, uuid) FROM PUBLIC;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.replace_market_optin_selections(uuid, jsonb)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.replace_market_optin_selections(uuid, jsonb) FROM PUBLIC;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Prod-only functions (exist via direct prod SQL, not via this migrations
--    repo). DO blocks let the file run cleanly on Dev/Staging.
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('public.validate_cart_item_inventory(uuid, integer)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.validate_cart_item_inventory(uuid, integer) FROM PUBLIC;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.validate_cart_item_market(uuid, uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.validate_cart_item_market(uuid, uuid) FROM PUBLIC;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Note: no NOTIFY pgrst is needed — REVOKE doesn't change the schema cache.
-- PostgREST will pick up the new permissions on its next request.
-- ----------------------------------------------------------------------------

-- ============================================================================
-- VERIFICATION (run AFTER the migration. Expect: no rows.)
-- ============================================================================
-- This query returns rows ONLY for functions where PUBLIC still has EXECUTE
-- (i.e., the empty-grantee entry `=X/...` is still in proacl). After this
-- migration successfully applies, the result should be ZERO rows.
--
-- If any rows come back, the REVOKE didn't take effect for that function and
-- you need to investigate (most likely cause: function dropped+recreated
-- between this migration and the verify, which resets ACL).
--
--   SELECT n.nspname AS schema,
--          p.proname AS function_name,
--          pg_catalog.array_to_string(p.proacl, ', ') AS acl
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN (
--       'atomic_complete_order_if_ready',
--       'atomic_decrement_inventory',
--       'atomic_restore_inventory',
--       'create_company_paid_order',
--       'subscribe_to_market_box_if_capacity',
--       'reserve_event_wave',
--       'cancel_wave_reservation',
--       'free_wave_on_order_cancel',
--       'recalculate_wave_capacity',
--       'get_or_create_cart',
--       'get_cart_summary',
--       'increment_vendor_cancelled',
--       'increment_vendor_confirmed',
--       'book_weekly_booth_atomic',
--       'replace_market_optin_selections',
--       'validate_cart_item_inventory',
--       'validate_cart_item_market'
--     )
--     AND EXISTS (
--       SELECT 1 FROM unnest(p.proacl) AS acl_entry
--       WHERE acl_entry::text LIKE '=%'  -- empty grantee = PUBLIC
--     );
