-- Migration 245: browse pill — optional event-market exclusion in batch availability
--
-- A5 staging finding (2026-09-05): the browse card pill showed "open" for
-- listings whose ONLY accepting dates are on an event market, while the listing
-- detail page filters event dates out (events sell via /events/[token]/shop,
-- page.tsx:162-165) and shows closed. Buyers clicked through unmarked cards
-- only to find the listing closed. The pill must answer the same question the
-- detail page answers.
--
-- Change: get_listings_accepting_status gains p_exclude_event_markets
-- (DEFAULT false — every existing caller is unchanged: cart validate ×2,
-- checkout session, vendor listings page). Only the browse page passes true.
--
-- The old 1-arg signature MUST be dropped first: CREATE with the new signature
-- would otherwise create an OVERLOAD, making PostgREST's named-arg call
-- rpc('get_listings_accepting_status', {p_listing_ids}) ambiguous (both
-- functions match) and 300-erroring every consumer.
--
-- markets.market_type is NOT NULL (snapshot), so the != 'event' predicate
-- cannot NULL-drop non-event rows.

DROP FUNCTION IF EXISTS get_listings_accepting_status(uuid[]);

-- SYNC GUARANTEE (carried from mig 067): calls get_available_pickup_dates()
-- via LEFT JOIN LATERAL — any change to that function's filters/attendance/
-- timezone logic is picked up automatically. DO NOT duplicate availability
-- logic here. See VJ-R15 in business-rules-coverage.test.ts.
CREATE FUNCTION get_listings_accepting_status(
  p_listing_ids uuid[],
  p_exclude_event_markets boolean DEFAULT false
)
RETURNS TABLE (
  listing_id uuid,
  is_accepting boolean,
  hours_until_cutoff numeric,
  cutoff_hours integer
)
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lid AS listing_id,
    COALESCE(bool_or(apd.is_accepting), false) AS is_accepting,
    MIN(CASE WHEN apd.is_accepting THEN apd.hours_until_cutoff END) AS hours_until_cutoff,
    MIN(CASE WHEN apd.is_accepting THEN apd.cutoff_hours END) AS cutoff_hours
  FROM unnest(p_listing_ids) AS lid
  LEFT JOIN LATERAL get_available_pickup_dates(lid) apd
    ON (NOT p_exclude_event_markets OR apd.market_type != 'event')
  GROUP BY lid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Intentionally public buyer-browse surface (mig 149 audit list) — DROP+CREATE
-- resets grants, so restore them explicitly.
GRANT EXECUTE ON FUNCTION get_listings_accepting_status(uuid[], boolean) TO anon, authenticated;

-- ── Notify PostgREST ─────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
