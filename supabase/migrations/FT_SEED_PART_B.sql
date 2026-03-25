-- ============================================================================
-- FOOD TRUCK SEED DATA — PART B: Listings, Market Links, Attendance
-- Run on: Staging Supabase (vfknvs...) ONLY
-- Run this AFTER Part A succeeds
-- ============================================================================

-- SAFETY CHECK: Verify vendor profiles exist before inserting listings
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM vendor_profiles
  WHERE id IN (
    '64e94218-5a9e-4fb4-a15b-9e1b65bd7597',
    '48c865c8-07d5-46f9-92aa-de5991fb1918',
    '802ad912-a8ea-459a-bd9a-f60c75c3c6d4'
  );
  IF v_count != 3 THEN
    RAISE EXCEPTION 'Expected 3 vendor profiles but found %. Run Part A first!', v_count;
  END IF;
  RAISE NOTICE 'All 3 vendor profiles confirmed. Proceeding with listings...';
END $$;


-- STEP 5: Create listings (disable tier trigger for bulk insert)
ALTER TABLE listings DISABLE TRIGGER enforce_listing_limit_trigger;

-- TRUCK 1: Fuego Street Tacos (7 items)
INSERT INTO listings (id, vendor_profile_id, vertical_id, status, title, description, price_cents, quantity, category, listing_type, quantity_amount, quantity_unit, listing_data)
VALUES
  ('f4000000-0101-4000-8000-000000000001', '64e94218-5a9e-4fb4-a15b-9e1b65bd7597', 'food_trucks', 'published',
   'Street Taco Trio', 'Three corn tortilla tacos with your choice of carne asada, al pastor, or carnitas. Topped with fresh cilantro, diced onion, and house-made salsa verde.',
   850, 50, 'Mexican / Latin', 'presale', 3, 'tacos',
   jsonb_build_object('contains_allergens', false)),
  ('f4000000-0102-4000-8000-000000000002', '64e94218-5a9e-4fb4-a15b-9e1b65bd7597', 'food_trucks', 'published',
   'Birria Tacos', 'Three crispy birria tacos dipped in consome-infused oil and griddled with melted Oaxaca cheese. Served with a cup of rich birria consome for dipping.',
   1200, 30, 'Mexican / Latin', 'presale', 3, 'tacos',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Wheat (tortilla), dairy (cheese)')),
  ('f4000000-0103-4000-8000-000000000003', '64e94218-5a9e-4fb4-a15b-9e1b65bd7597', 'food_trucks', 'published',
   'Loaded Nachos', 'House-fried tortilla chips piled with seasoned ground beef, queso, pico de gallo, jalapenos, sour cream, and guacamole.',
   1100, 40, 'Mexican / Latin', 'presale', 1, 'plate',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Dairy (cheese, sour cream), wheat (chips)')),
  ('f4000000-0104-4000-8000-000000000004', '64e94218-5a9e-4fb4-a15b-9e1b65bd7597', 'food_trucks', 'published',
   'Elote Cup', 'Roasted street corn cut off the cob, tossed with mayo, cotija cheese, chili-lime seasoning, and a squeeze of fresh lime.',
   600, 60, 'Mexican / Latin', 'presale', 1, 'cup',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Dairy (cheese, mayo), eggs (mayo)')),
  ('f4000000-0105-4000-8000-000000000005', '64e94218-5a9e-4fb4-a15b-9e1b65bd7597', 'food_trucks', 'published',
   'Burrito Supreme', 'Flour tortilla stuffed with your choice of protein, Mexican rice, black beans, cheese, lettuce, pico, sour cream, and guacamole. Rolled tight and wrapped in foil.',
   1300, 35, 'Mexican / Latin', 'presale', 1, 'burrito',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Wheat (tortilla), dairy (cheese, sour cream)')),
  ('f4000000-0106-4000-8000-000000000006', '64e94218-5a9e-4fb4-a15b-9e1b65bd7597', 'food_trucks', 'published',
   'Churro Bites', 'Warm cinnamon-sugar churro bites with your choice of chocolate, caramel, or strawberry dipping sauce.',
   500, 45, 'Mexican / Latin', 'presale', 6, 'pieces',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Wheat (flour), dairy (butter), eggs')),
  ('f4000000-0107-4000-8000-000000000007', '64e94218-5a9e-4fb4-a15b-9e1b65bd7597', 'food_trucks', 'published',
   'Horchata', 'House-made horchata with rice milk, cinnamon, and vanilla. Served over ice in a 16oz cup.',
   400, 70, 'Mexican / Latin', 'presale', 16, 'oz',
   jsonb_build_object('contains_allergens', false))
ON CONFLICT (id) DO NOTHING;

-- TRUCK 2: Smokestack BBQ (6 items)
INSERT INTO listings (id, vendor_profile_id, vertical_id, status, title, description, price_cents, quantity, category, listing_type, quantity_amount, quantity_unit, listing_data)
VALUES
  ('f4000000-0201-4000-8000-000000000001', '48c865c8-07d5-46f9-92aa-de5991fb1918', 'food_trucks', 'published',
   'Brisket Plate', 'Half pound of 14-hour post oak smoked brisket, sliced to order. Served with two sides and a slice of white bread. Moist or lean, your call.',
   1800, 25, 'BBQ & Smoked', 'presale', 0.5, 'lb',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Wheat (bread)')),
  ('f4000000-0202-4000-8000-000000000002', '48c865c8-07d5-46f9-92aa-de5991fb1918', 'food_trucks', 'published',
   'Pulled Pork Sandwich', 'Slow-smoked pulled pork shoulder piled on a toasted brioche bun with tangy house slaw and our signature vinegar-mustard sauce.',
   1200, 35, 'BBQ & Smoked', 'presale', 1, 'sandwich',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Wheat (bun), eggs (bun), dairy (butter)')),
  ('f4000000-0203-4000-8000-000000000003', '48c865c8-07d5-46f9-92aa-de5991fb1918', 'food_trucks', 'published',
   'Smoked Rib Basket', 'Four bone-in pork ribs with a dry rub and a light glaze of our house BBQ sauce. Comes with one side and pickles.',
   1600, 20, 'BBQ & Smoked', 'presale', 4, 'ribs',
   jsonb_build_object('contains_allergens', false)),
  ('f4000000-0204-4000-8000-000000000004', '48c865c8-07d5-46f9-92aa-de5991fb1918', 'food_trucks', 'published',
   'Loaded Baked Potato', 'Giant baked potato stuffed with your choice of brisket or pulled pork, queso, butter, sour cream, and chives.',
   1100, 30, 'BBQ & Smoked', 'presale', 1, 'potato',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Dairy (queso, butter, sour cream)')),
  ('f4000000-0205-4000-8000-000000000005', '48c865c8-07d5-46f9-92aa-de5991fb1918', 'food_trucks', 'published',
   'Mac and Cheese', 'Creamy smoked gouda and cheddar mac, baked with a panko crust. Add brisket or pulled pork for $3 more.',
   700, 40, 'BBQ & Smoked', 'presale', 1, 'bowl',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Wheat (pasta, panko), dairy (cheese, cream), eggs')),
  ('f4000000-0206-4000-8000-000000000006', '48c865c8-07d5-46f9-92aa-de5991fb1918', 'food_trucks', 'published',
   'Sweet Tea', 'Fresh-brewed black tea sweetened with real cane sugar. The way it should be. 20oz.',
   350, 80, 'BBQ & Smoked', 'presale', 20, 'oz',
   jsonb_build_object('contains_allergens', false))
ON CONFLICT (id) DO NOTHING;

-- TRUCK 3: Bao Down (7 items)
INSERT INTO listings (id, vendor_profile_id, vertical_id, status, title, description, price_cents, quantity, category, listing_type, quantity_amount, quantity_unit, listing_data)
VALUES
  ('f4000000-0301-4000-8000-000000000001', '802ad912-a8ea-459a-bd9a-f60c75c3c6d4', 'food_trucks', 'published',
   'Pork Belly Bao Buns', 'Two fluffy steamed bao buns filled with braised pork belly, pickled daikon and carrot, fresh cilantro, and hoisin-sriracha glaze.',
   1100, 40, 'Asian', 'presale', 2, 'buns',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Wheat (bao dough), soy (hoisin, soy sauce)')),
  ('f4000000-0302-4000-8000-000000000002', '802ad912-a8ea-459a-bd9a-f60c75c3c6d4', 'food_trucks', 'published',
   'Crispy Chicken Bao Buns', 'Two steamed bao buns with panko-crusted chicken thigh, spicy mayo, shredded cabbage, and quick-pickled cucumber.',
   1100, 40, 'Asian', 'presale', 2, 'buns',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Wheat (bao dough, panko), eggs (mayo, panko), soy')),
  ('f4000000-0303-4000-8000-000000000003', '802ad912-a8ea-459a-bd9a-f60c75c3c6d4', 'food_trucks', 'published',
   'Korean BBQ Rice Bowl', 'Crispy jasmine rice topped with bulgogi beef, a fried egg, kimchi, sesame cucumbers, and gochujang drizzle.',
   1300, 30, 'Fusion', 'presale', 1, 'bowl',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Soy (bulgogi marinade, gochujang), eggs, sesame')),
  ('f4000000-0304-4000-8000-000000000004', '802ad912-a8ea-459a-bd9a-f60c75c3c6d4', 'food_trucks', 'published',
   'Dumpling Basket', 'Six pan-fried pork and chive dumplings with crispy bottoms. Served with house-made chili oil and black vinegar dipping sauce.',
   900, 35, 'Asian', 'presale', 6, 'dumplings',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Wheat (wrapper), soy (dipping sauce)')),
  ('f4000000-0305-4000-8000-000000000005', '802ad912-a8ea-459a-bd9a-f60c75c3c6d4', 'food_trucks', 'published',
   'Spicy Garlic Noodles', 'Wok-tossed egg noodles with garlic, chili flake, scallions, and a splash of soy-butter sauce. Add chicken or tofu.',
   1000, 30, 'Asian', 'presale', 1, 'bowl',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Wheat (noodles), soy, dairy (butter), eggs (noodles)')),
  ('f4000000-0306-4000-8000-000000000006', '802ad912-a8ea-459a-bd9a-f60c75c3c6d4', 'food_trucks', 'published',
   'Edamame', 'Steamed edamame tossed with sea salt and a squeeze of lime. Simple and addictive.',
   450, 50, 'Asian', 'presale', 1, 'bowl',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Soy (edamame)')),
  ('f4000000-0307-4000-8000-000000000007', '802ad912-a8ea-459a-bd9a-f60c75c3c6d4', 'food_trucks', 'published',
   'Thai Iced Tea', 'Strong brewed Thai tea with sweetened condensed milk poured over ice. Rich, creamy, and bright orange.',
   500, 60, 'Asian', 'presale', 16, 'oz',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Dairy (condensed milk)'))
ON CONFLICT (id) DO NOTHING;

ALTER TABLE listings ENABLE TRIGGER enforce_listing_limit_trigger;


-- STEP 6: Link listings to markets
-- Truck 1 (Fuego): Sixth Street + Canyon
INSERT INTO listing_markets (listing_id, market_id)
SELECT l.id, m.id
FROM listings l CROSS JOIN markets m
WHERE l.vendor_profile_id = '64e94218-5a9e-4fb4-a15b-9e1b65bd7597'
  AND l.deleted_at IS NULL
  AND m.id IN ('f1000000-0001-4000-8000-000000000001', 'f1000000-0002-4000-8000-000000000002')
ON CONFLICT (listing_id, market_id) DO NOTHING;

-- Truck 2 (Smokestack): Sixth Street + Hub City
INSERT INTO listing_markets (listing_id, market_id)
SELECT l.id, m.id
FROM listings l CROSS JOIN markets m
WHERE l.vendor_profile_id = '48c865c8-07d5-46f9-92aa-de5991fb1918'
  AND l.deleted_at IS NULL
  AND m.id IN ('f1000000-0001-4000-8000-000000000001', 'f1000000-0003-4000-8000-000000000003')
ON CONFLICT (listing_id, market_id) DO NOTHING;

-- Truck 3 (Bao Down): All 3 parks
INSERT INTO listing_markets (listing_id, market_id)
SELECT l.id, m.id
FROM listings l CROSS JOIN markets m
WHERE l.vendor_profile_id = '802ad912-a8ea-459a-bd9a-f60c75c3c6d4'
  AND l.deleted_at IS NULL
  AND m.id IN ('f1000000-0001-4000-8000-000000000001', 'f1000000-0002-4000-8000-000000000002', 'f1000000-0003-4000-8000-000000000003')
ON CONFLICT (listing_id, market_id) DO NOTHING;


-- STEP 7: Vendor attendance schedules (with vendor-specific hours)
-- Truck 1 (Fuego): Sixth Street Fri + Sat, Canyon Sat
INSERT INTO vendor_market_schedules (vendor_profile_id, market_id, schedule_id, is_active, vendor_start_time, vendor_end_time)
VALUES
  ('64e94218-5a9e-4fb4-a15b-9e1b65bd7597', 'f1000000-0001-4000-8000-000000000001', 'f2000000-0001-4000-8000-000000000001', true, '17:00:00', '21:30:00'),
  ('64e94218-5a9e-4fb4-a15b-9e1b65bd7597', 'f1000000-0001-4000-8000-000000000001', 'f2000000-0002-4000-8000-000000000002', true, '11:00:00', '20:00:00'),
  ('64e94218-5a9e-4fb4-a15b-9e1b65bd7597', 'f1000000-0002-4000-8000-000000000002', 'f2000000-0003-4000-8000-000000000003', true, '11:00:00', '15:00:00')
ON CONFLICT (vendor_profile_id, schedule_id) DO NOTHING;

-- Truck 2 (Smokestack): Sixth Street Sat, Hub City Thu + Sat
INSERT INTO vendor_market_schedules (vendor_profile_id, market_id, schedule_id, is_active, vendor_start_time, vendor_end_time)
VALUES
  ('48c865c8-07d5-46f9-92aa-de5991fb1918', 'f1000000-0001-4000-8000-000000000001', 'f2000000-0002-4000-8000-000000000002', true, '11:00:00', '21:00:00'),
  ('48c865c8-07d5-46f9-92aa-de5991fb1918', 'f1000000-0003-4000-8000-000000000003', 'f2000000-0004-4000-8000-000000000004', true, '17:00:00', '20:30:00'),
  ('48c865c8-07d5-46f9-92aa-de5991fb1918', 'f1000000-0003-4000-8000-000000000003', 'f2000000-0005-4000-8000-000000000005', true, '11:00:00', '19:00:00')
ON CONFLICT (vendor_profile_id, schedule_id) DO NOTHING;

-- Truck 3 (Bao Down): All parks, all schedules
INSERT INTO vendor_market_schedules (vendor_profile_id, market_id, schedule_id, is_active, vendor_start_time, vendor_end_time)
VALUES
  ('802ad912-a8ea-459a-bd9a-f60c75c3c6d4', 'f1000000-0001-4000-8000-000000000001', 'f2000000-0001-4000-8000-000000000001', true, '17:30:00', '22:00:00'),
  ('802ad912-a8ea-459a-bd9a-f60c75c3c6d4', 'f1000000-0001-4000-8000-000000000001', 'f2000000-0002-4000-8000-000000000002', true, '11:30:00', '21:00:00'),
  ('802ad912-a8ea-459a-bd9a-f60c75c3c6d4', 'f1000000-0002-4000-8000-000000000002', 'f2000000-0003-4000-8000-000000000003', true, '11:00:00', '14:30:00'),
  ('802ad912-a8ea-459a-bd9a-f60c75c3c6d4', 'f1000000-0003-4000-8000-000000000003', 'f2000000-0004-4000-8000-000000000004', true, '17:00:00', '21:00:00'),
  ('802ad912-a8ea-459a-bd9a-f60c75c3c6d4', 'f1000000-0003-4000-8000-000000000003', 'f2000000-0005-4000-8000-000000000005', true, '11:00:00', '19:30:00')
ON CONFLICT (vendor_profile_id, schedule_id) DO NOTHING;


-- VERIFICATION
SELECT vp.profile_data->>'business_name' as truck, vp.tier,
  (SELECT count(*) FROM listings l WHERE l.vendor_profile_id = vp.id AND l.deleted_at IS NULL AND l.status = 'published') as menu_items,
  (SELECT count(DISTINCT lm.market_id) FROM listing_markets lm JOIN listings l ON l.id = lm.listing_id WHERE l.vendor_profile_id = vp.id) as parks
FROM vendor_profiles vp
WHERE vp.vertical_id = 'food_trucks'
ORDER BY vp.profile_data->>'business_name';
