-- Migration 067: Batch listing availability status function
--
-- Creates get_listings_accepting_status(uuid[]) which returns aggregated
-- availability for multiple listings in a single call. Used by browse page,
-- cart validation, and vendor listings page.
--
-- SYNC GUARANTEE: This function calls get_available_pickup_dates() internally
-- via LEFT JOIN LATERAL. If that function changes (new filters, attendance
-- logic, timezone rules, etc.), this function automatically picks up the
-- changes. DO NOT duplicate availability logic here.
--
-- See also: VJ-R15 in business-rules-coverage.test.ts

CREATE OR REPLACE FUNCTION get_listings_accepting_status(p_listing_ids uuid[])
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
  LEFT JOIN LATERAL get_available_pickup_dates(lid) apd ON true
  GROUP BY lid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Notify PostgREST ─────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
