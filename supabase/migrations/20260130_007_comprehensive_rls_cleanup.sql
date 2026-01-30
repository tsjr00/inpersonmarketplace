-- Migration: Comprehensive RLS Policy Cleanup
-- Created: 2026-01-30
-- Purpose: Drop ALL existing policies and recreate with minimal, correct policies
--
-- This migration fixes:
--   1. Multiple permissive policies on same table
--   2. auth.uid() not wrapped in (SELECT ...)
--   3. RLS recursion issues
--
-- Principles:
--   - Use (SELECT auth.uid()) everywhere for performance
--   - One policy per action when possible (use FOR ALL when same logic)
--   - Grant service_role for admin operations (avoids recursion)
--   - SECURITY DEFINER helpers only where absolutely necessary

-- ============================================================================
-- PART 1: DROP ALL EXISTING POLICIES
-- ============================================================================

-- user_profiles
DROP POLICY IF EXISTS "user_profiles_select" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_update" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_insert" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;

-- vendor_profiles
DROP POLICY IF EXISTS "vendor_profiles_select" ON public.vendor_profiles;
DROP POLICY IF EXISTS "vendor_profiles_update" ON public.vendor_profiles;
DROP POLICY IF EXISTS "vendor_profiles_insert" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Vendors can view own profiles" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Vendors can update own profiles" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Public can view approved vendors" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Users can create vendor profiles" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Admins can view all vendor profiles" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Admins can update vendor profiles" ON public.vendor_profiles;

-- listings
DROP POLICY IF EXISTS "listings_select" ON public.listings;
DROP POLICY IF EXISTS "listings_manage" ON public.listings;
DROP POLICY IF EXISTS "listings_insert" ON public.listings;
DROP POLICY IF EXISTS "listings_update" ON public.listings;
DROP POLICY IF EXISTS "listings_delete" ON public.listings;
DROP POLICY IF EXISTS "Public can view published listings" ON public.listings;
DROP POLICY IF EXISTS "Vendors can view own listings" ON public.listings;
DROP POLICY IF EXISTS "Vendors can create listings" ON public.listings;
DROP POLICY IF EXISTS "Vendors can update own listings" ON public.listings;
DROP POLICY IF EXISTS "Vendors can delete own listings" ON public.listings;

-- listing_images
DROP POLICY IF EXISTS "listing_images_select" ON public.listing_images;
DROP POLICY IF EXISTS "listing_images_manage" ON public.listing_images;
DROP POLICY IF EXISTS "listing_images_vendor_manage" ON public.listing_images;
DROP POLICY IF EXISTS "Public can view published listing images" ON public.listing_images;
DROP POLICY IF EXISTS "Vendors can manage listing images" ON public.listing_images;

-- listing_markets
DROP POLICY IF EXISTS "listing_markets_select" ON public.listing_markets;
DROP POLICY IF EXISTS "listing_markets_manage" ON public.listing_markets;
DROP POLICY IF EXISTS "listing_markets_insert" ON public.listing_markets;
DROP POLICY IF EXISTS "listing_markets_update" ON public.listing_markets;
DROP POLICY IF EXISTS "listing_markets_delete" ON public.listing_markets;
DROP POLICY IF EXISTS "listing_markets_vendor_manage" ON public.listing_markets;
DROP POLICY IF EXISTS "Admins full access to listing markets" ON public.listing_markets;
DROP POLICY IF EXISTS "Anyone can view listing markets" ON public.listing_markets;
DROP POLICY IF EXISTS "Vendors can manage own listing markets" ON public.listing_markets;

-- markets
DROP POLICY IF EXISTS "markets_select" ON public.markets;
DROP POLICY IF EXISTS "markets_insert" ON public.markets;
DROP POLICY IF EXISTS "markets_update" ON public.markets;
DROP POLICY IF EXISTS "markets_delete" ON public.markets;
DROP POLICY IF EXISTS "markets_public_select" ON public.markets;
DROP POLICY IF EXISTS "Anyone can view active markets" ON public.markets;
DROP POLICY IF EXISTS "Admins full access to markets" ON public.markets;
DROP POLICY IF EXISTS "Vendors can create private pickup markets" ON public.markets;
DROP POLICY IF EXISTS "Vendors can update own markets" ON public.markets;
DROP POLICY IF EXISTS "Vendors can delete own markets" ON public.markets;

