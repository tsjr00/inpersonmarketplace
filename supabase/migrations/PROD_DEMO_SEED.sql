-- ============================================================================
-- PRODUCTION DEMO SEED DATA — Food Truck'n
-- Run on: PRODUCTION Supabase (vfuckt...) ONLY
--
-- PREREQUISITES:
-- 1. Create auth users in Supabase Dashboard (Auth → Users → Create User):
--    - foodtrucknapp+truck4@gmail.com (set a password)
--    - foodtrucknapp+truck5@gmail.com (set a password)
-- 2. Then paste this entire script into the SQL Editor and run it
--
-- WHAT THIS CREATES:
-- - 2 vendor profiles (Sample BBQ Shack = basic, Sample Taco Loco = pro)
-- - 2 food truck parks (Sample Amarillo Food Park, Sample Canyon Eats Park)
-- - 1 private location per truck
-- - 5 listings per truck (10 total)
-- - 2 chef boxes per truck (4 total)
-- - Market schedules, attendance, listing-market links
-- NOTE: Events require migration 039 (not applied to prod). Skipped.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 0: Safety checks
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_user1 UUID;
  v_user2 UUID;
BEGIN
  SELECT id INTO v_user1 FROM auth.users WHERE email = 'foodtrucknapp+truck4@gmail.com';
  SELECT id INTO v_user2 FROM auth.users WHERE email = 'foodtrucknapp+truck5@gmail.com';

  IF v_user1 IS NULL THEN
    RAISE EXCEPTION 'Auth user foodtrucknapp+truck4@gmail.com not found. Create it in the Supabase Dashboard first.';
  END IF;
  IF v_user2 IS NULL THEN
    RAISE EXCEPTION 'Auth user foodtrucknapp+truck5@gmail.com not found. Create it in the Supabase Dashboard first.';
  END IF;

  RAISE NOTICE 'Both auth users found. User1: %, User2: %', v_user1, v_user2;
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 1: Create user_profiles if handle_new_user trigger didn't fire
-- (Dashboard-created users may not trigger it)
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO user_profiles (user_id, email, display_name, roles, verticals)
VALUES
  (
    (SELECT id FROM auth.users WHERE email = 'foodtrucknapp+truck4@gmail.com'),
    'foodtrucknapp+truck4@gmail.com',
    'Sample BBQ Shack',
    ARRAY['buyer', 'vendor']::user_role[],
    ARRAY['food_trucks']
  ),
  (
    (SELECT id FROM auth.users WHERE email = 'foodtrucknapp+truck5@gmail.com'),
    'foodtrucknapp+truck5@gmail.com',
    'Sample Taco Loco',
    ARRAY['buyer', 'vendor']::user_role[],
    ARRAY['food_trucks']
  )
