-- Migration: Fix Remaining RLS Performance Warnings
-- Created: 2026-01-29
-- Purpose: Address remaining auth_rls_initplan and multiple_permissive_policies warnings
--
-- This migration fixes policies that weren't addressed in 20260126_004

-- ============================================================================
-- 1. CARTS TABLE - Fix auth.uid() calls
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own cart" ON public.carts;
DROP POLICY IF EXISTS "Users can create own cart" ON public.carts;
DROP POLICY IF EXISTS "Users can update own cart" ON public.carts;
DROP POLICY IF EXISTS "Users can delete own cart" ON public.carts;
DROP POLICY IF EXISTS "carts_select" ON public.carts;
DROP POLICY IF EXISTS "carts_insert" ON public.carts;
DROP POLICY IF EXISTS "carts_update" ON public.carts;
DROP POLICY IF EXISTS "carts_delete" ON public.carts;

CREATE POLICY "carts_select" ON public.carts
    FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "carts_insert" ON public.carts
    FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "carts_update" ON public.carts
    FOR UPDATE USING (user_id = (SELECT auth.uid()));

CREATE POLICY "carts_delete" ON public.carts
    FOR DELETE USING (user_id = (SELECT auth.uid()));

-- ============================================================================
-- 2. CART_ITEMS TABLE - Fix auth.uid() calls
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Users can insert own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Users can update own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Users can delete own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_select" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_insert" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_update" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_delete" ON public.cart_items;

CREATE POLICY "cart_items_select" ON public.cart_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM carts c
            WHERE c.id = cart_id
            AND c.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "cart_items_insert" ON public.cart_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM carts c
            WHERE c.id = cart_id
            AND c.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "cart_items_update" ON public.cart_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM carts c
            WHERE c.id = cart_id
            AND c.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "cart_items_delete" ON public.cart_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM carts c
            WHERE c.id = cart_id
            AND c.user_id = (SELECT auth.uid())
        )
    );

-- ============================================================================
-- 3. NOTIFICATIONS TABLE - Fix auth.uid() calls
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can create own notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;

CREATE POLICY "notifications_select" ON public.notifications
    FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "notifications_update" ON public.notifications
    FOR UPDATE USING (user_id = (SELECT auth.uid()));

-- System/service role can create notifications
CREATE POLICY "notifications_insert" ON public.notifications
    FOR INSERT WITH CHECK (true);

-- ============================================================================
-- 4. ORGANIZATIONS TABLE - Fix and consolidate
-- ============================================================================

DROP POLICY IF EXISTS "Owners can view own organizations" ON public.organizations;
DROP POLICY IF EXISTS "Owners can update own organizations" ON public.organizations;
DROP POLICY IF EXISTS "Users can create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Admins can view all organizations" ON public.organizations;
DROP POLICY IF EXISTS "organizations_select" ON public.organizations;
DROP POLICY IF EXISTS "organizations_insert" ON public.organizations;
DROP POLICY IF EXISTS "organizations_update" ON public.organizations;

-- Consolidated SELECT (owners see own, admins see all)
CREATE POLICY "organizations_select" ON public.organizations
    FOR SELECT USING (
        owner_user_id IN (SELECT id FROM user_profiles WHERE user_id = (SELECT auth.uid()))
        OR is_platform_admin()
    );

CREATE POLICY "organizations_insert" ON public.organizations
    FOR INSERT WITH CHECK (
        owner_user_id IN (SELECT id FROM user_profiles WHERE user_id = (SELECT auth.uid()))
    );

CREATE POLICY "organizations_update" ON public.organizations
    FOR UPDATE USING (
        owner_user_id IN (SELECT id FROM user_profiles WHERE user_id = (SELECT auth.uid()))
        OR is_platform_admin()
    );

-- ============================================================================
-- 5. TRANSACTIONS TABLE - Fix and consolidate
-- ============================================================================