-- market_schedules
DROP POLICY IF EXISTS "market_schedules_select" ON public.market_schedules;
DROP POLICY IF EXISTS "market_schedules_public_select" ON public.market_schedules;
DROP POLICY IF EXISTS "Anyone can view market schedules" ON public.market_schedules;

-- market_vendors
DROP POLICY IF EXISTS "market_vendors_select" ON public.market_vendors;
DROP POLICY IF EXISTS "market_vendors_public_select" ON public.market_vendors;
DROP POLICY IF EXISTS "Anyone can view market vendors" ON public.market_vendors;

-- market_box_offerings
DROP POLICY IF EXISTS "market_box_offerings_select" ON public.market_box_offerings;
DROP POLICY IF EXISTS "market_box_offerings_insert" ON public.market_box_offerings;
DROP POLICY IF EXISTS "market_box_offerings_update" ON public.market_box_offerings;
DROP POLICY IF EXISTS "market_box_offerings_delete" ON public.market_box_offerings;
DROP POLICY IF EXISTS "market_box_offerings_vendor_all" ON public.market_box_offerings;
DROP POLICY IF EXISTS "market_box_offerings_public_select" ON public.market_box_offerings;
DROP POLICY IF EXISTS "market_box_offerings_admin_all" ON public.market_box_offerings;

-- market_box_subscriptions
DROP POLICY IF EXISTS "market_box_subscriptions_select" ON public.market_box_subscriptions;
DROP POLICY IF EXISTS "market_box_subscriptions_insert" ON public.market_box_subscriptions;
DROP POLICY IF EXISTS "market_box_subs_buyer_select" ON public.market_box_subscriptions;
DROP POLICY IF EXISTS "market_box_subs_vendor_select" ON public.market_box_subscriptions;
DROP POLICY IF EXISTS "market_box_subs_select" ON public.market_box_subscriptions;
DROP POLICY IF EXISTS "market_box_subs_insert" ON public.market_box_subscriptions;

-- market_box_pickups
DROP POLICY IF EXISTS "market_box_pickups_select" ON public.market_box_pickups;
DROP POLICY IF EXISTS "market_box_pickups_update" ON public.market_box_pickups;
DROP POLICY IF EXISTS "market_box_pickups_buyer_select" ON public.market_box_pickups;
DROP POLICY IF EXISTS "market_box_pickups_vendor_select" ON public.market_box_pickups;
DROP POLICY IF EXISTS "market_box_pickups_vendor_update" ON public.market_box_pickups;

-- orders
DROP POLICY IF EXISTS "orders_select" ON public.orders;
DROP POLICY IF EXISTS "orders_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_update" ON public.orders;
DROP POLICY IF EXISTS "Buyers can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Vendors can view their orders" ON public.orders;
DROP POLICY IF EXISTS "Buyers can create orders" ON public.orders;

-- order_items
DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
DROP POLICY IF EXISTS "order_items_update" ON public.order_items;
DROP POLICY IF EXISTS "Order participants can view items" ON public.order_items;
DROP POLICY IF EXISTS "Buyers can create order items" ON public.order_items;

-- order_ratings
DROP POLICY IF EXISTS "order_ratings_select" ON public.order_ratings;
DROP POLICY IF EXISTS "order_ratings_insert" ON public.order_ratings;
DROP POLICY IF EXISTS "order_ratings_update" ON public.order_ratings;

-- transactions
DROP POLICY IF EXISTS "transactions_select" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert" ON public.transactions;
DROP POLICY IF EXISTS "transactions_update" ON public.transactions;

-- fulfillments
DROP POLICY IF EXISTS "fulfillments_select" ON public.fulfillments;
DROP POLICY IF EXISTS "fulfillments_manage" ON public.fulfillments;
DROP POLICY IF EXISTS "fulfillments_insert" ON public.fulfillments;
DROP POLICY IF EXISTS "fulfillments_update" ON public.fulfillments;
DROP POLICY IF EXISTS "fulfillments_delete" ON public.fulfillments;
DROP POLICY IF EXISTS "fulfillments_vendor_manage" ON public.fulfillments;
DROP POLICY IF EXISTS "Participants can view fulfillments" ON public.fulfillments;
DROP POLICY IF EXISTS "Vendors can manage fulfillments" ON public.fulfillments;

