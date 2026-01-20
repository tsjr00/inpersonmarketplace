-- ============================================================================
-- Test Order Data Seed Script
-- Purpose: Create realistic test orders for development/staging
-- Usage: Run against Supabase database (dev or staging)
-- ============================================================================

-- Configuration: Adjust these to match your test environment
-- You may need to update these IDs to match your existing test data

DO $$
DECLARE
  v_vertical TEXT := 'fireworks'; -- Adjust to your test vertical
  v_buyer_user_id UUID;
  v_vendor_profile_id UUID;
  v_listing_id UUID;
  v_market_id UUID;
  v_order_id UUID;
  v_order_number TEXT;
  v_order_count INT := 0;
  v_base_order_num INT;
  v_buyer_email TEXT;
  v_listing_record RECORD;
  v_price_cents INT;
BEGIN
  RAISE NOTICE 'Starting test order seed script...';

  -- ========================================================================
  -- STEP 1: Get or create a test buyer
  -- ========================================================================

  -- Try to find an existing test buyer
  SELECT id INTO v_buyer_user_id
  FROM auth.users
  WHERE email LIKE '%+testbuyer%' OR email = 'testbuyer@example.com'
  LIMIT 1;

  IF v_buyer_user_id IS NULL THEN
    -- Find any user who is not a vendor (has no vendor_profile)
    SELECT u.id INTO v_buyer_user_id
    FROM auth.users u
    LEFT JOIN vendor_profiles vp ON vp.user_id = u.id
    WHERE vp.id IS NULL
    LIMIT 1;
  END IF;

  IF v_buyer_user_id IS NULL THEN
    -- Use the first user available
    SELECT id INTO v_buyer_user_id
    FROM auth.users
    LIMIT 1;
  END IF;

  IF v_buyer_user_id IS NULL THEN
    RAISE EXCEPTION 'No users found in the database. Please create at least one user first.';
  END IF;

  SELECT email INTO v_buyer_email FROM auth.users WHERE id = v_buyer_user_id;
  RAISE NOTICE 'Using buyer: % (%)', v_buyer_user_id, v_buyer_email;

  -- ========================================================================
  -- STEP 2: Get base order number
  -- ========================================================================

  SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM '[0-9]+$') AS INT)), 0) + 1
  INTO v_base_order_num
  FROM orders
  WHERE vertical_id = v_vertical;

  RAISE NOTICE 'Starting order number at: %', v_base_order_num;

  -- ========================================================================
  -- STEP 3: Create orders from available listings
  -- ========================================================================

  -- Loop through published listings and create orders
  FOR v_listing_record IN
    SELECT
      l.id AS listing_id,
      l.title,
      l.price_cents,
      l.vendor_profile_id,
      vp.business_name,
      lm.market_id
    FROM listings l
    JOIN vendor_profiles vp ON l.vendor_profile_id = vp.id
    LEFT JOIN listing_markets lm ON l.id = lm.listing_id
    WHERE l.vertical_id = v_vertical
      AND l.published = true
      AND l.deleted_at IS NULL
      AND l.price_cents > 0
    ORDER BY RANDOM()
    LIMIT 10
  LOOP
    -- Generate order number
    v_order_number := UPPER(LEFT(v_vertical, 2)) || '-' ||
                      TO_CHAR(NOW(), 'YYYY') || '-' ||
                      LPAD((v_base_order_num + v_order_count)::TEXT, 5, '0');

    v_price_cents := v_listing_record.price_cents;

    -- ====================================================================
    -- Order Type 1: PENDING (not yet paid)
    -- ====================================================================
    IF v_order_count = 0 THEN
      INSERT INTO orders (
        id, buyer_user_id, vertical_id, order_number, status,
        subtotal_cents, platform_fee_cents, total_cents
      ) VALUES (
        uuid_generate_v4(),
        v_buyer_user_id,
        v_vertical,
        v_order_number,
        'pending',
        v_price_cents,
        ROUND(v_price_cents * 0.065),
        ROUND(v_price_cents * 1.065)
      )
      RETURNING id INTO v_order_id;

      INSERT INTO order_items (
        order_id, listing_id, vendor_profile_id, quantity,
        unit_price_cents, subtotal_cents, platform_fee_cents,
        vendor_payout_cents, status, market_id
      ) VALUES (
        v_order_id,
        v_listing_record.listing_id,
        v_listing_record.vendor_profile_id,
        1,
        v_price_cents,
        v_price_cents,
        ROUND(v_price_cents * 0.065),
        ROUND(v_price_cents * 0.935),
        'pending',
        v_listing_record.market_id
      );

      RAISE NOTICE 'Created PENDING order: % for "%"', v_order_number, v_listing_record.title;

    -- ====================================================================
    -- Order Type 2: PAID (payment received, awaiting confirmation)
    -- ====================================================================
    ELSIF v_order_count = 1 THEN
      INSERT INTO orders (
        id, buyer_user_id, vertical_id, order_number, status,
        subtotal_cents, platform_fee_cents, total_cents,
        stripe_checkout_session_id
      ) VALUES (
        uuid_generate_v4(),
        v_buyer_user_id,
        v_vertical,
        v_order_number,
        'paid',
        v_price_cents,
        ROUND(v_price_cents * 0.065),
        ROUND(v_price_cents * 1.065),
        'cs_test_' || encode(gen_random_bytes(16), 'hex')
      )
      RETURNING id INTO v_order_id;

      INSERT INTO order_items (
        order_id, listing_id, vendor_profile_id, quantity,
        unit_price_cents, subtotal_cents, platform_fee_cents,
        vendor_payout_cents, status, market_id
      ) VALUES (
        v_order_id,
        v_listing_record.listing_id,
        v_listing_record.vendor_profile_id,
        2,
        v_price_cents,
        v_price_cents * 2,
        ROUND(v_price_cents * 2 * 0.065),
        ROUND(v_price_cents * 2 * 0.935),
        'pending',
        v_listing_record.market_id
      );

      -- Add payment record
      INSERT INTO payments (
        order_id, stripe_payment_intent_id, amount_cents,
        platform_fee_cents, status, paid_at
      ) VALUES (
        v_order_id,
        'pi_test_' || encode(gen_random_bytes(16), 'hex'),
        ROUND(v_price_cents * 2 * 1.065),
        ROUND(v_price_cents * 2 * 0.065),
        'succeeded',
        NOW() - INTERVAL '1 day'
      );

      RAISE NOTICE 'Created PAID order: % for "%"', v_order_number, v_listing_record.title;

    -- ====================================================================
    -- Order Type 3: CONFIRMED (vendor confirmed, preparing)
    -- ====================================================================
    ELSIF v_order_count = 2 THEN
      INSERT INTO orders (
        id, buyer_user_id, vertical_id, order_number, status,
        subtotal_cents, platform_fee_cents, total_cents,
        stripe_checkout_session_id
      ) VALUES (
        uuid_generate_v4(),
        v_buyer_user_id,
        v_vertical,
        v_order_number,
        'confirmed',
        v_price_cents,
        ROUND(v_price_cents * 0.065),
        ROUND(v_price_cents * 1.065),
        'cs_test_' || encode(gen_random_bytes(16), 'hex')
      )
      RETURNING id INTO v_order_id;

      INSERT INTO order_items (
        order_id, listing_id, vendor_profile_id, quantity,
        unit_price_cents, subtotal_cents, platform_fee_cents,
        vendor_payout_cents, status, market_id
      ) VALUES (
        v_order_id,
        v_listing_record.listing_id,
        v_listing_record.vendor_profile_id,
        1,
        v_price_cents,
        v_price_cents,
        ROUND(v_price_cents * 0.065),
        ROUND(v_price_cents * 0.935),
        'confirmed',
        v_listing_record.market_id
      );

      INSERT INTO payments (
        order_id, stripe_payment_intent_id, amount_cents,
        platform_fee_cents, status, paid_at
      ) VALUES (
        v_order_id,
        'pi_test_' || encode(gen_random_bytes(16), 'hex'),
        ROUND(v_price_cents * 1.065),
        ROUND(v_price_cents * 0.065),
        'succeeded',
        NOW() - INTERVAL '2 days'
      );

      RAISE NOTICE 'Created CONFIRMED order: % for "%"', v_order_number, v_listing_record.title;

    -- ====================================================================
    -- Order Type 4: READY (ready for pickup)
    -- ====================================================================
    ELSIF v_order_count = 3 THEN
      INSERT INTO orders (
        id, buyer_user_id, vertical_id, order_number, status,
        subtotal_cents, platform_fee_cents, total_cents,
        stripe_checkout_session_id
      ) VALUES (
        uuid_generate_v4(),
        v_buyer_user_id,
        v_vertical,
        v_order_number,
        'ready',
        v_price_cents,
        ROUND(v_price_cents * 0.065),
        ROUND(v_price_cents * 1.065),
        'cs_test_' || encode(gen_random_bytes(16), 'hex')
      )
      RETURNING id INTO v_order_id;

      INSERT INTO order_items (
        order_id, listing_id, vendor_profile_id, quantity,
        unit_price_cents, subtotal_cents, platform_fee_cents,
        vendor_payout_cents, status, market_id
      ) VALUES (
        v_order_id,
        v_listing_record.listing_id,
        v_listing_record.vendor_profile_id,
        1,
        v_price_cents,
        v_price_cents,
        ROUND(v_price_cents * 0.065),
        ROUND(v_price_cents * 0.935),
        'ready',
        v_listing_record.market_id
      );

      INSERT INTO payments (
        order_id, stripe_payment_intent_id, amount_cents,
        platform_fee_cents, status, paid_at
      ) VALUES (
        v_order_id,
        'pi_test_' || encode(gen_random_bytes(16), 'hex'),
        ROUND(v_price_cents * 1.065),
        ROUND(v_price_cents * 0.065),
        'succeeded',
        NOW() - INTERVAL '3 days'
      );

      RAISE NOTICE 'Created READY order: % for "%"', v_order_number, v_listing_record.title;

    -- ====================================================================
    -- Order Type 5: COMPLETED (picked up successfully)
    -- ====================================================================
    ELSIF v_order_count = 4 THEN
      INSERT INTO orders (
        id, buyer_user_id, vertical_id, order_number, status,
        subtotal_cents, platform_fee_cents, total_cents,
        stripe_checkout_session_id
      ) VALUES (
        uuid_generate_v4(),
        v_buyer_user_id,
        v_vertical,
        v_order_number,
        'completed',
        v_price_cents,
        ROUND(v_price_cents * 0.065),
        ROUND(v_price_cents * 1.065),
        'cs_test_' || encode(gen_random_bytes(16), 'hex')
      )
      RETURNING id INTO v_order_id;

      INSERT INTO order_items (
        order_id, listing_id, vendor_profile_id, quantity,
        unit_price_cents, subtotal_cents, platform_fee_cents,
        vendor_payout_cents, status, market_id,
        pickup_confirmed_at
      ) VALUES (
        v_order_id,
        v_listing_record.listing_id,
        v_listing_record.vendor_profile_id,
        1,
        v_price_cents,
        v_price_cents,
        ROUND(v_price_cents * 0.065),
        ROUND(v_price_cents * 0.935),
        'fulfilled',
        v_listing_record.market_id,
        NOW() - INTERVAL '1 day'
      );

      INSERT INTO payments (
        order_id, stripe_payment_intent_id, amount_cents,
        platform_fee_cents, status, paid_at
      ) VALUES (
        v_order_id,
        'pi_test_' || encode(gen_random_bytes(16), 'hex'),
        ROUND(v_price_cents * 1.065),
        ROUND(v_price_cents * 0.065),
        'succeeded',
        NOW() - INTERVAL '5 days'
      );

      RAISE NOTICE 'Created COMPLETED order: % for "%"', v_order_number, v_listing_record.title;

    -- ====================================================================
    -- Order Type 6: CANCELLED (buyer cancelled before payment)
    -- ====================================================================
    ELSIF v_order_count = 5 THEN
      INSERT INTO orders (
        id, buyer_user_id, vertical_id, order_number, status,
        subtotal_cents, platform_fee_cents, total_cents
      ) VALUES (
        uuid_generate_v4(),
        v_buyer_user_id,
        v_vertical,
        v_order_number,
        'cancelled',
        v_price_cents,
        ROUND(v_price_cents * 0.065),
        ROUND(v_price_cents * 1.065)
      )
      RETURNING id INTO v_order_id;

      INSERT INTO order_items (
        order_id, listing_id, vendor_profile_id, quantity,
        unit_price_cents, subtotal_cents, platform_fee_cents,
        vendor_payout_cents, status, market_id
      ) VALUES (
        v_order_id,
        v_listing_record.listing_id,
        v_listing_record.vendor_profile_id,
        1,
        v_price_cents,
        v_price_cents,
        ROUND(v_price_cents * 0.065),
        ROUND(v_price_cents * 0.935),
        'cancelled',
        v_listing_record.market_id
      );

      RAISE NOTICE 'Created CANCELLED order: % for "%"', v_order_number, v_listing_record.title;

    -- ====================================================================
    -- Order Type 7: REFUNDED
    -- ====================================================================
    ELSIF v_order_count = 6 THEN
      INSERT INTO orders (
        id, buyer_user_id, vertical_id, order_number, status,
        subtotal_cents, platform_fee_cents, total_cents,
        stripe_checkout_session_id
      ) VALUES (
        uuid_generate_v4(),
        v_buyer_user_id,
        v_vertical,
        v_order_number,
        'refunded',
        v_price_cents,
        ROUND(v_price_cents * 0.065),
        ROUND(v_price_cents * 1.065),
        'cs_test_' || encode(gen_random_bytes(16), 'hex')
      )
      RETURNING id INTO v_order_id;

      INSERT INTO order_items (
        order_id, listing_id, vendor_profile_id, quantity,
        unit_price_cents, subtotal_cents, platform_fee_cents,
        vendor_payout_cents, status, market_id
      ) VALUES (
        v_order_id,
        v_listing_record.listing_id,
        v_listing_record.vendor_profile_id,
        1,
        v_price_cents,
        v_price_cents,
        ROUND(v_price_cents * 0.065),
        ROUND(v_price_cents * 0.935),
        'refunded',
        v_listing_record.market_id
      );

      INSERT INTO payments (
        order_id, stripe_payment_intent_id, amount_cents,
        platform_fee_cents, status, paid_at, refunded_at, refund_amount_cents
      ) VALUES (
        v_order_id,
        'pi_test_' || encode(gen_random_bytes(16), 'hex'),
        ROUND(v_price_cents * 1.065),
        ROUND(v_price_cents * 0.065),
        'refunded',
        NOW() - INTERVAL '7 days',
        NOW() - INTERVAL '5 days',
        ROUND(v_price_cents * 1.065)
      );

      RAISE NOTICE 'Created REFUNDED order: % for "%"', v_order_number, v_listing_record.title;

    -- ====================================================================
    -- Order Type 8+: More PAID orders for testing
    -- ====================================================================
    ELSE
      INSERT INTO orders (
        id, buyer_user_id, vertical_id, order_number, status,
        subtotal_cents, platform_fee_cents, total_cents,
        stripe_checkout_session_id
      ) VALUES (
        uuid_generate_v4(),
        v_buyer_user_id,
        v_vertical,
        v_order_number,
        'paid',
        v_price_cents,
        ROUND(v_price_cents * 0.065),
        ROUND(v_price_cents * 1.065),
        'cs_test_' || encode(gen_random_bytes(16), 'hex')
      )
      RETURNING id INTO v_order_id;

      INSERT INTO order_items (
        order_id, listing_id, vendor_profile_id, quantity,
        unit_price_cents, subtotal_cents, platform_fee_cents,
        vendor_payout_cents, status, market_id
      ) VALUES (
        v_order_id,
        v_listing_record.listing_id,
        v_listing_record.vendor_profile_id,
        1,
        v_price_cents,
        v_price_cents,
        ROUND(v_price_cents * 0.065),
        ROUND(v_price_cents * 0.935),
        'pending',
        v_listing_record.market_id
      );

      INSERT INTO payments (
        order_id, stripe_payment_intent_id, amount_cents,
        platform_fee_cents, status, paid_at
      ) VALUES (
        v_order_id,
        'pi_test_' || encode(gen_random_bytes(16), 'hex'),
        ROUND(v_price_cents * 1.065),
        ROUND(v_price_cents * 0.065),
        'succeeded',
        NOW() - INTERVAL '1 hour'
      );

      RAISE NOTICE 'Created additional PAID order: % for "%"', v_order_number, v_listing_record.title;
    END IF;

    v_order_count := v_order_count + 1;
  END LOOP;

  -- ========================================================================
  -- Summary
  -- ========================================================================

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Test Order Seed Complete!';
  RAISE NOTICE 'Created % orders for buyer %', v_order_count, v_buyer_email;
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Order statuses created:';
  RAISE NOTICE '  - 1x pending (unpaid cart)';
  RAISE NOTICE '  - 1x paid (awaiting vendor confirmation)';
  RAISE NOTICE '  - 1x confirmed (vendor confirmed)';
  RAISE NOTICE '  - 1x ready (ready for pickup)';
  RAISE NOTICE '  - 1x completed (picked up)';
  RAISE NOTICE '  - 1x cancelled (buyer cancelled)';
  RAISE NOTICE '  - 1x refunded';
  RAISE NOTICE '  - %x additional paid orders', GREATEST(0, v_order_count - 7);
  RAISE NOTICE '';

  IF v_order_count = 0 THEN
    RAISE NOTICE 'WARNING: No orders were created. This usually means:';
    RAISE NOTICE '  1. No published listings exist in the database';
    RAISE NOTICE '  2. All listings have price_cents = 0';
    RAISE NOTICE 'Please create some test listings first.';
  END IF;

END $$;

-- ============================================================================
-- Verify the data
-- ============================================================================

SELECT
  o.order_number,
  o.status AS order_status,
  o.total_cents / 100.0 AS total_dollars,
  oi.status AS item_status,
  l.title AS listing_title,
  m.name AS market_name,
  u.email AS buyer_email
FROM orders o
JOIN order_items oi ON o.id = oi.order_id
JOIN listings l ON oi.listing_id = l.id
LEFT JOIN markets m ON oi.market_id = m.id
JOIN auth.users u ON o.buyer_user_id = u.id
WHERE o.created_at > NOW() - INTERVAL '1 hour'
ORDER BY o.created_at DESC;
