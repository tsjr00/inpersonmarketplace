-- ============================================================================
-- Migration 226: Close public DB-layer reads of private-event data (audit G-1/G-2/G-3)
-- Date: 2026-08-13
-- Apply order: Dev → Staging → Prod, running the VERIFICATION RECIPE below
-- before and after on each environment. Found by the retrospective
-- second-surface audit, category G (RLS policy ↔ route checks), from
-- pg_policies inventories the owner ran on Staging AND Prod 2026-08-13
-- (identical on both).
--
-- ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
-- The anon + authenticated roles hold full table grants (Supabase default),
-- so the RLS policy qual is the ONLY lock on direct PostgREST access. Three
-- locks were open:
--
--   G-2  catering_requests.public_event_token_read (mig 091) granted anon
--        SELECT where `event_token IS NOT NULL AND status IN
--        ('approved','completed')`. Mig 091's changelog says the INTENT was
--        "read an event BY TOKEN" — but the policy never requires the caller
--        to supply the token, so it grants enumeration of EVERY approved
--        event: company_name, street address, contact fields. The identity
--        that T-09/T-67/T-75 masked at the API layer, readable at the DB
--        layer by the anonymous internet.
--
--   G-1  market_vendors_select was `USING (true)`: every row public,
--        including response_notes (the private message a vendor types when
--        accepting an event invitation) and vendor ↔ private-event linkage.
--
--   G-3  markets_select's public disjunct (approved AND active) includes
--        EVENT markets, so a PRIVATE event's market row — real event name,
--        address — was publicly readable.
--
-- ── LOAD-BEARING ANALYSIS (verified in code 2026-08-13, do not skip when
--    editing these policies again) ────────────────────────────────────────
--   catering_requests: NO app read uses the user client. Every file touching
--     the table also creates a service client; the public event page
--     (events/[token]/page.tsx:18), dashboards, and nav-destinations were
--     spot-verified on the service client. Dropping the policy breaks nothing.
--   market_vendors user-client readers: vendors/page.tsx:95 + api/markets/
--     [id]/vendors (public NON-EVENT membership — preserved by the non-event
--     disjunct); markets/[id]/page.tsx:142, vendor/dashboard/page.tsx:292,
--     vendor-signup:249 (own rows — preserved by the own-rows disjunct).
--   markets: the vendor dashboard embeds markets THROUGH market_vendors via
--     the user client (dashboard:295), so invited vendors MUST retain read
--     of their event markets — that is the new user_vendor_market_ids()
--     disjunct. Buyer search is service-client (RLS-exempt); the buyer-order
--     disjuncts are preserved verbatim.
--
-- ── WHY THE TWO HELPER FUNCTIONS ────────────────────────────────────────────
-- markets' policy needs to consult market_vendors, and market_vendors' policy
-- needs to consult markets. Two tables' policies referencing each other
-- directly makes Postgres raise "infinite recursion detected in policy".
-- SECURITY DEFINER helpers (the existing user_vendor_profile_ids() pattern)
-- read the other table without re-entering its policy.
--
-- ── VERIFICATION RECIPE ─────────────────────────────────────────────────────
-- Run this block BEFORE applying (expectations marked PRE) and again AFTER
-- (expectations marked POST). It only reads, and the ROLLBACK undoes the
-- role switch. Dev note: dev has no events, so A/B/C may already be 0 there —
-- the D baseline still proves the directory survives.
--
--   BEGIN;
--   SET LOCAL ROLE anon;
--   SELECT 'A_events_enumerable' AS check, count(*) FROM catering_requests;
--     -- PRE: > 0 wherever approved events exist   POST: 0
--   SELECT 'B_event_vendor_rows' AS check, count(*)
--     FROM market_vendors mv JOIN markets m ON m.id = mv.market_id
--     WHERE m.market_type = 'event';
--     -- PRE: > 0 wherever events have vendors     POST: 0
--   SELECT 'C_private_event_markets' AS check, count(*)
--     FROM markets WHERE market_type = 'event' AND is_private IS TRUE;
--     -- PRE: > 0 wherever private events exist    POST: 0
--   SELECT 'D_directory_baseline' AS check, count(*)
--     FROM market_vendors mv JOIN markets m ON m.id = mv.market_id
--     WHERE m.market_type <> 'event';
--     -- PRE: some N                               POST: the SAME N
--   ROLLBACK;
--
-- Browser pass after staging apply: public vendors page, one market detail
-- page, vendor dashboard (My Vendor Events card), one public event page.
-- ============================================================================