-- carts
DROP POLICY IF EXISTS "carts_all" ON public.carts;
DROP POLICY IF EXISTS "carts_select" ON public.carts;
DROP POLICY IF EXISTS "carts_insert" ON public.carts;
DROP POLICY IF EXISTS "carts_update" ON public.carts;
DROP POLICY IF EXISTS "carts_delete" ON public.carts;
DROP POLICY IF EXISTS "Users can view own cart" ON public.carts;
DROP POLICY IF EXISTS "Users can create own cart" ON public.carts;
DROP POLICY IF EXISTS "Users can update own cart" ON public.carts;
DROP POLICY IF EXISTS "Users can delete own cart" ON public.carts;

-- cart_items
DROP POLICY IF EXISTS "cart_items_all" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_select" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_insert" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_update" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_delete" ON public.cart_items;
DROP POLICY IF EXISTS "Users can view own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Users can insert own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Users can update own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Users can delete own cart items" ON public.cart_items;

-- notifications
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;

-- vendor_market_schedules
DROP POLICY IF EXISTS "vms_public_select" ON public.vendor_market_schedules;
DROP POLICY IF EXISTS "vms_vendor_all" ON public.vendor_market_schedules;
DROP POLICY IF EXISTS "vms_vendor_select" ON public.vendor_market_schedules;
DROP POLICY IF EXISTS "vms_vendor_insert" ON public.vendor_market_schedules;
DROP POLICY IF EXISTS "vms_vendor_update" ON public.vendor_market_schedules;
DROP POLICY IF EXISTS "vms_vendor_delete" ON public.vendor_market_schedules;
DROP POLICY IF EXISTS "vms_admin_all" ON public.vendor_market_schedules;

-- vendor_payouts
DROP POLICY IF EXISTS "vendor_payouts_select" ON public.vendor_payouts;
DROP POLICY IF EXISTS "Vendors can view own payouts" ON public.vendor_payouts;

-- vendor_verifications
DROP POLICY IF EXISTS "vendor_verifications_select" ON public.vendor_verifications;
DROP POLICY IF EXISTS "Vendors can view own verifications" ON public.vendor_verifications;

-- vendor_activity_flags
DROP POLICY IF EXISTS "vendor_activity_flags_select" ON public.vendor_activity_flags;
DROP POLICY IF EXISTS "vendor_activity_flags_admin_all" ON public.vendor_activity_flags;

-- vendor_activity_scan_log
DROP POLICY IF EXISTS "vendor_activity_scan_log_admin_select" ON public.vendor_activity_scan_log;

-- vendor_activity_settings
DROP POLICY IF EXISTS "vendor_activity_settings_select" ON public.vendor_activity_settings;
DROP POLICY IF EXISTS "vendor_activity_settings_admin_all" ON public.vendor_activity_settings;

-- vendor_referral_credits
DROP POLICY IF EXISTS "vendor_referral_credits_select" ON public.vendor_referral_credits;

-- vendor_feedback
DROP POLICY IF EXISTS "vendor_feedback_select" ON public.vendor_feedback;
DROP POLICY IF EXISTS "vendor_feedback_insert" ON public.vendor_feedback;

-- shopper_feedback
DROP POLICY IF EXISTS "shopper_feedback_select" ON public.shopper_feedback;
DROP POLICY IF EXISTS "shopper_feedback_insert" ON public.shopper_feedback;

-- verticals
DROP POLICY IF EXISTS "verticals_select" ON public.verticals;
DROP POLICY IF EXISTS "verticals_admin" ON public.verticals;
DROP POLICY IF EXISTS "Anyone can view verticals" ON public.verticals;

-- vertical_admins
DROP POLICY IF EXISTS "vertical_admins_select" ON public.vertical_admins;
DROP POLICY IF EXISTS "vertical_admins_insert" ON public.vertical_admins;
DROP POLICY IF EXISTS "vertical_admins_delete" ON public.vertical_admins;
DROP POLICY IF EXISTS "vertical_admins_platform_admin_select" ON public.vertical_admins;
DROP POLICY IF EXISTS "vertical_admins_vertical_admin_select" ON public.vertical_admins;

