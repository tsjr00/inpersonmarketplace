-- Migration: Fix remaining RLS warnings
-- Created: 2026-01-30
-- Issues:
--   1. auth_rls_initplan: policies using auth.uid() instead of (SELECT auth.uid())
--   2. multiple_permissive_policies: duplicate policies on same tables
--
-- IMPORTANT: This migration avoids recursion by:
--   - NOT using is_platform_admin() in user_profiles policies
--   - Using (SELECT auth.uid()) everywhere
--   - Using service_role for admin operations

-- ============================================================================
-- 1. MARKET_BOX_PICKUPS - Remove old duplicate policies
-- ============================================================================

DROP POLICY IF EXISTS "market_box_pickups_buyer_select" ON public.market_box_pickups;
DROP POLICY IF EXISTS "market_box_pickups_vendor_select" ON public.market_box_pickups;

-- ============================================================================
-- 2. MARKET_BOX_SUBSCRIPTIONS - Remove old duplicate policies
-- ============================================================================

DROP POLICY IF EXISTS "market_box_subs_buyer_select" ON public.market_box_subscriptions;
DROP POLICY IF EXISTS "market_box_subs_vendor_select" ON public.market_box_subscriptions;

-- ============================================================================
-- 3. CARTS - Fix auth.uid() and consolidate policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own cart" ON public.carts;
DROP POLICY IF EXISTS "Users can create own cart" ON public.carts;
DROP POLICY IF EXISTS "Users can update own cart" ON public.carts;
DROP POLICY IF EXISTS "Users can delete own cart" ON public.carts;
DROP POLICY IF EXISTS "carts_select" ON public.carts;
DROP POLICY IF EXISTS "carts_insert" ON public.carts;
DROP POLICY IF EXISTS "carts_update" ON public.carts;
DROP POLICY IF EXISTS "carts_delete" ON public.carts;
DROP POLICY IF EXISTS "carts_all" ON public.carts;

-- Single policy for all cart operations
CREATE POLICY "carts_all" ON public.carts
    FOR ALL USING (user_id = (SELECT auth.uid()));

-- ============================================================================
-- 4. CART_ITEMS - Fix auth.uid()
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Users can insert own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Users can update own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Users can delete own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_select" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_insert" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_update" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_delete" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_all" ON public.cart_items;

-- Single policy using cart ownership check
CREATE POLICY "cart_items_all" ON public.cart_items
    FOR ALL USING (
        cart_id IN (SELECT id FROM carts WHERE user_id = (SELECT auth.uid()))
    );

-- ============================================================================
-- 5. FULFILLMENTS - Consolidate policies
-- ============================================================================

DROP POLICY IF EXISTS "Participants can view fulfillments" ON public.fulfillments;
DROP POLICY IF EXISTS "Vendors can manage fulfillments" ON public.fulfillments;
DROP POLICY IF EXISTS "fulfillments_select" ON public.fulfillments;
DROP POLICY IF EXISTS "fulfillments_vendor_all" ON public.fulfillments;
DROP POLICY IF EXISTS "fulfillments_vendor_manage" ON public.fulfillments;

-- Single SELECT policy: transaction participants (buyer or vendor)
CREATE POLICY "fulfillments_select" ON public.fulfillments
    FOR SELECT USING (
        transaction_id IN (
            SELECT id FROM transactions WHERE buyer_user_id = (SELECT auth.uid())
        )
        OR transaction_id IN (
            SELECT id FROM transactions WHERE vendor_profile_id IN (
                SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
            )
        )
    );

-- Vendor can manage (insert/update/delete) fulfillments for their transactions
CREATE POLICY "fulfillments_vendor_manage" ON public.fulfillments
    FOR ALL USING (
        transaction_id IN (
            SELECT id FROM transactions WHERE vendor_profile_id IN (
                SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
            )
        )
    );

GRANT ALL ON public.fulfillments TO service_role;

-- ============================================================================
-- 6. LISTING_IMAGES - Consolidate policies
-- ============================================================================

DROP POLICY IF EXISTS "Public can view published listing images" ON public.listing_images;
DROP POLICY IF EXISTS "Vendors can manage listing images" ON public.listing_images;
DROP POLICY IF EXISTS "listing_images_select" ON public.listing_images;
DROP POLICY IF EXISTS "listing_images_vendor_all" ON public.listing_images;

-- Public can view images for published listings, vendors can see all their own
CREATE POLICY "listing_images_select" ON public.listing_images
    FOR SELECT USING (
        listing_id IN (
            SELECT id FROM listings WHERE status = 'published'
        )
        OR listing_id IN (
            SELECT id FROM listings WHERE vendor_profile_id IN (
                SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
            )
        )
    );

-- Vendors can manage their own listing images
CREATE POLICY "listing_images_vendor_manage" ON public.listing_images
    FOR ALL USING (
        listing_id IN (
            SELECT id FROM listings WHERE vendor_profile_id IN (
                SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
            )
        )
    );

GRANT ALL ON public.listing_images TO service_role;

-- ============================================================================
-- 7. LISTING_MARKETS - Consolidate and fix auth.uid()
-- ============================================================================

DROP POLICY IF EXISTS "Admins full access to listing markets" ON public.listing_markets;
DROP POLICY IF EXISTS "Anyone can view listing markets" ON public.listing_markets;
DROP POLICY IF EXISTS "Vendors can manage own listing markets" ON public.listing_markets;
DROP POLICY IF EXISTS "listing_markets_select" ON public.listing_markets;
DROP POLICY IF EXISTS "listing_markets_vendor_all" ON public.listing_markets;

-- Public can view all listing-market associations
CREATE POLICY "listing_markets_select" ON public.listing_markets
    FOR SELECT USING (true);

-- Vendors can manage their own listing-market associations
CREATE POLICY "listing_markets_vendor_manage" ON public.listing_markets
    FOR ALL USING (
        listing_id IN (
            SELECT id FROM listings WHERE vendor_profile_id IN (
                SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
            )
        )
    );

GRANT ALL ON public.listing_markets TO service_role;

-- ============================================================================
-- 8. LISTINGS - Remove duplicate policies
-- ============================================================================

DROP POLICY IF EXISTS "Public can view published listings" ON public.listings;
DROP POLICY IF EXISTS "Vendors can view own listings" ON public.listings;
DROP POLICY IF EXISTS "Vendors can create listings" ON public.listings;
DROP POLICY IF EXISTS "Vendors can update own listings" ON public.listings;
DROP POLICY IF EXISTS "Vendors can delete own listings" ON public.listings;
DROP POLICY IF EXISTS "listings_select" ON public.listings;
DROP POLICY IF EXISTS "listings_insert" ON public.listings;
DROP POLICY IF EXISTS "listings_update" ON public.listings;
DROP POLICY IF EXISTS "listings_delete" ON public.listings;

-- Public can view published, vendors can view own
CREATE POLICY "listings_select" ON public.listings
    FOR SELECT USING (
        status = 'published'
        OR vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
        )
    );

-- Vendors can manage their own listings
CREATE POLICY "listings_manage" ON public.listings
    FOR ALL USING (
        vendor_profile_id IN (
            SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())
        )
    );

GRANT ALL ON public.listings TO service_role;

-- ============================================================================
-- Done!
-- ============================================================================
