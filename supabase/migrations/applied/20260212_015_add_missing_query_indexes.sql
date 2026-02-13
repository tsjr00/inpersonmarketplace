-- Add missing indexes identified during codebase audit.
-- These FK columns and common query patterns lacked covering indexes.

-- order_items.order_id: FK column used in every order detail, checkout success,
-- notification, and pickup query via joins. No index existed.
CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON public.order_items (order_id);

-- orders.buyer_user_id: Used by all buyer-facing pages (orders list, unrated,
-- subscriptions, dashboard). Only had vertical_id + created_at composite before.
CREATE INDEX IF NOT EXISTS idx_orders_buyer_user_id
  ON public.orders (buyer_user_id);

-- orders composite for buyer + status queries: buyer orders list, unrated orders,
-- dashboard counts all filter by buyer_user_id + status.
CREATE INDEX IF NOT EXISTS idx_orders_buyer_status_created
  ON public.orders (buyer_user_id, status, created_at DESC);

-- transactions composite for analytics: admin analytics routes query by
-- vertical_id + status + created_at. Individual column indexes exist but
-- no composite for the common filter pattern.
CREATE INDEX IF NOT EXISTS idx_transactions_vertical_status_created
  ON public.transactions (vertical_id, status, created_at DESC);