-- organizations
DROP POLICY IF EXISTS "organizations_select" ON public.organizations;

-- admin_activity_log
DROP POLICY IF EXISTS "admin_activity_log_select" ON public.admin_activity_log;
DROP POLICY IF EXISTS "admin_activity_log_insert" ON public.admin_activity_log;

-- error_resolutions
DROP POLICY IF EXISTS "error_resolutions_admin_select" ON public.error_resolutions;
DROP POLICY IF EXISTS "error_resolutions_admin_insert" ON public.error_resolutions;
DROP POLICY IF EXISTS "error_resolutions_admin_update" ON public.error_resolutions;

-- platform_settings
DROP POLICY IF EXISTS "platform_settings_read" ON public.platform_settings;
DROP POLICY IF EXISTS "platform_settings_admin" ON public.platform_settings;

-- ============================================================================
-- PART 2: CREATE HELPER FUNCTIONS (SECURITY DEFINER to bypass RLS)
-- ============================================================================

-- Get current user's vendor profile IDs (bypasses RLS)
CREATE OR REPLACE FUNCTION user_vendor_profile_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM vendor_profiles WHERE user_id = auth.uid()
$$;

-- Check if user is platform admin (bypasses RLS on user_profiles)
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_id = auth.uid()
    AND ('admin' = ANY(roles) OR role = 'admin')
  )
$$;

-- Check if user can access a market box subscription
CREATE OR REPLACE FUNCTION can_access_subscription(sub_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM market_box_subscriptions mbs
    WHERE mbs.id = sub_id
    AND (
      mbs.buyer_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM market_box_offerings mbo
        JOIN vendor_profiles vp ON mbo.vendor_profile_id = vp.id
        WHERE mbo.id = mbs.offering_id
        AND vp.user_id = auth.uid()
      )
    )
  )
$$;

-- ============================================================================
-- PART 3: CREATE NEW POLICIES (minimal set)
-- ============================================================================

-- -----------------------------------------------------------------------------
-- user_profiles: Users see own, admins use service_role
-- -----------------------------------------------------------------------------
CREATE POLICY "user_profiles_select" ON public.user_profiles
    FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "user_profiles_insert" ON public.user_profiles
    FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "user_profiles_update" ON public.user_profiles
    FOR UPDATE USING (user_id = (SELECT auth.uid()));

GRANT ALL ON public.user_profiles TO service_role;

-- -----------------------------------------------------------------------------
-- vendor_profiles: Public sees approved, owners see/manage own
-- -----------------------------------------------------------------------------
CREATE POLICY "vendor_profiles_select" ON public.vendor_profiles
    FOR SELECT USING (
        (status = 'approved' AND deleted_at IS NULL)
        OR user_id = (SELECT auth.uid())
    );

CREATE POLICY "vendor_profiles_insert" ON public.vendor_profiles
    FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "vendor_profiles_update" ON public.vendor_profiles
    FOR UPDATE USING (user_id = (SELECT auth.uid()));

GRANT ALL ON public.vendor_profiles TO service_role;

-- -----------------------------------------------------------------------------
-- listings: Public sees published, vendors manage own
-- -----------------------------------------------------------------------------
CREATE POLICY "listings_select" ON public.listings
    FOR SELECT USING (
        status = 'published'
        OR vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

CREATE POLICY "listings_manage" ON public.listings
    FOR ALL USING (
        vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

GRANT ALL ON public.listings TO service_role;

-- -----------------------------------------------------------------------------
-- listing_images: Public sees for published listings, vendors manage own
-- -----------------------------------------------------------------------------
CREATE POLICY "listing_images_select" ON public.listing_images
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM listings WHERE id = listing_id AND status = 'published')
        OR listing_id IN (SELECT id FROM listings WHERE vendor_profile_id IN (SELECT user_vendor_profile_ids()))
    );

CREATE POLICY "listing_images_manage" ON public.listing_images
    FOR ALL USING (
        listing_id IN (SELECT id FROM listings WHERE vendor_profile_id IN (SELECT user_vendor_profile_ids()))
    );

