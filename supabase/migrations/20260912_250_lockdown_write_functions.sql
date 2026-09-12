-- ============================================================================
-- Migration 250: lock 22 write-capable SECURITY DEFINER functions to the
--                service role (audit 2026-09-12, findings F-2 and F-4)
-- ============================================================================
-- ✅ PASTE-AND-GO — no code deploy has to precede this file on any environment.
--    Every function below is called ONLY through a service client today
--    (verified 2026-09-12 by reading every non-test call site, see "Callers").
--    On PROD, paste in the standing order: 238…247, then 248, 249, then this.
--
-- WHY THIS EXISTS — mig 248 did not close what it was written to close.
--   Supabase grants EXECUTE explicitly to anon, authenticated and service_role
--   when a function is created, ON TOP OF Postgres's default grant to PUBLIC.
--   Mig 248 revoked only FROM PUBLIC, so the explicit anon grant survived.
--   Live check on 2026-09-12 (all three environments, owner-run):
--     anon can still execute        vendor_skip_week, scan_vendor_activity,
--                                   cleanup_cart_items_invalid_schedules,
--                                   refresh_vendor_location,
--                                   refresh_all_vendor_locations
--                                   (+ the two bundle fns on Dev/Staging)
--     authenticated can execute     every write function in the list below,
--                                   on Dev, Staging AND Prod
--   Concretely, before this file: anyone holding the public anon key can skip
--   any market-box pickup; any logged-in user can zero any listing's stock and
--   flip it to draft, create an ACTIVE market-box subscription with no payment,
--   mark a booth season paid with a made-up payment-intent string, or wipe a
--   market's opt-in selections. None of these functions inspects its caller.
--
-- THE SHAPE OF A LOCKDOWN (rule added to verification-discipline.md 2026-09-12
-- after the 248 lesson): REVOKE FROM PUBLIC, anon, authenticated — all three,
-- because PUBLIC is inherited and the explicit grants survive a PUBLIC revoke —
-- then GRANT TO service_role, then verify with has_function_privilege for all
-- three roles. Revoking a privilege a role does not hold is a no-op, so this
-- file is re-runnable and safe on an environment that already had some of it.
--
-- CALLERS (every non-test .rpc( call site read 2026-09-12; no call site builds
-- the function name dynamically — re-verified by a second, statement-level
-- scan during the audit):
--   checkout/session, checkout/external, checkout/success ....... serviceClient
--   lib/stripe/webhooks.ts (18 decls, all createServiceClient) ... service
--   lib/inventory.ts ............ takes the client as a parameter; all 13
--                                 callers pass a service client
--   crons expire-orders, vendor-activity-scan ... createClient(SERVICE_ROLE_KEY)
--   cron event-reconfirm ........................ createServiceClient()
--   events token routes, vendor markets/orders/events, market-manager . service
--   skip route .................. service client since 7365a1ab (mig 248's
--                                 companion deploy), after its ownership check
--   ensure_user_profile ......... THE ONE EXCEPTION: the login page calls it
--                                 with the USER session (login/page.tsx:110),
--                                 so authenticated KEEPS execute here; mig 248
--                                 put an auth.uid() guard in its body, so a
--                                 caller can only ensure their own profile.
--
-- DELIBERATELY NOT IN THIS FILE (each has a live user-client caller; locking
-- them needs a code change first, which is its own push):
--   increment_vendor_confirmed / increment_vendor_cancelled
--       vendor/orders/[id]/confirm:96 and reject:264 still call these with the
--       user client. Any logged-in user can inflate a vendor's cancellation
--       rate today, which fires the warning email and lowers their event
--       matching score. Reputational, not money. Owner deferred 2026-09-12.
--   atomic_complete_order_if_ready ... self-limiting (completes only an order
--       whose items all carry both confirmations)
--   get_or_create_cart ............... low value to an attacker
--   validate_cart_item_inventory ..... no definition in the repo (F-9)
--
-- PRE-CHECK (run before pasting; this is the query whose output justified the
-- file — expect auth_exec = true on nearly every row, anon_exec = true on the
-- five F-2 leftovers, plus the two bundle fns on Dev/Staging):
--   SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
--          has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.prosecdef
--     AND p.proname IN ('vendor_skip_week','cleanup_cart_items_invalid_schedules',
--       'refresh_vendor_location','refresh_all_vendor_locations','scan_vendor_activity',
--       'atomic_decrement_inventory','atomic_restore_inventory','create_company_paid_order',
--       'subscribe_to_market_box_if_capacity','reserve_event_wave','cancel_wave_reservation',
--       'free_wave_on_order_cancel','recalculate_wave_capacity','book_weekly_booth_atomic',
--       'replace_market_optin_selections','book_season_atomic','confirm_season_paid',
--       'cancel_season_group','book_park_spot_atomic','atomic_increment_bundle_sold',
--       'atomic_release_bundle_sold','ensure_user_profile')
--   ORDER BY 1, 2;
--
-- POST-CHECK: re-run the SAME query. Expect anon_exec = false and
--   auth_exec = false on EVERY row except ensure_user_profile, which must stay
--   anon_exec = false / auth_exec = TRUE (the login page needs it). Add
--   has_function_privilege('service_role', p.oid, 'EXECUTE') and expect true
--   everywhere — all three roles checked, which is the step 248 skipped.
--
-- ROLLBACK (restores the hole — only if a real caller turns out to be broken):
--   GRANT EXECUTE ON FUNCTION <the signature that broke> TO authenticated;
--   Do NOT blanket-grant back to PUBLIC; grant the single signature and report
--   which caller needed it, because that caller is using the wrong client.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Service-role-only: revoke all three PostgREST roles.
--    (PUBLIC is revoked too — it is inherited by anon and authenticated, and
--     leaving it is exactly how mig 248 failed.)
-- ----------------------------------------------------------------------------

-- F-2 leftovers: the five mig 248 aimed at and did not close
REVOKE EXECUTE ON FUNCTION public.vendor_skip_week(uuid, text)                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_cart_items_invalid_schedules()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_vendor_location(uuid)                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_all_vendor_locations()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.scan_vendor_activity(text)                        FROM PUBLIC, anon, authenticated;

-- F-4: inventory
REVOKE EXECUTE ON FUNCTION public.atomic_decrement_inventory(uuid, integer)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.atomic_restore_inventory(uuid, integer)            FROM PUBLIC, anon, authenticated;

-- F-4: orders and market-box subscriptions (both overloads of subscribe_*)
REVOKE EXECUTE ON FUNCTION public.create_company_paid_order(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscribe_to_market_box_if_capacity(uuid, uuid, uuid, integer, date, integer, text)       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.subscribe_to_market_box_if_capacity(uuid, uuid, uuid, integer, date, integer, text, text) FROM PUBLIC, anon, authenticated;

-- F-4: event waves
REVOKE EXECUTE ON FUNCTION public.reserve_event_wave(uuid, uuid, uuid)               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_wave_reservation(uuid, uuid)                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.free_wave_on_order_cancel(uuid)                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_wave_capacity(uuid)                    FROM PUBLIC, anon, authenticated;

-- F-4: booths, seasons, park spots, opt-in selections
REVOKE EXECUTE ON FUNCTION public.book_weekly_booth_atomic(uuid, uuid, uuid, date, uuid)                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.replace_market_optin_selections(uuid, jsonb)                                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.book_season_atomic(uuid, uuid, uuid, uuid, uuid, text, date[], date)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_season_paid(uuid, text)                                             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_season_group(uuid, text)                                             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.book_park_spot_atomic(uuid, uuid, uuid, date[], uuid, uuid)                 FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Explicit service_role grants (belt and braces; no-op where already held).
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.vendor_skip_week(uuid, text)                        TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_cart_items_invalid_schedules()              TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_vendor_location(uuid)                       TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_all_vendor_locations()                      TO service_role;
GRANT EXECUTE ON FUNCTION public.scan_vendor_activity(text)                          TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_decrement_inventory(uuid, integer)            TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_restore_inventory(uuid, integer)              TO service_role;
GRANT EXECUTE ON FUNCTION public.create_company_paid_order(uuid, uuid, uuid, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.subscribe_to_market_box_if_capacity(uuid, uuid, uuid, integer, date, integer, text)       TO service_role;
GRANT EXECUTE ON FUNCTION public.subscribe_to_market_box_if_capacity(uuid, uuid, uuid, integer, date, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_event_wave(uuid, uuid, uuid)                 TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_wave_reservation(uuid, uuid)                  TO service_role;
GRANT EXECUTE ON FUNCTION public.free_wave_on_order_cancel(uuid)                      TO service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_wave_capacity(uuid)                      TO service_role;
GRANT EXECUTE ON FUNCTION public.book_weekly_booth_atomic(uuid, uuid, uuid, date, uuid)                       TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_market_optin_selections(uuid, jsonb)                                 TO service_role;
GRANT EXECUTE ON FUNCTION public.book_season_atomic(uuid, uuid, uuid, uuid, uuid, text, date[], date)         TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_season_paid(uuid, text)                                              TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_season_group(uuid, text)                                              TO service_role;
GRANT EXECUTE ON FUNCTION public.book_park_spot_atomic(uuid, uuid, uuid, date[], uuid, uuid)                  TO service_role;

-- ----------------------------------------------------------------------------
-- 3. ensure_user_profile — the one function a user session must still call.
--    anon loses it (auth.uid() is NULL for anon, so its guard already refused
--    those callers; this is ACL hygiene). authenticated KEEPS it: the login
--    page calls it with the user's own session and the mig-248 body guard
--    limits every caller to their own profile row.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.ensure_user_profile(uuid, text, text)              FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ensure_user_profile(uuid, text, text)              TO authenticated;
GRANT  EXECUTE ON FUNCTION public.ensure_user_profile(uuid, text, text)              TO service_role;

-- ----------------------------------------------------------------------------
-- 4. The two bundle functions exist only where mig 244 has been applied
--    (Dev + Staging today; NOT Prod). to_regprocedure returns NULL instead of
--    raising when the signature is absent, so this block is a no-op on Prod and
--    does not have to be removed when 244 lands there later.
--
--    Mig 244 revoked them FROM anon, authenticated but not FROM PUBLIC — the
--    exact inverse of 248's gap — so PUBLIC inheritance left both roles able to
--    execute them. Confirmed anon_exec = true on Dev and Staging 2026-09-12.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.atomic_increment_bundle_sold(uuid, integer)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.atomic_increment_bundle_sold(uuid, integer) FROM PUBLIC, anon, authenticated;
    GRANT  EXECUTE ON FUNCTION public.atomic_increment_bundle_sold(uuid, integer) TO service_role;
  END IF;

  IF to_regprocedure('public.atomic_release_bundle_sold(uuid, integer)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.atomic_release_bundle_sold(uuid, integer) FROM PUBLIC, anon, authenticated;
    GRANT  EXECUTE ON FUNCTION public.atomic_release_bundle_sold(uuid, integer) TO service_role;
  END IF;
END $$;

-- PostgREST decides which functions to expose per role from the catalog it
-- caches; privilege changes are enforced by Postgres regardless, but reloading
-- makes the /rpc/ surface match immediately.
NOTIFY pgrst, 'reload schema';
