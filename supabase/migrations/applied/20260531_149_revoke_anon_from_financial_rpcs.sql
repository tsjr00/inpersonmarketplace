-- Migration 149: Revoke anon EXECUTE on financial / write SECURITY DEFINER functions (X1a)
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- To revert this migration on any environment, run as a single transaction:
--
--   BEGIN;
--     GRANT EXECUTE ON FUNCTION public.atomic_complete_order_if_ready(uuid) TO anon;
--     GRANT EXECUTE ON FUNCTION public.atomic_decrement_inventory(uuid, integer) TO anon;
--     GRANT EXECUTE ON FUNCTION public.atomic_restore_inventory(uuid, integer) TO anon;
--     GRANT EXECUTE ON FUNCTION public.create_company_paid_order(uuid, uuid, uuid, uuid, uuid, uuid) TO anon;
--     GRANT EXECUTE ON FUNCTION public.subscribe_to_market_box_if_capacity(uuid, uuid, uuid, integer, date, integer, text) TO anon;
--     GRANT EXECUTE ON FUNCTION public.subscribe_to_market_box_if_capacity(uuid, uuid, uuid, integer, date, integer, text, text) TO anon;
--     GRANT EXECUTE ON FUNCTION public.reserve_event_wave(uuid, uuid, uuid) TO anon;
--     GRANT EXECUTE ON FUNCTION public.cancel_wave_reservation(uuid, uuid) TO anon;
--     GRANT EXECUTE ON FUNCTION public.free_wave_on_order_cancel(uuid) TO anon;
--     GRANT EXECUTE ON FUNCTION public.recalculate_wave_capacity(uuid) TO anon;
--     GRANT EXECUTE ON FUNCTION public.get_or_create_cart(uuid, text) TO anon;
--     GRANT EXECUTE ON FUNCTION public.get_cart_summary(uuid) TO anon;
--     GRANT EXECUTE ON FUNCTION public.increment_vendor_cancelled(uuid) TO anon;
--     GRANT EXECUTE ON FUNCTION public.increment_vendor_confirmed(uuid) TO anon;
--     -- staging-only:
--     GRANT EXECUTE ON FUNCTION public.book_weekly_booth_atomic(uuid, uuid, uuid, date, uuid) TO anon;
--     GRANT EXECUTE ON FUNCTION public.replace_market_optin_selections(uuid, jsonb) TO anon;
--     -- prod-only:
--     GRANT EXECUTE ON FUNCTION public.validate_cart_item_inventory(uuid, integer) TO anon;
--     GRANT EXECUTE ON FUNCTION public.validate_cart_item_market(uuid, uuid) TO anon;
--   COMMIT;
--
-- Rollback restores the prior state. Doing so re-opens the security holes
-- documented below.
--
-- Risk profile:
--   This migration changes ONLY permission grants, not schema or data. No
--   tables, columns, triggers, or function bodies are touched.
--
--   All known callers of these functions use either the authenticated user's
--   supabase client (role = authenticated) OR the service client
--   (role = service_role). Both retain EXECUTE — only `anon` loses it.
--
--   Verified call sites:
--     atomic_complete_order_if_ready: api/cron/expire-orders + 3 auth API routes
--     atomic_decrement_inventory:     api/checkout/session (service client)
--     atomic_restore_inventory:       api/buyer/orders/[id]/cancel (auth + service)
--     create_company_paid_order:      api/events/[token]/select (service client)
--     subscribe_to_market_box_if_capacity: api/checkout/success + webhooks (service)
--     reserve_event_wave:             api/events/[token]/select (service)
--     cancel_wave_reservation:        cron + auth routes
--     free_wave_on_order_cancel:      cron + webhooks (service)
--     recalculate_wave_capacity:      admin routes (service)
--     get_or_create_cart:             api/cart/* (auth user client)
--     get_cart_summary:               api/cart/* (auth user client)
--     increment_vendor_cancelled/_confirmed: webhook handlers (service)
--     book_weekly_booth_atomic:       api/vendor/markets/[id]/book (service)
--     replace_market_optin_selections: market-manager API routes (service)
--     validate_cart_item_*:           cart-add API (service)
--
--   If any REVOKE causes a regression, it will surface as 4xx on the affected
--   route in app logs. Rollback by re-granting the specific function.
--
-- Dependencies: none. Safe to apply at any point relative to other migrations.
-- =============================================================================
--
-- What this migration does:
--
-- Removes the `anon` role's EXECUTE privilege on SECURITY DEFINER functions
-- that perform financial, inventory, cart, event-reservation, or other write
-- operations. The Supabase advisor flagged these as exposed via
-- /rest/v1/rpc/<function_name> to unauthenticated callers — any anon HTTP
-- client could invoke them directly, bypassing the intended app-layer auth.
--
-- After this migration:
--   - authenticated role: EXECUTE retained
--   - service_role:       EXECUTE retained (implicit via *)
--   - anon role:          EXECUTE revoked  ← the fix
--
-- Functions left exposed to anon (intentionally public buyer-browse surface,
-- per separate audit — verified by user on 2026-05-31):
--   get_listings_within_radius, get_markets_within_radius,
--   get_vendors_within_radius, get_nearby_zip_codes, get_region_zip_codes,
--   get_zip_coordinates, get_listing_fields, get_vendor_fields,
--   get_listing_markets_summary, get_listing_open_markets,
--   get_listings_accepting_status, get_available_pickup_dates,
--   get_vendor_next_pickup_date, is_listing_accepting_orders,
--   get_event_waves_with_availability, get_vertical_config,
--   st_estimatedextent (3 PostGIS overloads)
--
-- Scope (X1a only — financial + write functions):
--   This is the first of three planned security migrations:
--     X1a (this file):  ~18 financial/write functions  ← APPLYING NOW
--     X1b (mig 150+):   ~50 trigger + auth-check functions (cleanup)
--     X2  (mig 151+):   Storage bucket policies (listing-images, vendor-images,
--                       vendor-documents — tighten DELETE/UPDATE to owner-only)
--
-- Env compatibility:
--   DO blocks with to_regprocedure() let the same file apply cleanly to:
--     - Staging: has book_weekly_booth_atomic + replace_market_optin_selections
--       (added by pending migs 142, 143); doesn't have validate_cart_item_*.
--     - Prod:    has validate_cart_item_*; doesn't have 142/143 functions yet.
--   When migs 138-148 eventually ship to prod, the prod application will
--   recreate book_weekly_booth_atomic + replace_market_optin_selections with
--   default-grant. A follow-up REVOKE for those two functions will be needed
--   in the same prod-push session (or this migration can be re-run — REVOKE
--   is idempotent on already-revoked functions).

-- ----------------------------------------------------------------------------
-- 1. Universally-present functions (revoke on both envs)
-- ----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.atomic_complete_order_if_ready(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.atomic_decrement_inventory(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.atomic_restore_inventory(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_company_paid_order(uuid, uuid, uuid, uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.subscribe_to_market_box_if_capacity(uuid, uuid, uuid, integer, date, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.subscribe_to_market_box_if_capacity(uuid, uuid, uuid, integer, date, integer, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reserve_event_wave(uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_wave_reservation(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.free_wave_on_order_cancel(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recalculate_wave_capacity(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_or_create_cart(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_cart_summary(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_vendor_cancelled(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_vendor_confirmed(uuid) FROM anon;

-- ----------------------------------------------------------------------------
-- 2. Staging-only functions (Phase C migs 142, 143 — pending Prod)
-- DO blocks let the file apply on prod cleanly (no-op when function absent).
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('public.book_weekly_booth_atomic(uuid, uuid, uuid, date, uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.book_weekly_booth_atomic(uuid, uuid, uuid, date, uuid) FROM anon;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.replace_market_optin_selections(uuid, jsonb)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.replace_market_optin_selections(uuid, jsonb) FROM anon;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Prod-only functions (exist via direct prod SQL, not via this migrations
-- repo). DO blocks for staging-cleanliness.
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('public.validate_cart_item_inventory(uuid, integer)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.validate_cart_item_inventory(uuid, integer) FROM anon;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.validate_cart_item_market(uuid, uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.validate_cart_item_market(uuid, uuid) FROM anon;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Note: no NOTIFY pgrst is needed — REVOKE doesn't change the schema cache.
-- PostgREST will pick up the new permissions on its next request.
-- ----------------------------------------------------------------------------