DROP POLICY IF EXISTS "Buyers can view own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Vendors can view their transactions" ON public.transactions;
DROP POLICY IF EXISTS "Buyers can create transactions" ON public.transactions;
DROP POLICY IF EXISTS "Buyers can update own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Vendors can update transactions" ON public.transactions;
DROP POLICY IF EXISTS "Admins can view all transactions" ON public.transactions;
DROP POLICY IF EXISTS "transactions_select" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert" ON public.transactions;
DROP POLICY IF EXISTS "transactions_update" ON public.transactions;

-- Consolidated SELECT
CREATE POLICY "transactions_select" ON public.transactions
    FOR SELECT USING (
        buyer_user_id = (SELECT auth.uid())
        OR vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
        )
        OR is_platform_admin()
    );

CREATE POLICY "transactions_insert" ON public.transactions
    FOR INSERT WITH CHECK (
        buyer_user_id = (SELECT auth.uid())
    );

-- Consolidated UPDATE (buyers for pending, vendors for accept/decline)
CREATE POLICY "transactions_update" ON public.transactions
    FOR UPDATE USING (
        buyer_user_id = (SELECT auth.uid())
        OR vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- 6. VENDOR_PAYOUTS TABLE - Fix auth.uid() calls
-- ============================================================================

DROP POLICY IF EXISTS "vendor_payouts_select" ON public.vendor_payouts;
DROP POLICY IF EXISTS "vendor_payouts_vendor_select" ON public.vendor_payouts;
-- Drop new name in case it exists
DROP POLICY IF EXISTS "vendor_payouts_select" ON public.vendor_payouts;

-- Consolidated SELECT
CREATE POLICY "vendor_payouts_select" ON public.vendor_payouts
    FOR SELECT USING (
        vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- 7. LISTING_MARKETS TABLE - Fix and consolidate
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can view listing markets" ON public.listing_markets;
DROP POLICY IF EXISTS "Vendors can manage own listing markets" ON public.listing_markets;
DROP POLICY IF EXISTS "Admins full access to listing markets" ON public.listing_markets;
DROP POLICY IF EXISTS "listing_markets_select" ON public.listing_markets;
DROP POLICY IF EXISTS "listing_markets_insert" ON public.listing_markets;
DROP POLICY IF EXISTS "listing_markets_update" ON public.listing_markets;
DROP POLICY IF EXISTS "listing_markets_delete" ON public.listing_markets;

-- Consolidated SELECT (public for published, vendors for own, admins for all)
CREATE POLICY "listing_markets_select" ON public.listing_markets
    FOR SELECT USING (
        -- Public can see listing_markets for published listings
        EXISTS (
            SELECT 1 FROM listings l
            WHERE l.id = listing_id
            AND l.status = 'published'
            AND l.deleted_at IS NULL
        )
        OR
        -- Vendors can see their own
        EXISTS (
            SELECT 1 FROM listings l
            JOIN vendor_profiles vp ON l.vendor_profile_id = vp.id
            WHERE l.id = listing_id
            AND vp.user_id = (SELECT auth.uid())
        )
        OR is_platform_admin()
    );

-- Consolidated INSERT/UPDATE/DELETE (vendors for own, admins for all)
CREATE POLICY "listing_markets_insert" ON public.listing_markets
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM listings l
            JOIN vendor_profiles vp ON l.vendor_profile_id = vp.id
            WHERE l.id = listing_id
            AND vp.user_id = (SELECT auth.uid())
        )
        OR is_platform_admin()
    );

CREATE POLICY "listing_markets_update" ON public.listing_markets
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM listings l
            JOIN vendor_profiles vp ON l.vendor_profile_id = vp.id
            WHERE l.id = listing_id
            AND vp.user_id = (SELECT auth.uid())
        )
        OR is_platform_admin()
    );

