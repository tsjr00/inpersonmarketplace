-- Migration 132: Drop legacy analytics SQL functions
--
-- These three functions were created in migration 016 (2026-02-12) and queried
-- the legacy `transactions` table. Migration 046 (2026-02-21) explicitly noted
-- "transactions + fulfillments tables are legacy (replaced by orders/order_items
-- system)" and dropped associated indexes — but migration 016's analytics
-- functions were left pointing at the now-empty legacy table.
--
-- Result: admin analytics dashboards have shown $0 / 0 orders since the data-
-- model migration completed. The vendor-side analytics routes (overview +
-- trends) were already migrated to query order_items directly via the
-- "C7 FIX" — admin-side was missed.
--
-- Replaced by JS aggregation in the admin analytics routes themselves
-- (matching the vendor-side pattern). The functions have no remaining callers
-- after the route rewrites land in the same commit:
--   • get_analytics_overview        → /api/admin/analytics/overview
--   • get_top_vendors               → /api/admin/analytics/top-vendors
--   • get_vendor_revenue_trends     → no callers (vendor trends route bypassed
--                                      this function via direct order_items
--                                      query in an earlier migration)
--
-- Rollback: re-CREATE the functions from migration 016 source if needed,
-- but they would still query the empty `transactions` table, so rollback is
-- effectively never useful.

DROP FUNCTION IF EXISTS public.get_analytics_overview(DATE, DATE, TEXT);
DROP FUNCTION IF EXISTS public.get_top_vendors(DATE, DATE, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.get_vendor_revenue_trends(UUID, DATE, DATE, TEXT);
