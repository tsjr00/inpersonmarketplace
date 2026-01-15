-- Phase K Test Data: Comprehensive Order Scenarios
-- Run this in your Supabase SQL Editor (Dev environment first)
-- =============================================================================

-- IMPORTANT: Replace these placeholder values with actual IDs from your database
-- Run these queries first to get the IDs you need:

/*
-- Get existing user IDs (pick one to be the buyer):
SELECT id, email FROM auth.users LIMIT 5;

-- Get existing vendor profile IDs:
SELECT id, profile_data->>'business_name' as name FROM vendor_profiles LIMIT 5;

-- Get existing listing IDs:
SELECT id, title, vendor_profile_id FROM listings WHERE status = 'published' LIMIT 10;

-- Get existing market IDs:
SELECT id, name, market_type FROM markets LIMIT 5;
*/

-- =============================================================================
-- REPLACE THESE WITH YOUR ACTUAL VALUES
-- =============================================================================

-- Set your actual IDs here (replace the UUIDs below):
DO $$
DECLARE
    -- User IDs (from auth.users or user_profiles)
    v_buyer_user_id UUID := 'YOUR_BUYER_USER_ID';  -- Replace with actual buyer user_id

    -- Vendor Profile IDs
    v_vendor_profile_id_1 UUID := 'YOUR_VENDOR_PROFILE_ID_1';  -- Replace with actual
    v_vendor_profile_id_2 UUID := 'YOUR_VENDOR_PROFILE_ID_2';  -- Replace with actual (optional)

    -- Listing IDs
    v_listing_id_1 UUID := 'YOUR_LISTING_ID_1';  -- Replace with actual listing
    v_listing_id_2 UUID := 'YOUR_LISTING_ID_2';  -- Replace with actual listing
    v_listing_id_3 UUID := 'YOUR_LISTING_ID_3';  -- Replace with actual listing (optional)

    -- Market IDs
    v_market_id_traditional UUID := 'YOUR_TRADITIONAL_MARKET_ID';  -- market_type = 'traditional'
    v_market_id_private UUID := 'YOUR_PRIVATE_MARKET_ID';  -- market_type = 'private_pickup' (optional)

    -- Generated Order IDs
    v_order_id_1 UUID;
    v_order_id_2 UUID;
    v_order_id_3 UUID;
    v_order_id_4 UUID;
    v_order_id_5 UUID;
    v_order_id_6 UUID;

