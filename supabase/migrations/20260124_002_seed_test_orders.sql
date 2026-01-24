-- ============================================================================
-- Migration: Seed Test Orders for E2E Testing
-- Created: 2026-01-24
-- Purpose: Create orders between test accounts with various statuses for testing
-- ============================================================================

-- This migration creates test orders between specific test accounts
-- to enable end-to-end testing of the order flow

DO $$
DECLARE
    -- User IDs (will be populated from emails)
    v_emily_id UUID;
    v_buyer2_id UUID;
    v_amy_id UUID;
    v_chris_id UUID;
    v_premium_vendor_id UUID;
    v_premium_buyer_id UUID;
    v_jennifer_id UUID;

    -- Vendor Profile IDs
    v_premium_vendor_profile_id UUID;
    v_jennifer_vendor_profile_id UUID;

    -- Listing IDs (will grab from vendors)
    v_listing_1 UUID;
    v_listing_2 UUID;
    v_listing_3 UUID;
    v_listing_4 UUID;

    -- Market ID
    v_market_id UUID;

    -- Order variables
    v_order_id UUID;
    v_order_number TEXT;
    v_counter INT := 1;

BEGIN
    -- ========================================
    -- Step 1: Get User IDs from emails
    -- ========================================

    SELECT id INTO v_emily_id FROM auth.users WHERE email = 'emily.taylor1@test.com';
    SELECT id INTO v_buyer2_id FROM auth.users WHERE email = 'buyer2@example.com';
    SELECT id INTO v_amy_id FROM auth.users WHERE email = 'amy.wilson7@test.com';
    SELECT id INTO v_chris_id FROM auth.users WHERE email = 'chris.jones12@test.com';
    SELECT id INTO v_premium_vendor_id FROM auth.users WHERE email = 'PremiumVendor+tsjr00@gmail.com';
    SELECT id INTO v_premium_buyer_id FROM auth.users WHERE email = 'PremiumBuyer+tsjr00@gmail.com';
    SELECT id INTO v_jennifer_id FROM auth.users WHERE email = 'jennifer@8fifteenconsulting.com';

    -- Log found users
    RAISE NOTICE 'Emily ID: %', v_emily_id;
    RAISE NOTICE 'Buyer2 ID: %', v_buyer2_id;
    RAISE NOTICE 'Amy ID: %', v_amy_id;
    RAISE NOTICE 'Chris ID: %', v_chris_id;
    RAISE NOTICE 'Premium Vendor ID: %', v_premium_vendor_id;
    RAISE NOTICE 'Premium Buyer ID: %', v_premium_buyer_id;
    RAISE NOTICE 'Jennifer ID: %', v_jennifer_id;

    -- ========================================
    -- Step 2: Get Vendor Profile IDs
    -- ========================================

    SELECT id INTO v_premium_vendor_profile_id
    FROM vendor_profiles
    WHERE user_id = v_premium_vendor_id AND status = 'approved'
    LIMIT 1;

    SELECT id INTO v_jennifer_vendor_profile_id
    FROM vendor_profiles
    WHERE user_id = v_jennifer_id AND status = 'approved'
    LIMIT 1;

    RAISE NOTICE 'Premium Vendor Profile: %', v_premium_vendor_profile_id;
    RAISE NOTICE 'Jennifer Vendor Profile: %', v_jennifer_vendor_profile_id;

    -- ========================================
    -- Step 3: Get Listings from Vendors
    -- ========================================

    -- Get listings from Premium Vendor
    SELECT id INTO v_listing_1
    FROM listings
    WHERE vendor_profile_id = v_premium_vendor_profile_id
      AND status = 'published'
      AND deleted_at IS NULL
    LIMIT 1;

    SELECT id INTO v_listing_2
    FROM listings
    WHERE vendor_profile_id = v_premium_vendor_profile_id
      AND status = 'published'
      AND deleted_at IS NULL
      AND id != COALESCE(v_listing_1, '00000000-0000-0000-0000-000000000000')
    LIMIT 1;

    -- Get listings from Jennifer
    SELECT id INTO v_listing_3
    FROM listings
    WHERE vendor_profile_id = v_jennifer_vendor_profile_id
      AND status = 'published'
      AND deleted_at IS NULL
    LIMIT 1;

    SELECT id INTO v_listing_4
    FROM listings
    WHERE vendor_profile_id = v_jennifer_vendor_profile_id
      AND status = 'published'
      AND deleted_at IS NULL
      AND id != COALESCE(v_listing_3, '00000000-0000-0000-0000-000000000000')
    LIMIT 1;

    RAISE NOTICE 'Listing 1 (Premium Vendor): %', v_listing_1;
    RAISE NOTICE 'Listing 2 (Premium Vendor): %', v_listing_2;
    RAISE NOTICE 'Listing 3 (Jennifer): %', v_listing_3;
    RAISE NOTICE 'Listing 4 (Jennifer): %', v_listing_4;

    -- ========================================
    -- Step 4: Get a Market for pickup location
    -- ========================================

    SELECT id INTO v_market_id
    FROM markets
    WHERE status = 'active' AND approval_status = 'approved'
    LIMIT 1;

    RAISE NOTICE 'Market ID: %', v_market_id;

    -- ========================================
    -- Step 5: Create Test Orders
    -- ========================================

    -- Only proceed if we have the necessary data
    IF v_premium_vendor_profile_id IS NULL THEN
        RAISE NOTICE 'Premium Vendor profile not found - skipping orders for this vendor';
    END IF;

    IF v_jennifer_vendor_profile_id IS NULL THEN
        RAISE NOTICE 'Jennifer vendor profile not found - skipping orders for this vendor';
    END IF;

    -- ----------------------------------------
    -- ORDER 1: Emily -> Premium Vendor (pending_confirmation)
    -- New order waiting for vendor to confirm
    -- ----------------------------------------
    IF v_emily_id IS NOT NULL AND v_premium_vendor_profile_id IS NOT NULL AND v_listing_1 IS NOT NULL THEN
        v_order_number := 'TEST-' || LPAD(v_counter::TEXT, 4, '0');
        v_counter := v_counter + 1;

        INSERT INTO orders (
            id, order_number, buyer_id, vendor_profile_id, market_id,
            status, total_amount_cents, subtotal_cents, platform_fee_cents,
            pickup_date, pickup_time_slot, vertical_id, created_at
        ) VALUES (
            gen_random_uuid(), v_order_number, v_emily_id, v_premium_vendor_profile_id, v_market_id,
            'pending_confirmation', 2500, 2500, 250,
            CURRENT_DATE + INTERVAL '3 days', '9:00 AM - 11:00 AM', 'farmers-market', NOW() - INTERVAL '1 hour'
        ) RETURNING id INTO v_order_id;

        INSERT INTO order_items (order_id, listing_id, quantity, unit_price_cents, total_price_cents)
        VALUES (v_order_id, v_listing_1, 2, 1250, 2500);

        RAISE NOTICE 'Created Order 1 (pending_confirmation): % - Emily -> Premium Vendor', v_order_number;
    END IF;

    -- ----------------------------------------
    -- ORDER 2: Buyer2 -> Premium Vendor (confirmed)
    -- Vendor has confirmed, waiting for pickup day
    -- ----------------------------------------
    IF v_buyer2_id IS NOT NULL AND v_premium_vendor_profile_id IS NOT NULL AND v_listing_1 IS NOT NULL THEN
        v_order_number := 'TEST-' || LPAD(v_counter::TEXT, 4, '0');
        v_counter := v_counter + 1;

        INSERT INTO orders (
            id, order_number, buyer_id, vendor_profile_id, market_id,
            status, total_amount_cents, subtotal_cents, platform_fee_cents,
            pickup_date, pickup_time_slot, vertical_id, created_at, confirmed_at
        ) VALUES (
            gen_random_uuid(), v_order_number, v_buyer2_id, v_premium_vendor_profile_id, v_market_id,
            'confirmed', 3750, 3750, 375,
            CURRENT_DATE + INTERVAL '5 days', '10:00 AM - 12:00 PM', 'farmers-market', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'
        ) RETURNING id INTO v_order_id;

        INSERT INTO order_items (order_id, listing_id, quantity, unit_price_cents, total_price_cents)
        VALUES (v_order_id, v_listing_1, 3, 1250, 3750);

        RAISE NOTICE 'Created Order 2 (confirmed): % - Buyer2 -> Premium Vendor', v_order_number;
    END IF;

    -- ----------------------------------------
    -- ORDER 3: Amy -> Premium Vendor (ready_for_pickup)
    -- Ready for buyer to pick up - TEST THE CONFIRM RECEIPT FLOW
    -- ----------------------------------------
    IF v_amy_id IS NOT NULL AND v_premium_vendor_profile_id IS NOT NULL AND v_listing_2 IS NOT NULL THEN
        v_order_number := 'TEST-' || LPAD(v_counter::TEXT, 4, '0');
        v_counter := v_counter + 1;

        INSERT INTO orders (
            id, order_number, buyer_id, vendor_profile_id, market_id,
            status, total_amount_cents, subtotal_cents, platform_fee_cents,
            pickup_date, pickup_time_slot, vertical_id, created_at, confirmed_at, ready_at
        ) VALUES (
            gen_random_uuid(), v_order_number, v_amy_id, v_premium_vendor_profile_id, v_market_id,
            'ready_for_pickup', 1500, 1500, 150,
            CURRENT_DATE, '8:00 AM - 10:00 AM', 'farmers-market', NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 hour'
        ) RETURNING id INTO v_order_id;

        INSERT INTO order_items (order_id, listing_id, quantity, unit_price_cents, total_price_cents)
        VALUES (v_order_id, v_listing_2, 1, 1500, 1500);

        RAISE NOTICE 'Created Order 3 (ready_for_pickup): % - Amy -> Premium Vendor', v_order_number;
    END IF;

    -- ----------------------------------------
    -- ORDER 4: Chris -> Premium Vendor (completed with review)
    -- Fully completed order with a review
    -- ----------------------------------------
    IF v_chris_id IS NOT NULL AND v_premium_vendor_profile_id IS NOT NULL AND v_listing_1 IS NOT NULL THEN
        v_order_number := 'TEST-' || LPAD(v_counter::TEXT, 4, '0');
        v_counter := v_counter + 1;

        INSERT INTO orders (
            id, order_number, buyer_id, vendor_profile_id, market_id,
            status, total_amount_cents, subtotal_cents, platform_fee_cents,
            pickup_date, pickup_time_slot, vertical_id, created_at, confirmed_at, ready_at, completed_at
        ) VALUES (
            gen_random_uuid(), v_order_number, v_chris_id, v_premium_vendor_profile_id, v_market_id,
            'completed', 5000, 5000, 500,
            CURRENT_DATE - INTERVAL '7 days', '9:00 AM - 11:00 AM', 'farmers-market',
            NOW() - INTERVAL '10 days', NOW() - INTERVAL '9 days', NOW() - INTERVAL '8 days', NOW() - INTERVAL '7 days'
        ) RETURNING id INTO v_order_id;

        INSERT INTO order_items (order_id, listing_id, quantity, unit_price_cents, total_price_cents)
        VALUES (v_order_id, v_listing_1, 4, 1250, 5000);

        -- Add a review for this completed order
        INSERT INTO order_ratings (order_id, vendor_profile_id, buyer_id, rating, comment, created_at)
        VALUES (v_order_id, v_premium_vendor_profile_id, v_chris_id, 5, 'Excellent quality produce! Will definitely order again.', NOW() - INTERVAL '6 days');

        RAISE NOTICE 'Created Order 4 (completed with review): % - Chris -> Premium Vendor', v_order_number;
    END IF;

    -- ----------------------------------------
    -- ORDER 5: Premium Buyer -> Premium Vendor (cancelled by buyer)
    -- Test cancellation flow
    -- ----------------------------------------
    IF v_premium_buyer_id IS NOT NULL AND v_premium_vendor_profile_id IS NOT NULL AND v_listing_2 IS NOT NULL THEN
        v_order_number := 'TEST-' || LPAD(v_counter::TEXT, 4, '0');
        v_counter := v_counter + 1;

        INSERT INTO orders (
            id, order_number, buyer_id, vendor_profile_id, market_id,
            status, total_amount_cents, subtotal_cents, platform_fee_cents,
            pickup_date, pickup_time_slot, vertical_id, created_at, cancelled_at, cancellation_reason
        ) VALUES (
            gen_random_uuid(), v_order_number, v_premium_buyer_id, v_premium_vendor_profile_id, v_market_id,
            'cancelled', 2000, 2000, 200,
            CURRENT_DATE + INTERVAL '2 days', '11:00 AM - 1:00 PM', 'farmers-market',
            NOW() - INTERVAL '4 days', NOW() - INTERVAL '3 days', 'Changed my plans'
        ) RETURNING id INTO v_order_id;

        INSERT INTO order_items (order_id, listing_id, quantity, unit_price_cents, total_price_cents, status)
        VALUES (v_order_id, v_listing_2, 2, 1000, 2000, 'cancelled');

        RAISE NOTICE 'Created Order 5 (cancelled): % - Premium Buyer -> Premium Vendor', v_order_number;
    END IF;

    -- ----------------------------------------
    -- ORDER 6: Emily -> Jennifer (pending_confirmation)
    -- ----------------------------------------
    IF v_emily_id IS NOT NULL AND v_jennifer_vendor_profile_id IS NOT NULL AND v_listing_3 IS NOT NULL THEN
        v_order_number := 'TEST-' || LPAD(v_counter::TEXT, 4, '0');
        v_counter := v_counter + 1;

        INSERT INTO orders (
            id, order_number, buyer_id, vendor_profile_id, market_id,
            status, total_amount_cents, subtotal_cents, platform_fee_cents,
            pickup_date, pickup_time_slot, vertical_id, created_at
        ) VALUES (
            gen_random_uuid(), v_order_number, v_emily_id, v_jennifer_vendor_profile_id, v_market_id,
            'pending_confirmation', 1800, 1800, 180,
            CURRENT_DATE + INTERVAL '4 days', '2:00 PM - 4:00 PM', 'farmers-market', NOW() - INTERVAL '30 minutes'
        ) RETURNING id INTO v_order_id;

        INSERT INTO order_items (order_id, listing_id, quantity, unit_price_cents, total_price_cents)
        VALUES (v_order_id, v_listing_3, 2, 900, 1800);

        RAISE NOTICE 'Created Order 6 (pending_confirmation): % - Emily -> Jennifer', v_order_number;
    END IF;

    -- ----------------------------------------
    -- ORDER 7: Premium Buyer -> Jennifer (ready_for_pickup)
    -- Another ready order for testing confirm receipt
    -- ----------------------------------------
    IF v_premium_buyer_id IS NOT NULL AND v_jennifer_vendor_profile_id IS NOT NULL AND v_listing_4 IS NOT NULL THEN
        v_order_number := 'TEST-' || LPAD(v_counter::TEXT, 4, '0');
        v_counter := v_counter + 1;

        INSERT INTO orders (
            id, order_number, buyer_id, vendor_profile_id, market_id,
            status, total_amount_cents, subtotal_cents, platform_fee_cents,
            pickup_date, pickup_time_slot, vertical_id, created_at, confirmed_at, ready_at
        ) VALUES (
            gen_random_uuid(), v_order_number, v_premium_buyer_id, v_jennifer_vendor_profile_id, v_market_id,
            'ready_for_pickup', 3200, 3200, 320,
            CURRENT_DATE, '10:00 AM - 12:00 PM', 'farmers-market',
            NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 hours'
        ) RETURNING id INTO v_order_id;

        INSERT INTO order_items (order_id, listing_id, quantity, unit_price_cents, total_price_cents)
        VALUES (v_order_id, v_listing_4, 4, 800, 3200);

        RAISE NOTICE 'Created Order 7 (ready_for_pickup): % - Premium Buyer -> Jennifer', v_order_number;
    END IF;

    -- ----------------------------------------
    -- ORDER 8: Amy -> Jennifer (confirmed)
    -- ----------------------------------------
    IF v_amy_id IS NOT NULL AND v_jennifer_vendor_profile_id IS NOT NULL AND v_listing_3 IS NOT NULL THEN
        v_order_number := 'TEST-' || LPAD(v_counter::TEXT, 4, '0');
        v_counter := v_counter + 1;

        INSERT INTO orders (
            id, order_number, buyer_id, vendor_profile_id, market_id,
            status, total_amount_cents, subtotal_cents, platform_fee_cents,
            pickup_date, pickup_time_slot, vertical_id, created_at, confirmed_at
        ) VALUES (
            gen_random_uuid(), v_order_number, v_amy_id, v_jennifer_vendor_profile_id, v_market_id,
            'confirmed', 2700, 2700, 270,
            CURRENT_DATE + INTERVAL '6 days', '1:00 PM - 3:00 PM', 'farmers-market',
            NOW() - INTERVAL '1 day', NOW() - INTERVAL '12 hours'
        ) RETURNING id INTO v_order_id;

        INSERT INTO order_items (order_id, listing_id, quantity, unit_price_cents, total_price_cents)
        VALUES (v_order_id, v_listing_3, 3, 900, 2700);

        RAISE NOTICE 'Created Order 8 (confirmed): % - Amy -> Jennifer', v_order_number;
    END IF;

    -- ----------------------------------------
    -- ORDER 9: Chris -> Jennifer (completed, no review yet)
    -- Test leaving a review flow
    -- ----------------------------------------
    IF v_chris_id IS NOT NULL AND v_jennifer_vendor_profile_id IS NOT NULL AND v_listing_4 IS NOT NULL THEN
        v_order_number := 'TEST-' || LPAD(v_counter::TEXT, 4, '0');
        v_counter := v_counter + 1;

        INSERT INTO orders (
            id, order_number, buyer_id, vendor_profile_id, market_id,
            status, total_amount_cents, subtotal_cents, platform_fee_cents,
            pickup_date, pickup_time_slot, vertical_id, created_at, confirmed_at, ready_at, completed_at
        ) VALUES (
            gen_random_uuid(), v_order_number, v_chris_id, v_jennifer_vendor_profile_id, v_market_id,
            'completed', 1600, 1600, 160,
            CURRENT_DATE - INTERVAL '3 days', '11:00 AM - 1:00 PM', 'farmers-market',
            NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days', NOW() - INTERVAL '3 days'
        ) RETURNING id INTO v_order_id;

        INSERT INTO order_items (order_id, listing_id, quantity, unit_price_cents, total_price_cents)
        VALUES (v_order_id, v_listing_4, 2, 800, 1600);

        RAISE NOTICE 'Created Order 9 (completed, awaiting review): % - Chris -> Jennifer', v_order_number;
    END IF;

    -- ----------------------------------------
    -- ORDER 10: Buyer2 -> Jennifer (cancelled by vendor after confirmation)
    -- Test vendor-side cancellation
    -- ----------------------------------------
    IF v_buyer2_id IS NOT NULL AND v_jennifer_vendor_profile_id IS NOT NULL AND v_listing_3 IS NOT NULL THEN
        v_order_number := 'TEST-' || LPAD(v_counter::TEXT, 4, '0');
        v_counter := v_counter + 1;

        INSERT INTO orders (
            id, order_number, buyer_id, vendor_profile_id, market_id,
            status, total_amount_cents, subtotal_cents, platform_fee_cents,
            pickup_date, pickup_time_slot, vertical_id, created_at, confirmed_at, cancelled_at, cancellation_reason
        ) VALUES (
            gen_random_uuid(), v_order_number, v_buyer2_id, v_jennifer_vendor_profile_id, v_market_id,
            'cancelled', 900, 900, 90,
            CURRENT_DATE + INTERVAL '1 day', '3:00 PM - 5:00 PM', 'farmers-market',
            NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', 'Item no longer available'
        ) RETURNING id INTO v_order_id;

        INSERT INTO order_items (order_id, listing_id, quantity, unit_price_cents, total_price_cents, status)
        VALUES (v_order_id, v_listing_3, 1, 900, 900, 'cancelled');

        RAISE NOTICE 'Created Order 10 (cancelled by vendor): % - Buyer2 -> Jennifer', v_order_number;
    END IF;

    -- ----------------------------------------
    -- ORDER 11: Premium Vendor (as buyer) -> Jennifer
    -- Vendor buying from another vendor - pending
    -- ----------------------------------------
    IF v_premium_vendor_id IS NOT NULL AND v_jennifer_vendor_profile_id IS NOT NULL AND v_listing_3 IS NOT NULL THEN
        v_order_number := 'TEST-' || LPAD(v_counter::TEXT, 4, '0');
        v_counter := v_counter + 1;

        INSERT INTO orders (
            id, order_number, buyer_id, vendor_profile_id, market_id,
            status, total_amount_cents, subtotal_cents, platform_fee_cents,
            pickup_date, pickup_time_slot, vertical_id, created_at
        ) VALUES (
            gen_random_uuid(), v_order_number, v_premium_vendor_id, v_jennifer_vendor_profile_id, v_market_id,
            'pending_confirmation', 4500, 4500, 450,
            CURRENT_DATE + INTERVAL '2 days', '9:00 AM - 11:00 AM', 'farmers-market', NOW() - INTERVAL '2 hours'
        ) RETURNING id INTO v_order_id;

        INSERT INTO order_items (order_id, listing_id, quantity, unit_price_cents, total_price_cents)
        VALUES (v_order_id, v_listing_3, 5, 900, 4500);

        RAISE NOTICE 'Created Order 11 (vendor as buyer, pending): % - Premium Vendor -> Jennifer', v_order_number;
    END IF;

    -- ----------------------------------------
    -- ORDER 12: Jennifer (as buyer) -> Premium Vendor
    -- Vendor buying from another vendor - confirmed
    -- ----------------------------------------
    IF v_jennifer_id IS NOT NULL AND v_premium_vendor_profile_id IS NOT NULL AND v_listing_1 IS NOT NULL THEN
        v_order_number := 'TEST-' || LPAD(v_counter::TEXT, 4, '0');
        v_counter := v_counter + 1;

        INSERT INTO orders (
            id, order_number, buyer_id, vendor_profile_id, market_id,
            status, total_amount_cents, subtotal_cents, platform_fee_cents,
            pickup_date, pickup_time_slot, vertical_id, created_at, confirmed_at
        ) VALUES (
            gen_random_uuid(), v_order_number, v_jennifer_id, v_premium_vendor_profile_id, v_market_id,
            'confirmed', 6250, 6250, 625,
            CURRENT_DATE + INTERVAL '4 days', '10:00 AM - 12:00 PM', 'farmers-market',
            NOW() - INTERVAL '1 day', NOW() - INTERVAL '6 hours'
        ) RETURNING id INTO v_order_id;

        INSERT INTO order_items (order_id, listing_id, quantity, unit_price_cents, total_price_cents)
        VALUES (v_order_id, v_listing_1, 5, 1250, 6250);

        RAISE NOTICE 'Created Order 12 (vendor as buyer, confirmed): % - Jennifer -> Premium Vendor', v_order_number;
    END IF;

    RAISE NOTICE '============================================';
    RAISE NOTICE 'Test orders creation complete!';
    RAISE NOTICE 'Orders created: %', v_counter - 1;
    RAISE NOTICE '============================================';

END $$;

-- ============================================================================
-- Summary of Test Orders Created:
-- ============================================================================
-- Order 1:  Emily -> Premium Vendor       | pending_confirmation
-- Order 2:  Buyer2 -> Premium Vendor      | confirmed
-- Order 3:  Amy -> Premium Vendor         | ready_for_pickup (test confirm receipt)
-- Order 4:  Chris -> Premium Vendor       | completed (with review)
-- Order 5:  Premium Buyer -> Premium Vendor | cancelled (by buyer)
-- Order 6:  Emily -> Jennifer             | pending_confirmation
-- Order 7:  Premium Buyer -> Jennifer     | ready_for_pickup (test confirm receipt)
-- Order 8:  Amy -> Jennifer               | confirmed
-- Order 9:  Chris -> Jennifer             | completed (no review - test leaving review)
-- Order 10: Buyer2 -> Jennifer            | cancelled (by vendor)
-- Order 11: Premium Vendor -> Jennifer    | pending_confirmation (vendor as buyer)
-- Order 12: Jennifer -> Premium Vendor    | confirmed (vendor as buyer)
-- ============================================================================
-- END MIGRATION
-- ============================================================================