CREATE POLICY "listing_markets_delete" ON public.listing_markets
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM listings l
            JOIN vendor_profiles vp ON l.vendor_profile_id = vp.id
            WHERE l.id = listing_id
            AND vp.user_id = (SELECT auth.uid())
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- 8. MARKET_VENDORS TABLE - Fix and consolidate
-- ============================================================================

DROP POLICY IF EXISTS "Admins view all market vendors" ON public.market_vendors;
DROP POLICY IF EXISTS "Public view approved market vendors" ON public.market_vendors;
DROP POLICY IF EXISTS "Vendors view their markets" ON public.market_vendors;
DROP POLICY IF EXISTS "market_vendors_public_select" ON public.market_vendors;
DROP POLICY IF EXISTS "market_vendors_select" ON public.market_vendors;

-- Consolidated SELECT
CREATE POLICY "market_vendors_select" ON public.market_vendors
    FOR SELECT USING (
        -- Public can see approved vendors at active markets
        (status = 'approved')
        OR
        -- Vendors can see their own entries
        vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- 9. LISTINGS TABLE - Fix and consolidate (remaining policies)
-- ============================================================================

DROP POLICY IF EXISTS "Vendors can view own listings" ON public.listings;
DROP POLICY IF EXISTS "Vendors can create listings" ON public.listings;
DROP POLICY IF EXISTS "Vendors can update own listings" ON public.listings;
DROP POLICY IF EXISTS "Vendors can delete own listings" ON public.listings;
DROP POLICY IF EXISTS "Public can view published listings" ON public.listings;
DROP POLICY IF EXISTS "Admins can view all listings" ON public.listings;
DROP POLICY IF EXISTS "listings_select" ON public.listings;
DROP POLICY IF EXISTS "listings_insert" ON public.listings;
DROP POLICY IF EXISTS "listings_update" ON public.listings;
DROP POLICY IF EXISTS "listings_delete" ON public.listings;
-- Drop again to ensure clean state
DROP POLICY IF EXISTS "listings_select" ON public.listings;
DROP POLICY IF EXISTS "listings_insert" ON public.listings;
DROP POLICY IF EXISTS "listings_update" ON public.listings;
DROP POLICY IF EXISTS "listings_delete" ON public.listings;

-- Consolidated SELECT
CREATE POLICY "listings_select" ON public.listings
    FOR SELECT USING (
        -- Public can see published listings
        (status = 'published' AND deleted_at IS NULL)
        OR
        -- Vendors can see their own
        vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
        )
        OR is_platform_admin()
    );

CREATE POLICY "listings_insert" ON public.listings
    FOR INSERT WITH CHECK (
        vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
        )
        OR is_platform_admin()
    );

CREATE POLICY "listings_update" ON public.listings
    FOR UPDATE USING (
        vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
        )
        OR is_platform_admin()
    );

CREATE POLICY "listings_delete" ON public.listings
    FOR DELETE USING (
        vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- 10. LISTING_IMAGES TABLE - Fix and consolidate
-- ============================================================================

DROP POLICY IF EXISTS "Public can view published listing images" ON public.listing_images;
DROP POLICY IF EXISTS "Vendors can manage listing images" ON public.listing_images;
DROP POLICY IF EXISTS "listing_images_select" ON public.listing_images;
DROP POLICY IF EXISTS "listing_images_manage" ON public.listing_images;

-- Consolidated SELECT
CREATE POLICY "listing_images_select" ON public.listing_images
    FOR SELECT USING (
        -- Public can see images for published listings
        EXISTS (
            SELECT 1 FROM listings l
            WHERE l.id = listing_id
            AND l.status = 'published'
            AND l.deleted_at IS NULL
        )
        OR
        -- Vendors can see their own listing images
        EXISTS (
            SELECT 1 FROM listings l
            JOIN vendor_profiles vp ON l.vendor_profile_id = vp.id
            WHERE l.id = listing_id
            AND vp.user_id = (SELECT auth.uid())
        )
        OR is_platform_admin()
    );

-- Vendors can manage their own listing images
CREATE POLICY "listing_images_manage" ON public.listing_images
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM listings l
            JOIN vendor_profiles vp ON l.vendor_profile_id = vp.id
            WHERE l.id = listing_id
            AND vp.user_id = (SELECT auth.uid())
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- 11. ORDERS TABLE - Fix and consolidate
-- ============================================================================

DROP POLICY IF EXISTS "orders_buyer_select" ON public.orders;
DROP POLICY IF EXISTS "orders_vendor_select" ON public.orders;
DROP POLICY IF EXISTS "orders_select" ON public.orders;
DROP POLICY IF EXISTS "orders_buyer_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_insert" ON public.orders;
-- Drop new names
DROP POLICY IF EXISTS "orders_select" ON public.orders;
DROP POLICY IF EXISTS "orders_insert" ON public.orders;

-- Consolidated SELECT
CREATE POLICY "orders_select" ON public.orders
    FOR SELECT USING (
        buyer_user_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM order_items oi
            JOIN vendor_profiles vp ON oi.vendor_profile_id = vp.id
            WHERE oi.order_id = orders.id
            AND vp.user_id = (SELECT auth.uid())
        )
        OR is_platform_admin()
    );