BEGIN
    -- Generate UUIDs for orders
    v_order_id_1 := gen_random_uuid();
    v_order_id_2 := gen_random_uuid();
    v_order_id_3 := gen_random_uuid();
    v_order_id_4 := gen_random_uuid();
    v_order_id_5 := gen_random_uuid();
    v_order_id_6 := gen_random_uuid();

    -- =============================================================================
    -- ORDER 1: Pending Order (Single Item) - Tests initial state
    -- =============================================================================
    INSERT INTO orders (id, order_number, buyer_user_id, status, total_amount_cents, created_at, updated_at)
    VALUES (
        v_order_id_1,
        'ORD-' || SUBSTR(v_order_id_1::text, 1, 8),
        v_buyer_user_id,
        'pending',
        1250,  -- $12.50
        NOW() - INTERVAL '30 minutes',
        NOW() - INTERVAL '30 minutes'
    );

    INSERT INTO order_items (order_id, listing_id, vendor_profile_id, quantity, unit_price_cents, subtotal_cents, status, market_id, pickup_date)
    VALUES (
        v_order_id_1,
        v_listing_id_1,
        v_vendor_profile_id_1,
        2,
        625,  -- $6.25 each
        1250, -- $12.50 total
        'pending',
        v_market_id_traditional,
        (CURRENT_DATE + INTERVAL '3 days')::timestamp
    );

    -- =============================================================================
    -- ORDER 2: Confirmed Order (Multiple Items) - Tests vendor confirmation
    -- =============================================================================
    INSERT INTO orders (id, order_number, buyer_user_id, status, total_amount_cents, created_at, updated_at)
    VALUES (
        v_order_id_2,
        'ORD-' || SUBSTR(v_order_id_2::text, 1, 8),
        v_buyer_user_id,
        'confirmed',
        3500,  -- $35.00
        NOW() - INTERVAL '2 hours',
        NOW() - INTERVAL '1 hour'
    );

    INSERT INTO order_items (order_id, listing_id, vendor_profile_id, quantity, unit_price_cents, subtotal_cents, status, market_id, pickup_date)
    VALUES
    (
        v_order_id_2,
        v_listing_id_1,
        v_vendor_profile_id_1,
        3,
        800,   -- $8.00 each
        2400,  -- $24.00 subtotal
        'confirmed',
        v_market_id_traditional,
        (CURRENT_DATE + INTERVAL '2 days')::timestamp
    ),
    (
        v_order_id_2,
        v_listing_id_2,
        v_vendor_profile_id_1,
        2,
        550,   -- $5.50 each
        1100,  -- $11.00 subtotal
        'confirmed',
        v_market_id_traditional,
        (CURRENT_DATE + INTERVAL '2 days')::timestamp
    );

    -- =============================================================================
    -- ORDER 3: Ready for Pickup - Tests ready state
    -- =============================================================================
    INSERT INTO orders (id, order_number, buyer_user_id, status, total_amount_cents, created_at, updated_at)
    VALUES (
        v_order_id_3,
        'ORD-' || SUBSTR(v_order_id_3::text, 1, 8),
        v_buyer_user_id,
        'ready',
        1850,  -- $18.50
        NOW() - INTERVAL '1 day',
        NOW() - INTERVAL '2 hours'
    );

    INSERT INTO order_items (order_id, listing_id, vendor_profile_id, quantity, unit_price_cents, subtotal_cents, status, market_id, pickup_date)
    VALUES (
        v_order_id_3,
        v_listing_id_2,
        v_vendor_profile_id_1,
        1,
        1850,
        1850,
        'ready',
        v_market_id_traditional,
        CURRENT_DATE::timestamp
    );

    -- =============================================================================
    -- ORDER 4: Fulfilled Order - Tests completion
    -- =============================================================================
    INSERT INTO orders (id, order_number, buyer_user_id, status, total_amount_cents, created_at, updated_at)
    VALUES (
        v_order_id_4,
        'ORD-' || SUBSTR(v_order_id_4::text, 1, 8),
        v_buyer_user_id,
        'fulfilled',
        4200,  -- $42.00
        NOW() - INTERVAL '5 days',
        NOW() - INTERVAL '4 days'
    );

    INSERT INTO order_items (order_id, listing_id, vendor_profile_id, quantity, unit_price_cents, subtotal_cents, status, market_id, pickup_date)
    VALUES (
        v_order_id_4,
        v_listing_id_1,
        v_vendor_profile_id_1,
        4,
        1050,
        4200,
        'fulfilled',
        v_market_id_traditional,
        (NOW() - INTERVAL '4 days')::timestamp
    );

    -- =============================================================================
    -- ORDER 5: Cancelled Order - Tests cancellation
    -- =============================================================================
    INSERT INTO orders (id, order_number, buyer_user_id, status, total_amount_cents, created_at, updated_at)
    VALUES (
        v_order_id_5,
        'ORD-' || SUBSTR(v_order_id_5::text, 1, 8),
        v_buyer_user_id,
        'cancelled',
        750,  -- $7.50
        NOW() - INTERVAL '3 days',
        NOW() - INTERVAL '3 days'
    );

    INSERT INTO order_items (order_id, listing_id, vendor_profile_id, quantity, unit_price_cents, subtotal_cents, status, market_id, pickup_date)
    VALUES (
        v_order_id_5,
        v_listing_id_2,
        v_vendor_profile_id_1,
        1,
        750,
        750,
        'cancelled',
        v_market_id_traditional,
        NULL
    );

    -- =============================================================================
    -- ORDER 6: Mixed Status Items (Multi-vendor scenario)
    -- Tests per-item status management
    -- =============================================================================
    INSERT INTO orders (id, order_number, buyer_user_id, status, total_amount_cents, created_at, updated_at)
    VALUES (
        v_order_id_6,
        'ORD-' || SUBSTR(v_order_id_6::text, 1, 8),
        v_buyer_user_id,
        'confirmed',  -- Order level status
        5500,  -- $55.00
        NOW() - INTERVAL '6 hours',
        NOW() - INTERVAL '3 hours'
    );

    -- Item 1: Confirmed
    INSERT INTO order_items (order_id, listing_id, vendor_profile_id, quantity, unit_price_cents, subtotal_cents, status, market_id, pickup_date)
    VALUES (
        v_order_id_6,
        v_listing_id_1,
        v_vendor_profile_id_1,
        2,
        1500,
        3000,
        'confirmed',
        v_market_id_traditional,
        (CURRENT_DATE + INTERVAL '1 day')::timestamp
    );

    -- Item 2: Ready (vendor has prepared this item already)
    INSERT INTO order_items (order_id, listing_id, vendor_profile_id, quantity, unit_price_cents, subtotal_cents, status, market_id, pickup_date)
    VALUES (
        v_order_id_6,
        v_listing_id_2,
        v_vendor_profile_id_1,
        5,
        500,
        2500,
        'ready',
        v_market_id_traditional,
        (CURRENT_DATE + INTERVAL '1 day')::timestamp
    );

    RAISE NOTICE 'Test data created successfully!';
    RAISE NOTICE 'Order 1 (Pending): %', v_order_id_1;
    RAISE NOTICE 'Order 2 (Confirmed, multi-item): %', v_order_id_2;
    RAISE NOTICE 'Order 3 (Ready): %', v_order_id_3;
    RAISE NOTICE 'Order 4 (Fulfilled): %', v_order_id_4;
    RAISE NOTICE 'Order 5 (Cancelled): %', v_order_id_5;
    RAISE NOTICE 'Order 6 (Mixed status items): %', v_order_id_6;

END $$;

-- =============================================================================
-- VERIFICATION QUERIES
-- Run these after inserting to verify the data
-- =============================================================================

-- Check all orders
SELECT
    id,
    order_number,
    status,
    total_amount_cents / 100.0 as total_dollars,
    created_at
FROM orders
ORDER BY created_at DESC
LIMIT 10;

-- Check order items grouped by order
SELECT
    o.order_number,
    o.status as order_status,
    oi.status as item_status,
    l.title as item,
    oi.quantity,
    oi.subtotal_cents / 100.0 as subtotal,
    m.name as market
FROM orders o
JOIN order_items oi ON o.id = oi.order_id
JOIN listings l ON oi.listing_id = l.id
LEFT JOIN markets m ON oi.market_id = m.id
ORDER BY o.created_at DESC, oi.id;

-- Count orders by status
SELECT status, COUNT(*) as count
FROM orders
GROUP BY status
ORDER BY count DESC;

-- Count items by status
SELECT status, COUNT(*) as count
FROM order_items
GROUP BY status
ORDER BY count DESC;