GRANT ALL ON public.listing_images TO service_role;

-- -----------------------------------------------------------------------------
-- listing_markets: Public read, vendors manage own
-- -----------------------------------------------------------------------------
CREATE POLICY "listing_markets_select" ON public.listing_markets
    FOR SELECT USING (true);

CREATE POLICY "listing_markets_manage" ON public.listing_markets
    FOR ALL USING (
        listing_id IN (SELECT id FROM listings WHERE vendor_profile_id IN (SELECT user_vendor_profile_ids()))
    );

GRANT ALL ON public.listing_markets TO service_role;

-- -----------------------------------------------------------------------------
-- markets: Public sees approved+active, vendors manage own submitted
-- -----------------------------------------------------------------------------
CREATE POLICY "markets_select" ON public.markets
    FOR SELECT USING (
        (approval_status = 'approved' AND active = true)
        OR submitted_by_vendor_id IN (SELECT user_vendor_profile_ids())
    );

CREATE POLICY "markets_manage" ON public.markets
    FOR ALL USING (
        submitted_by_vendor_id IN (SELECT user_vendor_profile_ids())
    );

GRANT ALL ON public.markets TO service_role;

-- -----------------------------------------------------------------------------
-- market_schedules: Public read
-- -----------------------------------------------------------------------------
CREATE POLICY "market_schedules_select" ON public.market_schedules
    FOR SELECT USING (true);

GRANT ALL ON public.market_schedules TO service_role;

-- -----------------------------------------------------------------------------
-- market_vendors: Public read
-- -----------------------------------------------------------------------------
CREATE POLICY "market_vendors_select" ON public.market_vendors
    FOR SELECT USING (true);

GRANT ALL ON public.market_vendors TO service_role;

