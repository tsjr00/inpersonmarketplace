-- Performance indexes based on actual query patterns in the codebase.
-- Targets high-traffic endpoints and cron jobs.

-- 1. NOTIFICATIONS — No indexes exist, heavily queried by every page load
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, read_at, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);

-- 2. ORDER_ITEMS — expire-orders cron queries pending items by expires_at
CREATE INDEX IF NOT EXISTS idx_order_items_status_expires
  ON public.order_items(status, expires_at)
  WHERE status = 'pending' AND cancelled_at IS NULL;

-- 3. ORDER_ITEMS — vendor orders endpoint filters by vendor + status + date
CREATE INDEX IF NOT EXISTS idx_order_items_vendor_status_created
  ON public.order_items(vendor_profile_id, status, created_at DESC)
  WHERE cancelled_at IS NULL;

-- 4. ORDER_ITEMS — vendor prep route filters by pickup_date + market
CREATE INDEX IF NOT EXISTS idx_order_items_pickup_date_market
  ON public.order_items(pickup_date, market_id, status)
  WHERE status != 'cancelled' AND pickup_date IS NOT NULL;

-- 5. ORDERS — parent_order_id for split-order lookups
CREATE INDEX IF NOT EXISTS idx_orders_parent_id
  ON public.orders(parent_order_id)
  WHERE parent_order_id IS NOT NULL;

-- 6. ORDERS — admin analytics by vertical + date
CREATE INDEX IF NOT EXISTS idx_orders_vertical_created
  ON public.orders(vertical_id, created_at DESC);

-- 7. MARKET_BOX_PICKUPS — vendor upcoming pickups query
CREATE INDEX IF NOT EXISTS idx_market_box_pickups_sub_date_status
  ON public.market_box_pickups(subscription_id, scheduled_date, status)
  WHERE status IN ('scheduled', 'ready');

-- 8. MARKET_BOX_OFFERINGS — vendor active offerings
CREATE INDEX IF NOT EXISTS idx_market_box_offerings_vendor_active
  ON public.market_box_offerings(vendor_profile_id, active, created_at DESC)
  WHERE active = true;

-- 9. MARKET_BOX_SUBSCRIPTIONS — active subscriber count per offering
CREATE INDEX IF NOT EXISTS idx_market_box_subscriptions_offering_active
  ON public.market_box_subscriptions(offering_id, status)
  WHERE status = 'active';

-- 10. LISTINGS — admin browse by vertical
CREATE INDEX IF NOT EXISTS idx_listings_vertical_created
  ON public.listings(vertical_id, deleted_at, created_at DESC)
  WHERE deleted_at IS NULL;
