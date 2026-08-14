-- ============================================================================
-- Migration 227: event_vendor_listings — hide private-event links from public
-- Date: 2026-08-13. Follow-up to mig 226 (audit category G residual).
-- Apply order: Dev → Staging → Prod, with the recipe below. Requires 226
-- (its pattern, not its objects — 227 is self-contained).
--
-- ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
-- `event_vendor_listings_public_select` is `USING (true)`: every row —
-- (market_id, vendor_profile_id, listing_id) — is anonymously readable,
-- including links into PRIVATE events. Severity LOW after 226 (the private
-- market behind the link is no longer identifiable anonymously), but the
-- linkage itself is the same class 226 closed and costs one policy to fix.
--
-- ── LOAD-BEARING ANALYSIS (verified in code 2026-08-13) ─────────────────────
-- The ONLY user-client read is lib/markets/vendors-with-listings.ts:110-129,
-- which queries this table exclusively when `market.market_type = 'event'` —
-- i.e. the public market page / vendors-with-listings API for an event
-- market. For PUBLIC events that must keep working; for PRIVATE events the
-- markets read above it already returns not_found to anon post-226, so no
-- public page ever legitimately reaches a private event's rows.
-- Vendors' own reads (respond flow) use the separate vendor_select policy;
-- admin uses admin_all; shop page + event routes use the service client.
-- All untouched.
--
-- ── VERIFICATION RECIPE ─────────────────────────────────────────────────────
-- Step 1 (admin, no role switch) — baseline, note both numbers:
--   SELECT (SELECT count(*) FROM event_vendor_listings) AS total_rows,
--          (SELECT count(*) FROM event_vendor_listings evl
--             JOIN markets m ON m.id = evl.market_id
--            WHERE m.market_type = 'event' AND m.is_private IS TRUE) AS private_link_rows;
-- Step 2 (anon) — BEFORE applying:
--   BEGIN; SET LOCAL ROLE anon;
--   SELECT count(*) AS anon_visible FROM event_vendor_listings;
--   ROLLBACK;
--   -- EXPECT: anon_visible = total_rows (the leak)
-- Step 3: apply this migration.
-- Step 4: repeat step 2.
--   -- EXPECT: anon_visible = total_rows - private_link_rows
-- ============================================================================

-- Helper: is this market a PRIVATE event? SECURITY DEFINER so the policy can
-- consult markets without re-entering markets' own policy (recursion guard,
-- same pattern as mig 226's is_event_market).
CREATE OR REPLACE FUNCTION public.is_private_event_market(m_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM markets
    WHERE id = m_id AND market_type = 'event' AND is_private IS TRUE
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_private_event_market(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS event_vendor_listings_public_select ON public.event_vendor_listings;
CREATE POLICY event_vendor_listings_public_select ON public.event_vendor_listings
  FOR SELECT USING (
    NOT public.is_private_event_market(market_id)
  );

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK (restores the exact pre-227 policy; the helper is harmless to leave):
--   DROP POLICY IF EXISTS event_vendor_listings_public_select ON public.event_vendor_listings;
--   CREATE POLICY event_vendor_listings_public_select ON public.event_vendor_listings
--     FOR SELECT USING (true);
--   NOTIFY pgrst, 'reload schema';
-- ============================================================================