-- -----------------------------------------------------------------------------
-- market_box_offerings: Public sees active, vendors manage own
-- -----------------------------------------------------------------------------
CREATE POLICY "market_box_offerings_select" ON public.market_box_offerings
    FOR SELECT USING (
        active = true
        OR vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

CREATE POLICY "market_box_offerings_manage" ON public.market_box_offerings
    FOR ALL USING (
        vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

GRANT ALL ON public.market_box_offerings TO service_role;

-- -----------------------------------------------------------------------------
-- market_box_subscriptions: Buyers see own, vendors see their offerings'
-- -----------------------------------------------------------------------------
CREATE POLICY "market_box_subscriptions_select" ON public.market_box_subscriptions
    FOR SELECT USING (
        buyer_user_id = (SELECT auth.uid())
        OR offering_id IN (
            SELECT id FROM market_box_offerings
            WHERE vendor_profile_id IN (SELECT user_vendor_profile_ids())
        )
    );

CREATE POLICY "market_box_subscriptions_insert" ON public.market_box_subscriptions
    FOR INSERT WITH CHECK (buyer_user_id = (SELECT auth.uid()));

GRANT ALL ON public.market_box_subscriptions TO service_role;

-- -----------------------------------------------------------------------------
-- market_box_pickups: Use helper function to avoid recursion
-- -----------------------------------------------------------------------------
CREATE POLICY "market_box_pickups_select" ON public.market_box_pickups
    FOR SELECT USING (can_access_subscription(subscription_id));

CREATE POLICY "market_box_pickups_update" ON public.market_box_pickups
    FOR UPDATE USING (can_access_subscription(subscription_id));

GRANT ALL ON public.market_box_pickups TO service_role;

-- -----------------------------------------------------------------------------
-- orders: Buyers see own, vendors see orders containing their items
-- -----------------------------------------------------------------------------
CREATE POLICY "orders_select" ON public.orders
    FOR SELECT USING (
        buyer_user_id = (SELECT auth.uid())
        OR id IN (
            SELECT order_id FROM order_items
            WHERE vendor_profile_id IN (SELECT user_vendor_profile_ids())
        )
    );

CREATE POLICY "orders_insert" ON public.orders
    FOR INSERT WITH CHECK (buyer_user_id = (SELECT auth.uid()));

CREATE POLICY "orders_update" ON public.orders
    FOR UPDATE USING (
        buyer_user_id = (SELECT auth.uid())
        OR id IN (
            SELECT order_id FROM order_items
            WHERE vendor_profile_id IN (SELECT user_vendor_profile_ids())
        )
    );

GRANT ALL ON public.orders TO service_role;

-- -----------------------------------------------------------------------------
-- order_items: Buyers see own order items, vendors see items they're selling
-- -----------------------------------------------------------------------------
CREATE POLICY "order_items_select" ON public.order_items
    FOR SELECT USING (
        order_id IN (SELECT id FROM orders WHERE buyer_user_id = (SELECT auth.uid()))
        OR vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

CREATE POLICY "order_items_insert" ON public.order_items
    FOR INSERT WITH CHECK (
        order_id IN (SELECT id FROM orders WHERE buyer_user_id = (SELECT auth.uid()))
    );

CREATE POLICY "order_items_update" ON public.order_items
    FOR UPDATE USING (
        vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

GRANT ALL ON public.order_items TO service_role;

-- -----------------------------------------------------------------------------
-- order_ratings: Buyers can rate their orders, vendors can see ratings
-- -----------------------------------------------------------------------------
CREATE POLICY "order_ratings_select" ON public.order_ratings
    FOR SELECT USING (
        order_id IN (SELECT id FROM orders WHERE buyer_user_id = (SELECT auth.uid()))
        OR order_id IN (
            SELECT order_id FROM order_items
            WHERE vendor_profile_id IN (SELECT user_vendor_profile_ids())
        )
    );

CREATE POLICY "order_ratings_insert" ON public.order_ratings
    FOR INSERT WITH CHECK (
        order_id IN (SELECT id FROM orders WHERE buyer_user_id = (SELECT auth.uid()))
    );

GRANT ALL ON public.order_ratings TO service_role;

-- -----------------------------------------------------------------------------
-- transactions: Same pattern as orders
-- -----------------------------------------------------------------------------
CREATE POLICY "transactions_select" ON public.transactions
    FOR SELECT USING (
        buyer_user_id = (SELECT auth.uid())
        OR vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

CREATE POLICY "transactions_insert" ON public.transactions
    FOR INSERT WITH CHECK (buyer_user_id = (SELECT auth.uid()));

CREATE POLICY "transactions_update" ON public.transactions
    FOR UPDATE USING (
        buyer_user_id = (SELECT auth.uid())
        OR vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

GRANT ALL ON public.transactions TO service_role;

-- -----------------------------------------------------------------------------
-- fulfillments: Transaction participants can view, vendors can manage
-- -----------------------------------------------------------------------------
CREATE POLICY "fulfillments_select" ON public.fulfillments
    FOR SELECT USING (
        transaction_id IN (
            SELECT id FROM transactions
            WHERE buyer_user_id = (SELECT auth.uid())
            OR vendor_profile_id IN (SELECT user_vendor_profile_ids())
        )
    );

CREATE POLICY "fulfillments_manage" ON public.fulfillments
    FOR ALL USING (
        transaction_id IN (
            SELECT id FROM transactions
            WHERE vendor_profile_id IN (SELECT user_vendor_profile_ids())
        )
    );

GRANT ALL ON public.fulfillments TO service_role;

-- -----------------------------------------------------------------------------
-- carts: Users manage own
-- -----------------------------------------------------------------------------
CREATE POLICY "carts_all" ON public.carts
    FOR ALL USING (user_id = (SELECT auth.uid()));

GRANT ALL ON public.carts TO service_role;

-- -----------------------------------------------------------------------------
-- cart_items: Users manage items in own cart
-- -----------------------------------------------------------------------------
CREATE POLICY "cart_items_all" ON public.cart_items
    FOR ALL USING (
        cart_id IN (SELECT id FROM carts WHERE user_id = (SELECT auth.uid()))
    );

GRANT ALL ON public.cart_items TO service_role;

-- -----------------------------------------------------------------------------
-- notifications: Users see own
-- -----------------------------------------------------------------------------
CREATE POLICY "notifications_select" ON public.notifications
    FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "notifications_update" ON public.notifications
    FOR UPDATE USING (user_id = (SELECT auth.uid()));

GRANT ALL ON public.notifications TO service_role;

-- -----------------------------------------------------------------------------
-- vendor_market_schedules: Public read, vendors manage own
-- -----------------------------------------------------------------------------
CREATE POLICY "vms_select" ON public.vendor_market_schedules
    FOR SELECT USING (true);

CREATE POLICY "vms_manage" ON public.vendor_market_schedules
    FOR ALL USING (
        vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

GRANT ALL ON public.vendor_market_schedules TO service_role;

-- -----------------------------------------------------------------------------
-- vendor_payouts: Vendors see own
-- -----------------------------------------------------------------------------
CREATE POLICY "vendor_payouts_select" ON public.vendor_payouts
    FOR SELECT USING (
        vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

GRANT ALL ON public.vendor_payouts TO service_role;

-- -----------------------------------------------------------------------------
-- vendor_verifications: Vendors see own
-- -----------------------------------------------------------------------------
CREATE POLICY "vendor_verifications_select" ON public.vendor_verifications
    FOR SELECT USING (
        vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

GRANT ALL ON public.vendor_verifications TO service_role;

-- -----------------------------------------------------------------------------
-- vendor_activity_flags: Admin only via service_role
-- -----------------------------------------------------------------------------
GRANT ALL ON public.vendor_activity_flags TO service_role;

-- -----------------------------------------------------------------------------
-- vendor_activity_scan_log: Admin only via service_role
-- -----------------------------------------------------------------------------
GRANT ALL ON public.vendor_activity_scan_log TO service_role;

-- -----------------------------------------------------------------------------
-- vendor_activity_settings: Admin only via service_role
-- -----------------------------------------------------------------------------
GRANT ALL ON public.vendor_activity_settings TO service_role;

-- -----------------------------------------------------------------------------
-- vendor_referral_credits: Vendors see own
-- -----------------------------------------------------------------------------
CREATE POLICY "vendor_referral_credits_select" ON public.vendor_referral_credits
    FOR SELECT USING (
        vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

GRANT ALL ON public.vendor_referral_credits TO service_role;

-- -----------------------------------------------------------------------------
-- vendor_feedback: Vendors can submit, admins view via service_role
-- -----------------------------------------------------------------------------
CREATE POLICY "vendor_feedback_select" ON public.vendor_feedback
    FOR SELECT USING (
        vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

CREATE POLICY "vendor_feedback_insert" ON public.vendor_feedback
    FOR INSERT WITH CHECK (
        vendor_profile_id IN (SELECT user_vendor_profile_ids())
    );

GRANT ALL ON public.vendor_feedback TO service_role;

-- -----------------------------------------------------------------------------
-- shopper_feedback: Users can submit, admins view via service_role
-- -----------------------------------------------------------------------------
CREATE POLICY "shopper_feedback_select" ON public.shopper_feedback
    FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "shopper_feedback_insert" ON public.shopper_feedback
    FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

GRANT ALL ON public.shopper_feedback TO service_role;

-- -----------------------------------------------------------------------------
-- verticals: Public read
-- -----------------------------------------------------------------------------
CREATE POLICY "verticals_select" ON public.verticals
    FOR SELECT USING (true);

GRANT ALL ON public.verticals TO service_role;

-- -----------------------------------------------------------------------------
-- vertical_admins: Admin only via service_role
-- -----------------------------------------------------------------------------
GRANT ALL ON public.vertical_admins TO service_role;

-- -----------------------------------------------------------------------------
-- organizations: Public read
-- -----------------------------------------------------------------------------
CREATE POLICY "organizations_select" ON public.organizations
    FOR SELECT USING (true);

GRANT ALL ON public.organizations TO service_role;

-- -----------------------------------------------------------------------------
-- admin_activity_log: Admin only via service_role
-- -----------------------------------------------------------------------------
GRANT ALL ON public.admin_activity_log TO service_role;

-- -----------------------------------------------------------------------------
-- error_resolutions: Admin only via service_role
-- -----------------------------------------------------------------------------
GRANT ALL ON public.error_resolutions TO service_role;

-- -----------------------------------------------------------------------------
-- platform_settings: Public read
-- -----------------------------------------------------------------------------
CREATE POLICY "platform_settings_select" ON public.platform_settings
    FOR SELECT USING (true);

GRANT ALL ON public.platform_settings TO service_role;

-- ============================================================================
-- DONE
-- ============================================================================