ON CONFLICT (user_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  roles = EXCLUDED.roles,
  verticals = EXCLUDED.verticals;


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 2: Create vendor profiles
-- Trigger auto_create_vendor_verification will create vendor_verifications rows
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO vendor_profiles (
  id, user_id, vertical_id, status, tier, profile_data, description,
  stripe_payouts_enabled, stripe_account_id,
  approved_at, last_active_at, last_login_at,
  latitude, longitude, accepts_cash_at_pickup
)
VALUES
  -- Truck 1: Sample BBQ Shack (Amarillo, basic tier)
  (
    'dd000000-0001-4000-8000-000000000001',
    (SELECT id FROM auth.users WHERE email = 'foodtrucknapp+truck4@gmail.com'),
    'food_trucks', 'approved', 'basic',
    jsonb_build_object(
      'business_name', 'Sample BBQ Shack',
      'legal_name', 'Sample BBQ Shack LLC',
      'email', 'foodtrucknapp+truck4@gmail.com',
      'phone', '806-555-4001',
      'description', 'Low and slow Texas-style BBQ smoked fresh daily. Brisket, pulled pork, ribs, mac & cheese, and cornbread. Demo data — not a real food truck.',
      'address', '3501 S Soncy Rd',
      'city', 'Amarillo',
      'state', 'TX',
      'zip', '79119',
      'vendor_type', jsonb_build_array('BBQ & Smoked')
    ),
    'Low and slow Texas-style BBQ smoked fresh daily. Brisket, pulled pork, ribs, mac & cheese, and cornbread.',
    true, 'acct_sample_bbq_shack',
    now() - interval '14 days', now() - interval '1 hour', now() - interval '1 hour',
    35.1532, -101.8913, true
  ),
  -- Truck 2: Sample Taco Loco (Canyon, pro tier)
  (
    'dd000000-0002-4000-8000-000000000002',
    (SELECT id FROM auth.users WHERE email = 'foodtrucknapp+truck5@gmail.com'),
    'food_trucks', 'approved', 'pro',
    jsonb_build_object(
      'business_name', 'Sample Taco Loco',
      'legal_name', 'Sample Taco Loco LLC',
      'email', 'foodtrucknapp+truck5@gmail.com',
      'phone', '806-555-5001',
      'description', 'Authentic street tacos, burritos, elote, churros, and horchata. Family recipes from Oaxaca with a Texas twist. Demo data — not a real food truck.',
      'address', '1500 4th Ave',
      'city', 'Canyon',
      'state', 'TX',
      'zip', '79015',
      'vendor_type', jsonb_build_array('Mexican / Latin')
    ),
    'Authentic street tacos, burritos, elote, churros, and horchata. Family recipes with a Texas twist.',
    true, 'acct_sample_taco_loco',
    now() - interval '30 days', now() - interval '2 hours', now() - interval '2 hours',
    34.9803, -101.9188, true
  );


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 3: Approve vendor verifications (all onboarding gates)
-- ────────────────────────────────────────────────────────────────────────────
UPDATE vendor_verifications SET
  status = 'approved',
  submitted_at = now(),
  reviewed_at = now(),
  notes = 'Prod demo seed - auto-approved',
  documents = jsonb_build_array(jsonb_build_object('filename', 'food_handler_permit.pdf', 'type', 'food_handler_permit', 'url', '', 'uploaded_at', now()::text)),
  requested_categories = ARRAY['BBQ & Smoked'],
  category_verifications = jsonb_build_object(
    'mfu_permit', jsonb_build_object('status', 'approved', 'doc_type', 'mfu_permit', 'documents', jsonb_build_array(), 'reviewed_at', now()::text, 'notes', 'Demo seed'),
    'food_handler_card', jsonb_build_object('status', 'approved', 'doc_type', 'food_handler_card', 'documents', jsonb_build_array(), 'reviewed_at', now()::text, 'notes', 'Demo seed')
  ),
  coi_status = 'approved',
  coi_verified_at = now(),
  coi_documents = jsonb_build_array(jsonb_build_object('filename', 'coi_2026.pdf', 'url', '', 'uploaded_at', now()::text)),
  prohibited_items_acknowledged_at = now(),
  onboarding_completed_at = now()
WHERE vendor_profile_id = 'dd000000-0001-4000-8000-000000000001';

UPDATE vendor_verifications SET
  status = 'approved',
  submitted_at = now(),
  reviewed_at = now(),
  notes = 'Prod demo seed - auto-approved',
  documents = jsonb_build_array(jsonb_build_object('filename', 'food_handler_permit.pdf', 'type', 'food_handler_permit', 'url', '', 'uploaded_at', now()::text)),
  requested_categories = ARRAY['Mexican / Latin'],
  category_verifications = jsonb_build_object(
    'mfu_permit', jsonb_build_object('status', 'approved', 'doc_type', 'mfu_permit', 'documents', jsonb_build_array(), 'reviewed_at', now()::text, 'notes', 'Demo seed'),
    'food_handler_card', jsonb_build_object('status', 'approved', 'doc_type', 'food_handler_card', 'documents', jsonb_build_array(), 'reviewed_at', now()::text, 'notes', 'Demo seed')
  ),
  coi_status = 'approved',
  coi_verified_at = now(),
  coi_documents = jsonb_build_array(jsonb_build_object('filename', 'coi_2026.pdf', 'url', '', 'uploaded_at', now()::text)),
  prohibited_items_acknowledged_at = now(),
  onboarding_completed_at = now()
WHERE vendor_profile_id = 'dd000000-0002-4000-8000-000000000002';


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 4: Create food truck parks (2 parks + 2 private locations)
-- ────────────────────────────────────────────────────────────────────────────

-- Public food truck parks
INSERT INTO markets (id, name, market_type, address, city, state, zip, vertical_id, status, active, timezone, cutoff_hours, description, latitude, longitude, approval_status)
VALUES
  ('dd100000-0001-4000-8000-000000000001',
   'Sample Amarillo Food Park', 'traditional',
   '600 S Tyler St', 'Amarillo', 'TX', '79101', 'food_trucks', 'active', true,
   'America/Chicago', 0,
   'Sample food truck park in downtown Amarillo. Covered seating, live music on weekends. (Demo data)',
   35.2065, -101.8313, 'approved'),

  ('dd100000-0002-4000-8000-000000000002',
   'Sample Canyon Eats Park', 'traditional',
   '401 15th St', 'Canyon', 'TX', '79015', 'food_trucks', 'active', true,
   'America/Chicago', 0,
   'Sample food truck park on the Canyon town square. Picnic tables and family-friendly. (Demo data)',
   34.9803, -101.9188, 'approved');

-- Private pickup locations (1 per truck)
INSERT INTO markets (id, name, market_type, address, city, state, zip, vertical_id, vendor_profile_id, status, active, timezone, cutoff_hours, description, latitude, longitude, approval_status)
VALUES
  ('dd100000-0003-4000-8000-000000000001',
   'Sample BBQ Shack — Soncy Rd Spot', 'private_pickup',
   '3501 S Soncy Rd', 'Amarillo', 'TX', '79119', 'food_trucks',
   'dd000000-0001-4000-8000-000000000001',
   'active', true, 'America/Chicago', 0,
   'Our regular weekday spot near the Soncy Rd shopping center. (Demo data)',
   35.1532, -101.8913, 'approved'),

  ('dd100000-0004-4000-8000-000000000002',
   'Sample Taco Loco — Canyon Private Spot', 'private_pickup',
   '2300 N 2nd Ave', 'Canyon', 'TX', '79015', 'food_trucks',
   'dd000000-0002-4000-8000-000000000002',
   'active', true, 'America/Chicago', 0,
   'Our private spot near West Texas A&M campus. (Demo data)',
   34.9892, -101.9301, 'approved');

-- NOTE: Event (Sample Route 66 Food Festival) skipped — migration 039 not applied to prod.
-- Apply 039 to prod, then create the event manually if needed.


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 5: Create market schedules
-- ────────────────────────────────────────────────────────────────────────────

-- Amarillo Food Park: Friday 5pm-10pm, Saturday 11am-9pm
INSERT INTO market_schedules (id, market_id, day_of_week, start_time, end_time, active)
VALUES
  ('dd200000-0001-4000-8000-000000000001', 'dd100000-0001-4000-8000-000000000001', 5, '17:00', '22:00', true),
  ('dd200000-0002-4000-8000-000000000002', 'dd100000-0001-4000-8000-000000000001', 6, '11:00', '21:00', true);

-- Canyon Eats Park: Saturday 11am-3pm
INSERT INTO market_schedules (id, market_id, day_of_week, start_time, end_time, active)
VALUES
  ('dd200000-0003-4000-8000-000000000003', 'dd100000-0002-4000-8000-000000000002', 6, '11:00', '15:00', true);

-- BBQ Shack private: Wednesday 11am-2pm
INSERT INTO market_schedules (id, market_id, day_of_week, start_time, end_time, active)
VALUES
  ('dd200000-0004-4000-8000-000000000004', 'dd100000-0003-4000-8000-000000000001', 3, '11:00', '14:00', true);

-- Taco Loco private: Thursday 11am-2pm
INSERT INTO market_schedules (id, market_id, day_of_week, start_time, end_time, active)
VALUES
  ('dd200000-0005-4000-8000-000000000005', 'dd100000-0004-4000-8000-000000000002', 4, '11:00', '14:00', true);

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 6: Market-vendor associations
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO market_vendors (market_id, vendor_profile_id, approved)
VALUES
  -- BBQ Shack at: Amarillo Food Park
  ('dd100000-0001-4000-8000-000000000001', 'dd000000-0001-4000-8000-000000000001', true),
  -- Taco Loco at: Canyon Eats Park
  ('dd100000-0002-4000-8000-000000000002', 'dd000000-0002-4000-8000-000000000002', true);


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 7: Create listings (5 per truck = 10 total)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE listings DISABLE TRIGGER enforce_listing_limit_trigger;

-- TRUCK 1: Sample BBQ Shack (5 items)
INSERT INTO listings (id, vendor_profile_id, vertical_id, status, title, description, price_cents, quantity, category, listing_type, quantity_amount, quantity_unit, listing_data)
VALUES
  ('dd300000-0101-4000-8000-000000000001', 'dd000000-0001-4000-8000-000000000001', 'food_trucks', 'published',
   'Sample Brisket Plate', 'Half pound of 14-hour post oak smoked brisket, sliced to order. Served with two sides and Texas toast.',
   1800, 30, 'BBQ & Smoked', 'presale', 0.5, 'lb',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Wheat (bread)')),

  ('dd300000-0102-4000-8000-000000000002', 'dd000000-0001-4000-8000-000000000001', 'food_trucks', 'published',
   'Sample Pulled Pork Sandwich', 'Slow-smoked pulled pork on a toasted brioche bun with tangy house slaw and vinegar-mustard sauce.',
   1200, 40, 'BBQ & Smoked', 'presale', 1, 'sandwich',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Wheat (bun), dairy (butter)')),

  ('dd300000-0103-4000-8000-000000000003', 'dd000000-0001-4000-8000-000000000001', 'food_trucks', 'published',
   'Sample Smoked Ribs', 'Four bone-in pork ribs with house dry rub and a light BBQ glaze. Comes with one side and pickles.',
   1600, 20, 'BBQ & Smoked', 'presale', 4, 'ribs',
   jsonb_build_object('contains_allergens', false)),

  ('dd300000-0104-4000-8000-000000000004', 'dd000000-0001-4000-8000-000000000001', 'food_trucks', 'published',
   'Sample Mac & Cheese', 'Creamy smoked gouda and cheddar mac baked with a panko crust.',
   700, 50, 'BBQ & Smoked', 'presale', 1, 'bowl',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Wheat (pasta, panko), dairy (cheese, cream)')),

  ('dd300000-0105-4000-8000-000000000005', 'dd000000-0001-4000-8000-000000000001', 'food_trucks', 'published',
   'Sample Cornbread', 'Sweet jalapeño cornbread baked fresh. Served with honey butter.',
   400, 60, 'BBQ & Smoked', 'presale', 1, 'piece',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Wheat (cornmeal), dairy (butter), eggs'));

-- TRUCK 2: Sample Taco Loco (5 items)
INSERT INTO listings (id, vendor_profile_id, vertical_id, status, title, description, price_cents, quantity, category, listing_type, quantity_amount, quantity_unit, listing_data)
VALUES
  ('dd300000-0201-4000-8000-000000000001', 'dd000000-0002-4000-8000-000000000002', 'food_trucks', 'published',
   'Sample Street Taco Trio', 'Three corn tortilla tacos — choose carne asada, al pastor, or carnitas. Fresh cilantro, onion, and salsa verde.',
   850, 50, 'Mexican / Latin', 'presale', 3, 'tacos',
   jsonb_build_object('contains_allergens', false)),

  ('dd300000-0202-4000-8000-000000000002', 'dd000000-0002-4000-8000-000000000002', 'food_trucks', 'published',
   'Sample Birria Tacos', 'Three crispy birria tacos with melted Oaxaca cheese and a cup of rich consomé for dipping.',
   1200, 30, 'Mexican / Latin', 'presale', 3, 'tacos',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Wheat (tortilla), dairy (cheese)')),

  ('dd300000-0203-4000-8000-000000000003', 'dd000000-0002-4000-8000-000000000002', 'food_trucks', 'published',
   'Sample Elote Cup', 'Roasted street corn with mayo, cotija cheese, chili-lime seasoning, and fresh lime.',
   600, 60, 'Mexican / Latin', 'presale', 1, 'cup',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Dairy (cheese, mayo)')),

  ('dd300000-0204-4000-8000-000000000004', 'dd000000-0002-4000-8000-000000000002', 'food_trucks', 'published',
   'Sample Churros', 'Warm cinnamon-sugar churros with your choice of chocolate, caramel, or strawberry dipping sauce.',
   500, 45, 'Mexican / Latin', 'presale', 3, 'pieces',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Wheat (flour), dairy (butter), eggs')),

  ('dd300000-0205-4000-8000-000000000005', 'dd000000-0002-4000-8000-000000000002', 'food_trucks', 'published',
   'Sample Horchata', 'House-made horchata with rice milk, cinnamon, and vanilla. Served over ice.',
   400, 70, 'Mexican / Latin', 'presale', 16, 'oz',
   jsonb_build_object('contains_allergens', false));

ALTER TABLE listings ENABLE TRIGGER enforce_listing_limit_trigger;


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 8: Create chef boxes (market_box_offerings) — 2 per truck
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO market_box_offerings (id, vendor_profile_id, vertical_id, name, description, price_cents, price_4week_cents, pickup_market_id, pickup_day_of_week, pickup_start_time, pickup_end_time, max_subscribers, active, box_type, quantity_amount, quantity_unit)
VALUES
  -- BBQ Shack chef boxes (pickup at Amarillo Food Park, Saturday)
  ('dd400000-0101-4000-8000-000000000001', 'dd000000-0001-4000-8000-000000000001', 'food_trucks',
   'Sample BBQ Family Pack', 'Feeds 4-6 people. 1 lb sliced brisket, 1 lb pulled pork, pint of mac & cheese, pint of coleslaw, 6 pieces cornbread, and a bottle of house BBQ sauce.',
   4500, 16000,
   'dd100000-0001-4000-8000-000000000001', 6, '11:00', '13:00',
   10, true, 'family_kit', 1, 'box'),

  ('dd400000-0102-4000-8000-000000000002', 'dd000000-0001-4000-8000-000000000001', 'food_trucks',
   'Sample Smokehouse Sampler', 'A little of everything. 4oz brisket, 4oz pulled pork, 2 ribs, cornbread, and pickles. Perfect for one hungry person or two snackers.',
   2500, 9000,
   'dd100000-0001-4000-8000-000000000001', 6, '11:00', '13:00',
   15, true, 'weekly_dinner', 1, 'box'),

  -- Taco Loco chef boxes (pickup at Canyon Eats Park, Saturday)
  ('dd400000-0201-4000-8000-000000000001', 'dd000000-0002-4000-8000-000000000002', 'food_trucks',
   'Sample Taco Party Pack', '20 assorted street tacos (carne asada, al pastor, carnitas), pint of salsa verde, pint of pico de gallo, lime wedges. Feeds 4-6.',
   3500, 12500,
   'dd100000-0002-4000-8000-000000000002', 6, '11:00', '13:00',
   12, true, 'family_kit', 1, 'box'),

  ('dd400000-0202-4000-8000-000000000002', 'dd000000-0002-4000-8000-000000000002', 'food_trucks',
   'Sample Fiesta Box', '6 birria tacos, elote cup, churros, and a 32oz horchata. A complete meal for 1-2 people.',
   2200, 8000,
   'dd100000-0002-4000-8000-000000000002', 6, '11:00', '13:00',
   15, true, 'weekly_dinner', 1, 'box');


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 9: Link listings to markets
-- ────────────────────────────────────────────────────────────────────────────

-- BBQ Shack listings → Amarillo Food Park + BBQ private spot
INSERT INTO listing_markets (listing_id, market_id)
SELECT l.id, m.id
FROM listings l CROSS JOIN markets m
WHERE l.vendor_profile_id = 'dd000000-0001-4000-8000-000000000001'
  AND l.deleted_at IS NULL
  AND m.id IN (
    'dd100000-0001-4000-8000-000000000001',  -- Amarillo Food Park
    'dd100000-0003-4000-8000-000000000001'   -- BBQ private spot
  );

-- Taco Loco listings → Canyon Eats Park + Taco private spot
INSERT INTO listing_markets (listing_id, market_id)
SELECT l.id, m.id
FROM listings l CROSS JOIN markets m
WHERE l.vendor_profile_id = 'dd000000-0002-4000-8000-000000000002'
  AND l.deleted_at IS NULL
  AND m.id IN (
    'dd100000-0002-4000-8000-000000000002',  -- Canyon Eats Park
    'dd100000-0004-4000-8000-000000000002'   -- Taco private spot
  );


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 10: Vendor attendance schedules (required for FT ordering)
-- ────────────────────────────────────────────────────────────────────────────

-- BBQ Shack attendance
INSERT INTO vendor_market_schedules (vendor_profile_id, market_id, schedule_id, is_active, vendor_start_time, vendor_end_time)
VALUES
  -- Amarillo Food Park: Friday + Saturday
  ('dd000000-0001-4000-8000-000000000001', 'dd100000-0001-4000-8000-000000000001', 'dd200000-0001-4000-8000-000000000001', true, '17:00:00', '21:30:00'),
  ('dd000000-0001-4000-8000-000000000001', 'dd100000-0001-4000-8000-000000000001', 'dd200000-0002-4000-8000-000000000002', true, '11:00:00', '20:00:00'),
  -- Private spot: Wednesday
  ('dd000000-0001-4000-8000-000000000001', 'dd100000-0003-4000-8000-000000000001', 'dd200000-0004-4000-8000-000000000004', true, '11:00:00', '14:00:00');

-- Taco Loco attendance
INSERT INTO vendor_market_schedules (vendor_profile_id, market_id, schedule_id, is_active, vendor_start_time, vendor_end_time)
VALUES
  -- Canyon Eats Park: Saturday
  ('dd000000-0002-4000-8000-000000000002', 'dd100000-0002-4000-8000-000000000002', 'dd200000-0003-4000-8000-000000000003', true, '11:00:00', '15:00:00'),
  -- Private spot: Thursday
  ('dd000000-0002-4000-8000-000000000002', 'dd100000-0004-4000-8000-000000000002', 'dd200000-0005-4000-8000-000000000005', true, '11:00:00', '14:00:00');


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 11: Vendor location cache (for browse page geo queries)
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO vendor_location_cache (vendor_profile_id, latitude, longitude, location_source, source_market_id, vertical_id)
VALUES
  ('dd000000-0001-4000-8000-000000000001', 35.2065, -101.8313, 'market', 'dd100000-0001-4000-8000-000000000001', 'food_trucks'),
  ('dd000000-0002-4000-8000-000000000002', 34.9803, -101.9188, 'market', 'dd100000-0002-4000-8000-000000000002', 'food_trucks');


-- ────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ────────────────────────────────────────────────────────────────────────────
SELECT '=== VENDOR PROFILES ===' as section;
SELECT
  vp.profile_data->>'business_name' as truck_name,
  vp.tier,
  vp.status,
  vp.stripe_payouts_enabled as stripe_ok,
  (SELECT vv.status FROM vendor_verifications vv WHERE vv.vendor_profile_id = vp.id) as verification,
  (SELECT count(*) FROM listings l WHERE l.vendor_profile_id = vp.id AND l.deleted_at IS NULL AND l.status = 'published') as listings,
  (SELECT count(*) FROM market_box_offerings mb WHERE mb.vendor_profile_id = vp.id AND mb.active = true) as chef_boxes,
  (SELECT count(DISTINCT lm.market_id) FROM listing_markets lm JOIN listings l ON l.id = lm.listing_id WHERE l.vendor_profile_id = vp.id) as locations
FROM vendor_profiles vp
WHERE vp.id IN ('dd000000-0001-4000-8000-000000000001', 'dd000000-0002-4000-8000-000000000002')
ORDER BY vp.profile_data->>'business_name';

SELECT '=== MARKETS ===' as section;
SELECT name, market_type, city, state
FROM markets
WHERE id IN ('dd100000-0001-4000-8000-000000000001', 'dd100000-0002-4000-8000-000000000002', 'dd100000-0003-4000-8000-000000000001', 'dd100000-0004-4000-8000-000000000002')
ORDER BY name;

-- Event verification skipped (migration 039 not on prod)
