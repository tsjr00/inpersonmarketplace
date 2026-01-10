-- Migration: Fix RLS Policies for Listings and Orders
-- Created: 2026-01-10
-- Purpose: Fix vendor access to listings (INSERT/UPDATE) and orders

-- =============================================================================
-- DIAGNOSTIC QUERIES (Run these first to see current state)
-- =============================================================================

-- Uncomment to run diagnostics:
-- SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'listings' ORDER BY cmd, policyname;
-- SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'orders' ORDER BY cmd, policyname;
-- SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'order_items' ORDER BY cmd, policyname;

-- =============================================================================
-- PART 1: FIX LISTINGS RLS POLICIES
-- =============================================================================
-- Problem: Vendors cannot INSERT new listings or UPDATE existing ones due to RLS policy issues
-- Solution: Replace with policies that properly check vendor_profile ownership via user_id

-- Drop all existing listings policies
DROP POLICY IF EXISTS "listings_select" ON public.listings;
DROP POLICY IF EXISTS "listings_insert" ON public.listings;
DROP POLICY IF EXISTS "listings_update" ON public.listings;
DROP POLICY IF EXISTS "listings_delete" ON public.listings;
DROP POLICY IF EXISTS "Vendors can view own listings" ON public.listings;
DROP POLICY IF EXISTS "Vendors can create listings" ON public.listings;
DROP POLICY IF EXISTS "Vendors can update own listings" ON public.listings;
DROP POLICY IF EXISTS "Vendors can delete own listings" ON public.listings;
DROP POLICY IF EXISTS "Public can view active listings" ON public.listings;
DROP POLICY IF EXISTS "Public can view published listings" ON public.listings;
DROP POLICY IF EXISTS "Admins can view all listings" ON public.listings;

-- SELECT: Vendors see own (any status) + Public sees published from approved vendors + Admins see all
CREATE POLICY "listings_select" ON public.listings
FOR SELECT USING (
  -- Vendor sees their own listings (any status)
  vendor_profile_id IN (
    SELECT id FROM public.vendor_profiles
    WHERE user_id = (SELECT auth.uid())
  )
  OR
  -- Public sees published listings from approved vendors
  (
    status = 'published'
    AND deleted_at IS NULL
    AND vendor_profile_id IN (
      SELECT id FROM public.vendor_profiles
      WHERE status = 'approved'
    )
  )
  OR
  -- Admins see all
  EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE user_id = (SELECT auth.uid())
    AND role = 'admin'
  )
);

-- INSERT: Vendor can create listings for their own vendor_profile_id (must be approved)
CREATE POLICY "listings_insert" ON public.listings
FOR INSERT WITH CHECK (
  vendor_profile_id IN (
    SELECT id FROM public.vendor_profiles
    WHERE user_id = (SELECT auth.uid())
    AND status = 'approved'
  )
);

-- UPDATE: Vendor can update their own listings
CREATE POLICY "listings_update" ON public.listings
FOR UPDATE USING (
  vendor_profile_id IN (
    SELECT id FROM public.vendor_profiles
    WHERE user_id = (SELECT auth.uid())
  )
) WITH CHECK (
  vendor_profile_id IN (
    SELECT id FROM public.vendor_profiles
    WHERE user_id = (SELECT auth.uid())
  )
);

-- DELETE: Vendor can delete (soft delete) their own listings
CREATE POLICY "listings_delete" ON public.listings
FOR DELETE USING (
  vendor_profile_id IN (
    SELECT id FROM public.vendor_profiles
    WHERE user_id = (SELECT auth.uid())
  )
);

-- =============================================================================
-- PART 2: FIX ORDERS RLS POLICIES
-- =============================================================================
-- Problem: Orders page shows "Failed to load orders" due to RLS blocking access
-- Solution: Create proper policies for orders and order_items tables

