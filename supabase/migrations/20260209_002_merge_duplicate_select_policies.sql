-- Merge duplicate permissive SELECT policies (admin + regular) into single policies.
-- Postgres OR-combines permissive policies for the same role+action automatically,
-- so this is a pure performance optimization with no behavioral change.
--
-- Skipping: markets table (complex merge, will be handled separately after testing)

-- ============================================================
-- 1. LISTINGS: merge listings_select + listings_admin_select
-- ============================================================
-- Before:
--   listings_select:       (status = 'published') OR (vendor owns it)
--   listings_admin_select: is_admin_for_vertical(vertical_id)
-- After:
--   listings_select:       (status = 'published') OR (vendor owns it) OR is_admin_for_vertical(vertical_id)

DROP POLICY IF EXISTS "listings_select" ON public.listings;
DROP POLICY IF EXISTS "listings_admin_select" ON public.listings;

CREATE POLICY "listings_select" ON public.listings
  FOR SELECT TO public
  USING (
    (status = 'published'::listing_status)
    OR (vendor_profile_id IN (SELECT user_vendor_profile_ids()))
    OR is_admin_for_vertical(vertical_id)
  );

-- ============================================================
-- 2. ORDERS: merge orders_select + orders_admin_select
-- ============================================================
-- Before:
--   orders_select:       buyer owns it OR vendor owns it
--   orders_admin_select: is_admin_for_vertical(vertical_id)
-- After:
--   orders_select:       buyer owns it OR vendor owns it OR is_admin_for_vertical(vertical_id)

DROP POLICY IF EXISTS "orders_select" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_select" ON public.orders;

CREATE POLICY "orders_select" ON public.orders
  FOR SELECT TO public
  USING (
    (buyer_user_id = (SELECT auth.uid()))
    OR (id IN (SELECT user_vendor_order_ids()))
    OR is_admin_for_vertical(vertical_id)
  );

-- ============================================================
-- 3. ORDER_ITEMS: merge order_items_select + order_items_admin_select
-- ============================================================
-- Before:
--   order_items_select:       buyer owns order OR vendor owns item
--   order_items_admin_select: can_admin_order(order_id)
-- After:
--   order_items_select:       buyer owns order OR vendor owns item OR can_admin_order(order_id)

DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_admin_select" ON public.order_items;

CREATE POLICY "order_items_select" ON public.order_items
  FOR SELECT TO public
  USING (
    (order_id IN (SELECT user_buyer_order_ids()))
    OR (vendor_profile_id IN (SELECT user_vendor_profile_ids()))
    OR can_admin_order(order_id)
  );

-- ============================================================
-- 4. TRANSACTIONS: merge transactions_select + transactions_admin_select
-- ============================================================
-- Before:
--   transactions_select:       buyer owns it OR vendor owns it
--   transactions_admin_select: is_admin_for_vertical(vertical_id)
-- After:
--   transactions_select:       buyer owns it OR vendor owns it OR is_admin_for_vertical(vertical_id)

DROP POLICY IF EXISTS "transactions_select" ON public.transactions;
DROP POLICY IF EXISTS "transactions_admin_select" ON public.transactions;

CREATE POLICY "transactions_select" ON public.transactions
  FOR SELECT TO public
  USING (
    (buyer_user_id = (SELECT auth.uid()))
    OR (vendor_profile_id IN (SELECT user_vendor_profile_ids()))
    OR is_admin_for_vertical(vertical_id)
  );

-- ============================================================
-- 5. VENDOR_PAYOUTS: merge vendor_payouts_select + vendor_payouts_admin_select
-- ============================================================
-- Before:
--   vendor_payouts_select:       vendor owns it
--   vendor_payouts_admin_select: can_admin_vendor(vendor_profile_id)
-- After:
--   vendor_payouts_select:       vendor owns it OR can_admin_vendor(vendor_profile_id)

DROP POLICY IF EXISTS "vendor_payouts_select" ON public.vendor_payouts;
DROP POLICY IF EXISTS "vendor_payouts_admin_select" ON public.vendor_payouts;

CREATE POLICY "vendor_payouts_select" ON public.vendor_payouts
  FOR SELECT TO public
  USING (
    (vendor_profile_id IN (SELECT user_vendor_profile_ids()))
    OR can_admin_vendor(vendor_profile_id)
  );

-- ============================================================
-- 6. NOTIFICATIONS: merge notifications_select + notifications_admin_select
-- ============================================================
-- Before:
--   notifications_select:       user owns it
--   notifications_admin_select: is_platform_admin()
-- After:
--   notifications_select:       user owns it OR is_platform_admin()
-- Note: is_platform_admin() has no column args so we wrap in (SELECT ...) for per-query eval

DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_admin_select" ON public.notifications;

CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT TO public
  USING (
    (user_id = (SELECT auth.uid()))
    OR (SELECT is_platform_admin())
  );

-- ============================================================
-- CLEANUP: Drop old-named policies that may still exist from
-- previous schema versions (these were renamed but might not
-- have been dropped in all environments)
-- ============================================================
DROP POLICY IF EXISTS "Vendors can delete own listings" ON public.listings;
DROP POLICY IF EXISTS "Vendors can create listings" ON public.listings;
DROP POLICY IF EXISTS "Vendors can update own listings" ON public.listings;
DROP POLICY IF EXISTS "Vendors can view own listings" ON public.listings;
DROP POLICY IF EXISTS "Public can view published listings" ON public.listings;

DROP POLICY IF EXISTS "Participants can view fulfillments" ON public.fulfillments;
DROP POLICY IF EXISTS "Vendors can manage fulfillments" ON public.fulfillments;

DROP POLICY IF EXISTS "Public can view published listing images" ON public.listing_images;
DROP POLICY IF EXISTS "Vendors can manage listing images" ON public.listing_images;

DROP POLICY IF EXISTS "Admins full access to listing markets" ON public.listing_markets;
DROP POLICY IF EXISTS "Vendors can manage own listing markets" ON public.listing_markets;
DROP POLICY IF EXISTS "Anyone can view listing markets" ON public.listing_markets;

DROP POLICY IF EXISTS "Users can create own cart" ON public.carts;
DROP POLICY IF EXISTS "Users can delete own cart" ON public.carts;
DROP POLICY IF EXISTS "Users can update own cart" ON public.carts;
DROP POLICY IF EXISTS "Users can view own cart" ON public.carts;

DROP POLICY IF EXISTS "Users can delete own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Users can insert own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Users can update own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Users can view own cart items" ON public.cart_items;

DROP POLICY IF EXISTS "Users can create own notifications" ON public.notifications;

DROP POLICY IF EXISTS "Admins full access to markets" ON public.markets;
DROP POLICY IF EXISTS "Anyone can view active markets" ON public.markets;
DROP POLICY IF EXISTS "Vendors can create private pickup markets" ON public.markets;
DROP POLICY IF EXISTS "Vendors can delete own markets" ON public.markets;
DROP POLICY IF EXISTS "Vendors can update own markets" ON public.markets;

DROP POLICY IF EXISTS "Schedules manageable by admins" ON public.market_schedules;
DROP POLICY IF EXISTS "Schedules viewable with active market" ON public.market_schedules;

DROP POLICY IF EXISTS "Admins view all market vendors" ON public.market_vendors;
DROP POLICY IF EXISTS "Public view approved market vendors" ON public.market_vendors;
DROP POLICY IF EXISTS "Vendors view their markets" ON public.market_vendors;
DROP POLICY IF EXISTS "market_vendors_public_select" ON public.market_vendors;

DROP POLICY IF EXISTS "vendor_payouts_select" ON public.vendor_payouts;

DROP POLICY IF EXISTS "Owners can update own organizations" ON public.organizations;
DROP POLICY IF EXISTS "Owners can view own organizations" ON public.organizations;
DROP POLICY IF EXISTS "Users can create organizations" ON public.organizations;

DROP POLICY IF EXISTS "Buyers can create transactions" ON public.transactions;
DROP POLICY IF EXISTS "Buyers can update own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Buyers can view own transactions" ON public.transactions;

DROP POLICY IF EXISTS "market_box_pickups_buyer_select" ON public.market_box_pickups;
DROP POLICY IF EXISTS "market_box_pickups_vendor_select" ON public.market_box_pickups;

DROP POLICY IF EXISTS "market_box_subs_buyer_select" ON public.market_box_subscriptions;
DROP POLICY IF EXISTS "market_box_subs_vendor_select" ON public.market_box_subscriptions;

DROP POLICY IF EXISTS "orders_buyer_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_buyer_select" ON public.orders;
DROP POLICY IF EXISTS "orders_vendor_select" ON public.orders;

DROP POLICY IF EXISTS "order_items_buyer_insert" ON public.order_items;
DROP POLICY IF EXISTS "order_items_buyer_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_buyer_update" ON public.order_items;
DROP POLICY IF EXISTS "order_items_vendor_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_vendor_update" ON public.order_items;