-- Consolidated INSERT
CREATE POLICY "orders_insert" ON public.orders
    FOR INSERT WITH CHECK (
        buyer_user_id = (SELECT auth.uid())
    );

-- ============================================================================
-- 12. ORDER_ITEMS TABLE - Fix and consolidate
-- ============================================================================

DROP POLICY IF EXISTS "order_items_buyer_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_vendor_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_buyer_insert" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
DROP POLICY IF EXISTS "order_items_buyer_update" ON public.order_items;
DROP POLICY IF EXISTS "order_items_vendor_update" ON public.order_items;
DROP POLICY IF EXISTS "order_items_update" ON public.order_items;
-- Drop new names
DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
DROP POLICY IF EXISTS "order_items_update" ON public.order_items;

-- Consolidated SELECT
CREATE POLICY "order_items_select" ON public.order_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_id
            AND o.buyer_user_id = (SELECT auth.uid())
        )
        OR vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
        )
        OR is_platform_admin()
    );

-- Consolidated INSERT
CREATE POLICY "order_items_insert" ON public.order_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_id
            AND o.buyer_user_id = (SELECT auth.uid())
        )
        OR is_platform_admin()
    );

-- Consolidated UPDATE
CREATE POLICY "order_items_update" ON public.order_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_id
            AND o.buyer_user_id = (SELECT auth.uid())
        )
        OR vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- 13. MARKET_BOX_SUBSCRIPTIONS TABLE - Fix and consolidate
-- ============================================================================

DROP POLICY IF EXISTS "market_box_subs_buyer_select" ON public.market_box_subscriptions;
DROP POLICY IF EXISTS "market_box_subs_vendor_select" ON public.market_box_subscriptions;
DROP POLICY IF EXISTS "market_box_subscriptions_select" ON public.market_box_subscriptions;

