-- Migration 016: Analytics SQL Aggregation Functions
-- Replaces JS-side aggregation with SQL GROUP BY for 3 analytics routes
-- Applied: pending

-- 1. Vendor Revenue Trends
-- Used by: /api/vendor/analytics/trends
-- Replaces: fetch-all transactions + JS grouping by day/week/month
CREATE OR REPLACE FUNCTION get_vendor_revenue_trends(
  p_vendor_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_period TEXT  -- 'day', 'week', 'month'
) RETURNS TABLE(period_date DATE, revenue BIGINT, orders BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    CASE p_period
      WHEN 'week' THEN DATE_TRUNC('week', t.created_at)::DATE
      WHEN 'month' THEN DATE_TRUNC('month', t.created_at)::DATE
      ELSE t.created_at::DATE
    END AS period_date,
    COALESCE(SUM(CASE WHEN t.status = 'fulfilled' THEN l.price_cents ELSE 0 END), 0)::BIGINT AS revenue,
    COUNT(*)::BIGINT AS orders
  FROM transactions t
  LEFT JOIN listings l ON t.listing_id = l.id
  WHERE t.vendor_profile_id = p_vendor_id
    AND t.created_at >= p_start_date::TIMESTAMP
    AND t.created_at < (p_end_date + 1)::TIMESTAMP
  GROUP BY 1
  ORDER BY period_date ASC;
$$;

-- 2. Top Vendors by Revenue
-- Used by: /api/admin/analytics/top-vendors
-- Replaces: fetch-all fulfilled transactions + JS grouping/sorting
CREATE OR REPLACE FUNCTION get_top_vendors(
  p_start_date DATE,
  p_end_date DATE,
  p_vertical_id TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
) RETURNS TABLE(vendor_profile_id UUID, total_sales BIGINT, revenue BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    t.vendor_profile_id,
    COUNT(*)::BIGINT AS total_sales,
    COALESCE(SUM(l.price_cents), 0)::BIGINT AS revenue
  FROM transactions t
  LEFT JOIN listings l ON t.listing_id = l.id
  WHERE t.status = 'fulfilled'
    AND t.created_at >= p_start_date::TIMESTAMP
    AND t.created_at < (p_end_date + 1)::TIMESTAMP
    AND (p_vertical_id IS NULL OR l.vertical_id = p_vertical_id)
  GROUP BY t.vendor_profile_id
  ORDER BY revenue DESC
  LIMIT p_limit;
$$;

-- 3. Analytics Overview (transaction metrics only)
-- Used by: /api/admin/analytics/overview
-- Replaces: fetch-all transactions + JS status counting
CREATE OR REPLACE FUNCTION get_analytics_overview(
  p_start_date DATE,
  p_end_date DATE,
  p_vertical_id TEXT DEFAULT NULL
) RETURNS TABLE(
  total_revenue BIGINT,
  completed_orders BIGINT,
  pending_orders BIGINT,
  cancelled_orders BIGINT,
  total_orders BIGINT,
  average_order_value BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(CASE WHEN t.status = 'fulfilled' THEN l.price_cents ELSE 0 END), 0)::BIGINT AS total_revenue,
    COUNT(CASE WHEN t.status = 'fulfilled' THEN 1 END)::BIGINT AS completed_orders,
    COUNT(CASE WHEN t.status IN ('accepted', 'initiated') THEN 1 END)::BIGINT AS pending_orders,
    COUNT(CASE WHEN t.status IN ('canceled', 'declined') THEN 1 END)::BIGINT AS cancelled_orders,
    COUNT(*)::BIGINT AS total_orders,
    CASE
      WHEN COUNT(CASE WHEN t.status = 'fulfilled' THEN 1 END) > 0
      THEN (COALESCE(SUM(CASE WHEN t.status = 'fulfilled' THEN l.price_cents ELSE 0 END), 0) / COUNT(CASE WHEN t.status = 'fulfilled' THEN 1 END))::BIGINT
      ELSE 0::BIGINT
    END AS average_order_value
  FROM transactions t
  LEFT JOIN listings l ON t.listing_id = l.id
  WHERE t.created_at >= p_start_date::TIMESTAMP
    AND t.created_at < (p_end_date + 1)::TIMESTAMP
    AND (p_vertical_id IS NULL OR l.vertical_id = p_vertical_id);
$$;