-- Check if orders table exists before applying policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
    -- Drop existing orders policies
    DROP POLICY IF EXISTS "orders_select" ON public.orders;
    DROP POLICY IF EXISTS "orders_insert" ON public.orders;
    DROP POLICY IF EXISTS "orders_update" ON public.orders;
    DROP POLICY IF EXISTS "Vendors can view their orders" ON public.orders;
    DROP POLICY IF EXISTS "Buyers can view own orders" ON public.orders;

    -- Enable RLS if not already enabled
    ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

    -- SELECT: Buyers see their orders + Vendors see orders containing their items + Admins see all
    EXECUTE $policy$
    CREATE POLICY "orders_select" ON public.orders
    FOR SELECT USING (
      -- Buyer sees their own orders
      buyer_user_id = (SELECT auth.uid())
      OR
      -- Vendor sees orders containing their items
      id IN (
        SELECT DISTINCT oi.order_id
        FROM public.order_items oi
        JOIN public.listings l ON oi.listing_id = l.id
        WHERE l.vendor_profile_id IN (
          SELECT id FROM public.vendor_profiles
          WHERE user_id = (SELECT auth.uid())
        )
      )
      OR
      -- Admin sees all
      EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_id = (SELECT auth.uid())
        AND role = 'admin'
      )
    )
    $policy$;

    -- INSERT: Authenticated buyers can create orders
    EXECUTE $policy$
    CREATE POLICY "orders_insert" ON public.orders
    FOR INSERT WITH CHECK (
      buyer_user_id = (SELECT auth.uid())
    )
    $policy$;

    -- UPDATE: Buyer can update own pending orders + Vendor can update status
    EXECUTE $policy$
    CREATE POLICY "orders_update" ON public.orders
    FOR UPDATE USING (
      buyer_user_id = (SELECT auth.uid())
      OR
      id IN (
        SELECT DISTINCT oi.order_id
        FROM public.order_items oi
        JOIN public.listings l ON oi.listing_id = l.id
        WHERE l.vendor_profile_id IN (
          SELECT id FROM public.vendor_profiles
          WHERE user_id = (SELECT auth.uid())
        )
      )
    )
    $policy$;
  END IF;
END $$;

-- =============================================================================
-- PART 3: FIX ORDER_ITEMS RLS POLICIES
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items') THEN
    -- Drop existing order_items policies
    DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
    DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
    DROP POLICY IF EXISTS "order_items_update" ON public.order_items;

    -- Enable RLS if not already enabled
    ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

    -- SELECT: Same access as parent order
    EXECUTE $policy$
    CREATE POLICY "order_items_select" ON public.order_items
    FOR SELECT USING (
      -- Buyer's order items
      order_id IN (
        SELECT id FROM public.orders WHERE buyer_user_id = (SELECT auth.uid())
      )
      OR
      -- Vendor's sold items
      listing_id IN (
        SELECT id FROM public.listings
        WHERE vendor_profile_id IN (
          SELECT id FROM public.vendor_profiles
          WHERE user_id = (SELECT auth.uid())
        )
      )
      OR
      -- Admin
      EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_id = (SELECT auth.uid())
        AND role = 'admin'
      )
    )
    $policy$;

    -- INSERT: Via order creation
    EXECUTE $policy$
    CREATE POLICY "order_items_insert" ON public.order_items
    FOR INSERT WITH CHECK (
      order_id IN (
        SELECT id FROM public.orders WHERE buyer_user_id = (SELECT auth.uid())
      )
    )
    $policy$;

    -- UPDATE: Vendor can update item status
    EXECUTE $policy$
    CREATE POLICY "order_items_update" ON public.order_items
    FOR UPDATE USING (
      listing_id IN (
        SELECT id FROM public.listings
        WHERE vendor_profile_id IN (
          SELECT id FROM public.vendor_profiles
          WHERE user_id = (SELECT auth.uid())
        )
      )
    )
    $policy$;
  END IF;
END $$;

-- =============================================================================
-- VERIFY POLICIES
-- =============================================================================

SELECT 'Listings policies:' as info;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'listings' ORDER BY cmd;

SELECT 'Orders policies:' as info;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'orders' ORDER BY cmd;

SELECT 'Order_items policies:' as info;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'order_items' ORDER BY cmd;