-- ── Helper 1: is this market an event market? (bypasses markets RLS) ────────
CREATE OR REPLACE FUNCTION public.is_event_market(m_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM markets WHERE id = m_id AND market_type = 'event');
$$;
GRANT EXECUTE ON FUNCTION public.is_event_market(uuid) TO anon, authenticated;

-- ── Helper 2: market ids the current user's vendor profiles belong to ───────
-- (bypasses market_vendors RLS; empty set for non-vendors and anon)
CREATE OR REPLACE FUNCTION public.user_vendor_market_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT mv.market_id
  FROM market_vendors mv
  WHERE mv.vendor_profile_id IN (
    SELECT vp.id FROM vendor_profiles vp WHERE vp.user_id = auth.uid()
  );
$$;
GRANT EXECUTE ON FUNCTION public.user_vendor_market_ids() TO anon, authenticated;

-- ── G-2: drop the token-in-name-only policy ─────────────────────────────────
DROP POLICY IF EXISTS public_event_token_read ON public.catering_requests;

-- ── G-1: market_vendors — public read for NON-event markets only ────────────
DROP POLICY IF EXISTS market_vendors_select ON public.market_vendors;
CREATE POLICY market_vendors_select ON public.market_vendors
  FOR SELECT USING (
    vendor_profile_id IN (SELECT user_vendor_profile_ids())
    OR NOT public.is_event_market(market_id)
    OR can_admin_market(market_id)
    OR (SELECT is_platform_admin())
  );

-- ── G-3: markets — public disjunct excludes PRIVATE event markets; invited
--         vendors keep read of their event markets. All pre-existing
--         disjuncts preserved verbatim from the live policy. ─────────────────
DROP POLICY IF EXISTS markets_select ON public.markets;
CREATE POLICY markets_select ON public.markets
  FOR SELECT USING (
    (
      (approval_status = 'approved'::market_approval_status)
      AND (active = true)
      AND (market_type <> 'event' OR is_private IS NOT TRUE)
    )
    OR (submitted_by_vendor_id IN (SELECT user_vendor_profile_ids()))
    OR (id IN (
      SELECT oi.market_id
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.buyer_user_id = (SELECT auth.uid()) AND oi.market_id IS NOT NULL
    ))
    OR (id IN (
      SELECT lm.market_id
      FROM listing_markets lm
      JOIN order_items oi ON oi.listing_id = lm.listing_id
      JOIN orders o ON o.id = oi.order_id
      WHERE o.buyer_user_id = (SELECT auth.uid())
    ))
    OR (id IN (SELECT public.user_vendor_market_ids()))
    OR (SELECT is_platform_admin())
    OR is_vertical_admin(vertical_id)
  );

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK (restores the exact pre-226 policies, captured from the live
-- pg_policies dump 2026-08-13; the helper functions are harmless to leave):
--
--   DROP POLICY IF EXISTS market_vendors_select ON public.market_vendors;
--   CREATE POLICY market_vendors_select ON public.market_vendors
--     FOR SELECT USING (true);
--
--   CREATE POLICY public_event_token_read ON public.catering_requests
--     FOR SELECT TO anon, authenticated
--     USING ((event_token IS NOT NULL) AND (status = ANY (ARRAY['approved'::text, 'completed'::text])));
--
--   DROP POLICY IF EXISTS markets_select ON public.markets;
--   CREATE POLICY markets_select ON public.markets
--     FOR SELECT USING (
--       ((approval_status = 'approved'::market_approval_status) AND (active = true))
--       OR (submitted_by_vendor_id IN (SELECT user_vendor_profile_ids()))
--       OR (id IN (SELECT oi.market_id FROM order_items oi JOIN orders o ON o.id = oi.order_id
--                  WHERE o.buyer_user_id = (SELECT auth.uid()) AND oi.market_id IS NOT NULL))
--       OR (id IN (SELECT lm.market_id FROM listing_markets lm
--                  JOIN order_items oi ON oi.listing_id = lm.listing_id
--                  JOIN orders o ON o.id = oi.order_id
--                  WHERE o.buyer_user_id = (SELECT auth.uid())))
--       OR (SELECT is_platform_admin())
--       OR is_vertical_admin(vertical_id)
--     );
--   NOTIFY pgrst, 'reload schema';
-- ============================================================================