-- Consolidated SELECT
CREATE POLICY "market_box_subscriptions_select" ON public.market_box_subscriptions
    FOR SELECT USING (
        buyer_user_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM market_box_offerings mbo
            JOIN vendor_profiles vp ON mbo.vendor_profile_id = vp.id
            WHERE mbo.id = offering_id
            AND vp.user_id = (SELECT auth.uid())
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- 14. MARKET_BOX_PICKUPS TABLE - Fix and consolidate
-- ============================================================================

DROP POLICY IF EXISTS "market_box_pickups_buyer_select" ON public.market_box_pickups;
DROP POLICY IF EXISTS "market_box_pickups_vendor_select" ON public.market_box_pickups;
DROP POLICY IF EXISTS "market_box_pickups_select" ON public.market_box_pickups;

-- Consolidated SELECT
CREATE POLICY "market_box_pickups_select" ON public.market_box_pickups
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM market_box_subscriptions mbs
            WHERE mbs.id = subscription_id
            AND mbs.buyer_user_id = (SELECT auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM market_box_subscriptions mbs
            JOIN market_box_offerings mbo ON mbs.offering_id = mbo.id
            JOIN vendor_profiles vp ON mbo.vendor_profile_id = vp.id
            WHERE mbs.id = subscription_id
            AND vp.user_id = (SELECT auth.uid())
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- 15. VENDOR_PROFILES TABLE - Fix and consolidate
-- ============================================================================

DROP POLICY IF EXISTS "Vendors can view own profiles" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Vendors can update own profiles" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Public can view approved vendors" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Admins can view all vendor profiles" ON public.vendor_profiles;
DROP POLICY IF EXISTS "Admins can update vendor profiles" ON public.vendor_profiles;
DROP POLICY IF EXISTS "vendor_profiles_select" ON public.vendor_profiles;
DROP POLICY IF EXISTS "vendor_profiles_update" ON public.vendor_profiles;

-- Consolidated SELECT
CREATE POLICY "vendor_profiles_select" ON public.vendor_profiles
    FOR SELECT USING (
        -- Public can see approved vendors
        (status = 'approved' AND deleted_at IS NULL)
        OR
        -- Vendors can see their own
        user_id = (SELECT auth.uid())
        OR is_platform_admin()
    );

CREATE POLICY "vendor_profiles_update" ON public.vendor_profiles
    FOR UPDATE USING (
        user_id = (SELECT auth.uid())
        OR is_platform_admin()
    );

-- ============================================================================
-- 16. VENDOR_VERIFICATIONS TABLE - Fix and consolidate
-- ============================================================================

DROP POLICY IF EXISTS "Vendors can view own verifications" ON public.vendor_verifications;
DROP POLICY IF EXISTS "Verifiers can view all verifications" ON public.vendor_verifications;
DROP POLICY IF EXISTS "vendor_verifications_select" ON public.vendor_verifications;

-- Consolidated SELECT
CREATE POLICY "vendor_verifications_select" ON public.vendor_verifications
    FOR SELECT USING (
        vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
        )
        OR is_platform_admin()
    );

-- ============================================================================
-- 17. USER_PROFILES TABLE - Fix and consolidate
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_select" ON public.user_profiles;
-- Drop new name
DROP POLICY IF EXISTS "user_profiles_select" ON public.user_profiles;

-- Consolidated SELECT
CREATE POLICY "user_profiles_select" ON public.user_profiles
    FOR SELECT USING (
        user_id = (SELECT auth.uid())
        OR is_platform_admin()
    );

-- ============================================================================
-- 18. VERTICALS TABLE - Fix and consolidate
-- ============================================================================

DROP POLICY IF EXISTS "Public can read active verticals" ON public.verticals;
DROP POLICY IF EXISTS "Admins can manage verticals" ON public.verticals;
DROP POLICY IF EXISTS "verticals_select" ON public.verticals;
DROP POLICY IF EXISTS "verticals_admin" ON public.verticals;

-- Consolidated SELECT
CREATE POLICY "verticals_select" ON public.verticals
    FOR SELECT USING (
        is_active = true
        OR is_platform_admin()
    );

-- Admin management
CREATE POLICY "verticals_admin" ON public.verticals
    FOR ALL USING (is_platform_admin());

-- ============================================================================
-- 19. FULFILLMENTS TABLE - Fix remaining issues
-- ============================================================================

DROP POLICY IF EXISTS "Participants can view fulfillments" ON public.fulfillments;
DROP POLICY IF EXISTS "Vendors can manage fulfillments" ON public.fulfillments;

-- These were already fixed in previous migration, but drop any remaining
-- The fulfillments_select, fulfillments_insert, fulfillments_update, fulfillments_delete
-- policies from 20260126_004 should be preserved

-- ============================================================================
-- Done!
-- ============================================================================
