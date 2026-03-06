-- ============================================================================
-- PRODUCTION FM DEMO SEED DATA — Farmers Marketing
-- Run on: PRODUCTION Supabase (vfuckt...) ONLY
--
-- PREREQUISITES:
-- Create these 6 auth users in Supabase Dashboard (Auth → Users → Create User):
--   1. farmersmarketingapp+vendor1@gmail.com  (Produce, free tier)
--   2. farmersmarketingapp+vendor2@gmail.com  (Produce, premium tier)
--   3. farmersmarketingapp+vendor3@gmail.com  (Cottage producer)
--   4. farmersmarketingapp+vendor4@gmail.com  (Cottage producer)
--   5. farmersmarketingapp+vendor5@gmail.com  (Health & Wellness)
--   6. farmersmarketingapp+vendor6@gmail.com  (Art)
--
-- WHAT THIS CREATES:
-- - 6 vendor profiles (2 produce, 2 cottage, 1 health, 1 art)
--   Tiers: 2 free (V1, V4), 2 standard (V3, V5), 1 premium (V2), 1 standard (V6)
-- - 2 traditional markets (Sat, Sat+Sun) with 18hr cutoff
-- - 6 private pickup locations (1 per vendor) with 10hr cutoff
-- - 4-8 listings per vendor (32 total) — count varies by tier
-- - 2 market boxes (1 produce, 1 cottage)
-- - Market schedules, attendance, listing-market links
-- - V6 (art) is in Plainview TX (~50mi from Amarillo)
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 0: Safety checks
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM auth.users
  WHERE email IN (
    'farmersmarketingapp+vendor1@gmail.com',
    'farmersmarketingapp+vendor2@gmail.com',
    'farmersmarketingapp+vendor3@gmail.com',
    'farmersmarketingapp+vendor4@gmail.com',
    'farmersmarketingapp+vendor5@gmail.com',
    'farmersmarketingapp+vendor6@gmail.com'
  );
  IF v_count != 6 THEN
    RAISE EXCEPTION 'Expected 6 auth users but found %. Create all 6 in the Supabase Dashboard first.', v_count;
  END IF;
  RAISE NOTICE 'All 6 auth users found. Proceeding...';
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 1: Create user_profiles
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO user_profiles (user_id, email, display_name, roles, verticals)
VALUES
  ((SELECT id FROM auth.users WHERE email = 'farmersmarketingapp+vendor1@gmail.com'),
   'farmersmarketingapp+vendor1@gmail.com', 'Sample Green Acres Farm',
   ARRAY['buyer', 'vendor']::user_role[], ARRAY['farmers_market']),
  ((SELECT id FROM auth.users WHERE email = 'farmersmarketingapp+vendor2@gmail.com'),
   'farmersmarketingapp+vendor2@gmail.com', 'Sample Sunrise Organics',
   ARRAY['buyer', 'vendor']::user_role[], ARRAY['farmers_market']),
  ((SELECT id FROM auth.users WHERE email = 'farmersmarketingapp+vendor3@gmail.com'),
   'farmersmarketingapp+vendor3@gmail.com', 'Sample Sweet Bee Bakery',
   ARRAY['buyer', 'vendor']::user_role[], ARRAY['farmers_market']),
  ((SELECT id FROM auth.users WHERE email = 'farmersmarketingapp+vendor4@gmail.com'),
   'farmersmarketingapp+vendor4@gmail.com', 'Sample Panhandle Preserves',
   ARRAY['buyer', 'vendor']::user_role[], ARRAY['farmers_market']),
  ((SELECT id FROM auth.users WHERE email = 'farmersmarketingapp+vendor5@gmail.com'),
   'farmersmarketingapp+vendor5@gmail.com', 'Sample Prairie Wellness',
   ARRAY['buyer', 'vendor']::user_role[], ARRAY['farmers_market']),
  ((SELECT id FROM auth.users WHERE email = 'farmersmarketingapp+vendor6@gmail.com'),
   'farmersmarketingapp+vendor6@gmail.com', 'Sample West Texas Pottery',
   ARRAY['buyer', 'vendor']::user_role[], ARRAY['farmers_market'])
ON CONFLICT (user_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  roles = EXCLUDED.roles,
  verticals = EXCLUDED.verticals;


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 2: Create vendor profiles
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO vendor_profiles (
  id, user_id, vertical_id, status, tier, profile_data, description,
  stripe_payouts_enabled, stripe_account_id,
  approved_at, last_active_at, last_login_at,
  latitude, longitude, accepts_cash_at_pickup
)
VALUES
  -- V1: Sample Green Acres Farm (Produce, free tier)
  (
    'ee000000-0001-4000-8000-000000000001',
    (SELECT id FROM auth.users WHERE email = 'farmersmarketingapp+vendor1@gmail.com'),
    'farmers_market', 'approved', 'free',
    jsonb_build_object(
      'business_name', 'Sample Green Acres Farm',
      'legal_name', 'Sample Green Acres Farm LLC',
      'email', 'farmersmarketingapp+vendor1@gmail.com',
      'phone', '806-555-1001',
      'description', 'Third-generation family farm growing seasonal fruits and vegetables. We use sustainable practices and never spray pesticides. Demo data.',
      'address', '4200 S Washington St',
      'city', 'Amarillo',
      'state', 'TX',
      'zip', '79110',
      'vendor_type', jsonb_build_array('Fruits & Vegetables')
    ),
    'Third-generation family farm growing seasonal fruits and vegetables using sustainable practices.',
    true, 'acct_sample_green_acres',
    now() - interval '60 days', now() - interval '1 hour', now() - interval '1 hour',
    35.1711, -101.8352, true
  ),
  -- V2: Sample Sunrise Organics (Produce, premium)
  (
    'ee000000-0002-4000-8000-000000000002',
    (SELECT id FROM auth.users WHERE email = 'farmersmarketingapp+vendor2@gmail.com'),
    'farmers_market', 'approved', 'premium',
    jsonb_build_object(
      'business_name', 'Sample Sunrise Organics',
      'legal_name', 'Sample Sunrise Organics LLC',
      'email', 'farmersmarketingapp+vendor2@gmail.com',
      'phone', '806-555-1002',
      'description', 'Certified organic produce grown in our greenhouses and outdoor plots. Specialty salad greens, heirloom tomatoes, and fresh herbs year-round. Demo data.',
      'address', '8901 Canyon Dr',
      'city', 'Canyon',
      'state', 'TX',
      'zip', '79015',
      'vendor_type', jsonb_build_array('Fruits & Vegetables')
    ),
    'Certified organic produce — specialty salad greens, heirloom tomatoes, and fresh herbs year-round.',
    true, 'acct_sample_sunrise_organics',
    now() - interval '45 days', now() - interval '2 hours', now() - interval '2 hours',
    34.9803, -101.9188, true
  ),
  -- V3: Sample Sweet Bee Bakery (Cottage producer)
  (
    'ee000000-0003-4000-8000-000000000003',
    (SELECT id FROM auth.users WHERE email = 'farmersmarketingapp+vendor3@gmail.com'),
    'farmers_market', 'approved', 'standard',
    jsonb_build_object(
      'business_name', 'Sample Sweet Bee Bakery',
      'legal_name', 'Sample Sweet Bee Bakery',
      'email', 'farmersmarketingapp+vendor3@gmail.com',
      'phone', '806-555-1003',
      'description', 'Home-baked sourdough breads, cinnamon rolls, pies, and cookies made with locally-sourced honey and butter. Texas Cottage Food Law producer. Demo data.',
      'address', '2100 S Polk St',
      'city', 'Amarillo',
      'state', 'TX',
      'zip', '79109',
      'vendor_type', jsonb_build_array('Baked Goods')
    ),
    'Home-baked sourdough breads, cinnamon rolls, pies, and cookies. Texas Cottage Food producer.',
    true, 'acct_sample_sweet_bee',
    now() - interval '30 days', now() - interval '3 hours', now() - interval '3 hours',
    35.1850, -101.8400, true
  ),
  -- V4: Sample Panhandle Preserves (Cottage producer, free tier)
  (
    'ee000000-0004-4000-8000-000000000004',
    (SELECT id FROM auth.users WHERE email = 'farmersmarketingapp+vendor4@gmail.com'),
    'farmers_market', 'approved', 'free',
    jsonb_build_object(
      'business_name', 'Sample Panhandle Preserves',
      'legal_name', 'Sample Panhandle Preserves Co.',
      'email', 'farmersmarketingapp+vendor4@gmail.com',
      'phone', '806-555-1004',
      'description', 'Small-batch jams, jellies, pickles, and hot sauces made from Texas-grown produce. Every jar is hand-labeled and sealed. Demo data.',
      'address', '1400 S Coulter St',
      'city', 'Amarillo',
      'state', 'TX',
      'zip', '79106',
      'vendor_type', jsonb_build_array('Honey & Preserves')
    ),
    'Small-batch jams, jellies, pickles, and hot sauces made from Texas-grown produce.',
    true, 'acct_sample_panhandle_preserves',
    now() - interval '20 days', now() - interval '4 hours', now() - interval '4 hours',
    35.1900, -101.8700, true
  ),
  -- V5: Sample Prairie Wellness (Health & Wellness)
  (
    'ee000000-0005-4000-8000-000000000005',
    (SELECT id FROM auth.users WHERE email = 'farmersmarketingapp+vendor5@gmail.com'),
    'farmers_market', 'approved', 'standard',
    jsonb_build_object(
      'business_name', 'Sample Prairie Wellness',
      'legal_name', 'Sample Prairie Wellness LLC',
      'email', 'farmersmarketingapp+vendor5@gmail.com',
      'phone', '806-555-1005',
      'description', 'Natural soaps, beeswax candles, herbal tinctures, and essential oil blends. All ingredients sourced from local farms and wildcrafted from the Texas Panhandle. Demo data.',
      'address', '3300 Bell St',
      'city', 'Amarillo',
      'state', 'TX',
      'zip', '79109',
      'vendor_type', jsonb_build_array('Health & Wellness')
    ),
    'Natural soaps, beeswax candles, herbal tinctures, and essential oil blends from local ingredients.',
    true, 'acct_sample_prairie_wellness',
    now() - interval '15 days', now() - interval '5 hours', now() - interval '5 hours',
    35.1780, -101.8550, true
  ),
  -- V6: Sample West Texas Pottery (Art)
  (
    'ee000000-0006-4000-8000-000000000006',
    (SELECT id FROM auth.users WHERE email = 'farmersmarketingapp+vendor6@gmail.com'),
    'farmers_market', 'approved', 'standard',
    jsonb_build_object(
      'business_name', 'Sample West Texas Pottery',
      'legal_name', 'Sample West Texas Pottery',
      'email', 'farmersmarketingapp+vendor6@gmail.com',
      'phone', '806-555-1006',
      'description', 'Handmade stoneware pottery inspired by the Texas Panhandle landscape. Mugs, bowls, planters, and decorative pieces. Each piece is wheel-thrown and kiln-fired. Demo data.',
      'address', '200 W 5th St',
      'city', 'Plainview',
      'state', 'TX',
      'zip', '79072',
      'vendor_type', jsonb_build_array('Arts & Crafts')
    ),
    'Handmade stoneware pottery — mugs, bowls, planters, and decorative pieces. Wheel-thrown and kiln-fired.',
    true, 'acct_sample_west_texas_pottery',
    now() - interval '10 days', now() - interval '6 hours', now() - interval '6 hours',
    34.1848, -101.7068, true
  );


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 3: Approve vendor verifications
-- ────────────────────────────────────────────────────────────────────────────
UPDATE vendor_verifications SET
  status = 'approved', submitted_at = now(), reviewed_at = now(),
  notes = 'Prod FM demo seed - auto-approved',
  documents = jsonb_build_array(jsonb_build_object('filename', 'business_license.pdf', 'type', 'business_license', 'url', '', 'uploaded_at', now()::text)),
  requested_categories = ARRAY['Fruits & Vegetables'],
  category_verifications = jsonb_build_object('Fruits & Vegetables', jsonb_build_object('status', 'approved', 'reviewed_at', now()::text, 'notes', 'Demo seed')),
  coi_status = 'approved', coi_verified_at = now(),
  coi_documents = jsonb_build_array(jsonb_build_object('filename', 'coi.pdf', 'url', '', 'uploaded_at', now()::text)),
  prohibited_items_acknowledged_at = now(), onboarding_completed_at = now()
WHERE vendor_profile_id = 'ee000000-0001-4000-8000-000000000001';

UPDATE vendor_verifications SET
  status = 'approved', submitted_at = now(), reviewed_at = now(),
  notes = 'Prod FM demo seed - auto-approved',
  documents = jsonb_build_array(jsonb_build_object('filename', 'business_license.pdf', 'type', 'business_license', 'url', '', 'uploaded_at', now()::text)),
  requested_categories = ARRAY['Fruits & Vegetables'],
  category_verifications = jsonb_build_object('Fruits & Vegetables', jsonb_build_object('status', 'approved', 'reviewed_at', now()::text, 'notes', 'Demo seed')),
  coi_status = 'approved', coi_verified_at = now(),
  coi_documents = jsonb_build_array(jsonb_build_object('filename', 'coi.pdf', 'url', '', 'uploaded_at', now()::text)),
  prohibited_items_acknowledged_at = now(), onboarding_completed_at = now()
WHERE vendor_profile_id = 'ee000000-0002-4000-8000-000000000002';

UPDATE vendor_verifications SET
  status = 'approved', submitted_at = now(), reviewed_at = now(),
  notes = 'Prod FM demo seed - auto-approved',
  documents = jsonb_build_array(jsonb_build_object('filename', 'cottage_food_permit.pdf', 'type', 'cottage_food_permit', 'url', '', 'uploaded_at', now()::text)),
  requested_categories = ARRAY['Baked Goods'],
  category_verifications = jsonb_build_object('Baked Goods', jsonb_build_object('status', 'approved', 'reviewed_at', now()::text, 'notes', 'Demo seed')),
  coi_status = 'approved', coi_verified_at = now(),
  coi_documents = jsonb_build_array(jsonb_build_object('filename', 'coi.pdf', 'url', '', 'uploaded_at', now()::text)),
  prohibited_items_acknowledged_at = now(), onboarding_completed_at = now()
WHERE vendor_profile_id = 'ee000000-0003-4000-8000-000000000003';

UPDATE vendor_verifications SET
  status = 'approved', submitted_at = now(), reviewed_at = now(),
  notes = 'Prod FM demo seed - auto-approved',
  documents = jsonb_build_array(jsonb_build_object('filename', 'cottage_food_permit.pdf', 'type', 'cottage_food_permit', 'url', '', 'uploaded_at', now()::text)),
  requested_categories = ARRAY['Honey & Preserves'],
  category_verifications = jsonb_build_object('Honey & Preserves', jsonb_build_object('status', 'approved', 'reviewed_at', now()::text, 'notes', 'Demo seed')),
  coi_status = 'approved', coi_verified_at = now(),
  coi_documents = jsonb_build_array(jsonb_build_object('filename', 'coi.pdf', 'url', '', 'uploaded_at', now()::text)),
  prohibited_items_acknowledged_at = now(), onboarding_completed_at = now()
WHERE vendor_profile_id = 'ee000000-0004-4000-8000-000000000004';

UPDATE vendor_verifications SET
  status = 'approved', submitted_at = now(), reviewed_at = now(),
  notes = 'Prod FM demo seed - auto-approved',
  documents = jsonb_build_array(jsonb_build_object('filename', 'business_license.pdf', 'type', 'business_license', 'url', '', 'uploaded_at', now()::text)),
  requested_categories = ARRAY['Health & Wellness'],
  category_verifications = jsonb_build_object('Health & Wellness', jsonb_build_object('status', 'approved', 'reviewed_at', now()::text, 'notes', 'Demo seed')),
  coi_status = 'approved', coi_verified_at = now(),
  coi_documents = jsonb_build_array(jsonb_build_object('filename', 'coi.pdf', 'url', '', 'uploaded_at', now()::text)),
  prohibited_items_acknowledged_at = now(), onboarding_completed_at = now()
WHERE vendor_profile_id = 'ee000000-0005-4000-8000-000000000005';

UPDATE vendor_verifications SET
  status = 'approved', submitted_at = now(), reviewed_at = now(),
  notes = 'Prod FM demo seed - auto-approved',
  documents = jsonb_build_array(jsonb_build_object('filename', 'business_license.pdf', 'type', 'business_license', 'url', '', 'uploaded_at', now()::text)),
  requested_categories = ARRAY['Arts & Crafts'],
  category_verifications = jsonb_build_object('Arts & Crafts', jsonb_build_object('status', 'approved', 'reviewed_at', now()::text, 'notes', 'Demo seed')),
  coi_status = 'approved', coi_verified_at = now(),
  coi_documents = jsonb_build_array(jsonb_build_object('filename', 'coi.pdf', 'url', '', 'uploaded_at', now()::text)),
  prohibited_items_acknowledged_at = now(), onboarding_completed_at = now()
WHERE vendor_profile_id = 'ee000000-0006-4000-8000-000000000006';


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 4: Create markets (2 traditional + 6 private pickup)
-- ────────────────────────────────────────────────────────────────────────────

-- Traditional markets (18hr cutoff)
INSERT INTO markets (id, name, market_type, address, city, state, zip, vertical_id, status, active, timezone, cutoff_hours, description, latitude, longitude, approval_status)
VALUES
  ('ee100000-0001-4000-8000-000000000001',
   'Sample Amarillo Farmers Market', 'traditional',
   '1000 S Polk St', 'Amarillo', 'TX', '79101', 'farmers_market', 'active', true,
   'America/Chicago', 18,
   'Sample weekly farmers market in downtown Amarillo. Fresh produce, baked goods, crafts, and more. (Demo data)',
   35.2050, -101.8350, 'approved'),

  ('ee100000-0002-4000-8000-000000000002',
   'Sample Canyon Saturday Market', 'traditional',
   '1500 4th Ave', 'Canyon', 'TX', '79015', 'farmers_market', 'active', true,
   'America/Chicago', 18,
   'Sample weekend market on the Canyon town square. Local produce, cottage goods, and artisan crafts. (Demo data)',
   34.9803, -101.9188, 'approved');

-- Private pickup locations (10hr cutoff, 1 per vendor)
INSERT INTO markets (id, name, market_type, address, city, state, zip, vertical_id, vendor_profile_id, status, active, timezone, cutoff_hours, description, latitude, longitude, approval_status)
VALUES
  -- V1: Green Acres — Monday private pickup
  ('ee100000-0101-4000-8000-000000000001',
   'Sample Green Acres Farm Stand', 'private_pickup',
   '4200 S Washington St', 'Amarillo', 'TX', '79110', 'farmers_market',
   'ee000000-0001-4000-8000-000000000001',
   'active', true, 'America/Chicago', 10,
   'Pick up your pre-order at our farm stand. (Demo data)',
   35.1711, -101.8352, 'approved'),
  -- V2: Sunrise Organics — Tuesday private pickup
  ('ee100000-0102-4000-8000-000000000002',
   'Sample Sunrise Organics Greenhouse', 'private_pickup',
   '8901 Canyon Dr', 'Canyon', 'TX', '79015', 'farmers_market',
   'ee000000-0002-4000-8000-000000000002',
   'active', true, 'America/Chicago', 10,
   'Pick up at our greenhouse entrance. (Demo data)',
   34.9803, -101.9188, 'approved'),
  -- V3: Sweet Bee Bakery — Wednesday private pickup
  ('ee100000-0103-4000-8000-000000000003',
   'Sample Sweet Bee Home Kitchen', 'private_pickup',
   '2100 S Polk St', 'Amarillo', 'TX', '79109', 'farmers_market',
   'ee000000-0003-4000-8000-000000000003',
   'active', true, 'America/Chicago', 10,
   'Pick up fresh baked goods from our kitchen porch. (Demo data)',
   35.1850, -101.8400, 'approved'),
  -- V4: Panhandle Preserves — Thursday private pickup
  ('ee100000-0104-4000-8000-000000000004',
   'Sample Panhandle Preserves Workshop', 'private_pickup',
   '1400 S Coulter St', 'Amarillo', 'TX', '79106', 'farmers_market',
   'ee000000-0004-4000-8000-000000000004',
   'active', true, 'America/Chicago', 10,
   'Pick up your jars at our workshop. (Demo data)',
   35.1900, -101.8700, 'approved'),
  -- V5: Prairie Wellness — Monday private pickup
  ('ee100000-0105-4000-8000-000000000005',
   'Sample Prairie Wellness Studio', 'private_pickup',
   '3300 Bell St', 'Amarillo', 'TX', '79109', 'farmers_market',
   'ee000000-0005-4000-8000-000000000005',
   'active', true, 'America/Chicago', 10,
   'Pick up wellness products at our home studio. (Demo data)',
   35.1780, -101.8550, 'approved'),
  -- V6: West Texas Pottery — Wednesday private pickup (Plainview TX)
  ('ee100000-0106-4000-8000-000000000006',
   'Sample West Texas Pottery Studio', 'private_pickup',
   '200 W 5th St', 'Plainview', 'TX', '79072', 'farmers_market',
   'ee000000-0006-4000-8000-000000000006',
   'active', true, 'America/Chicago', 10,
   'Pick up pottery at our studio in Plainview. (Demo data)',
   34.1848, -101.7068, 'approved');


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 5: Create market schedules
-- ────────────────────────────────────────────────────────────────────────────

-- Amarillo Farmers Market: Saturday 8am-1pm
INSERT INTO market_schedules (id, market_id, day_of_week, start_time, end_time, active)
VALUES
  ('ee200000-0001-4000-8000-000000000001', 'ee100000-0001-4000-8000-000000000001', 6, '08:00', '13:00', true);

-- Canyon Saturday Market: Saturday 9am-2pm + Sunday 10am-2pm
INSERT INTO market_schedules (id, market_id, day_of_week, start_time, end_time, active)
VALUES
  ('ee200000-0002-4000-8000-000000000002', 'ee100000-0002-4000-8000-000000000002', 6, '09:00', '14:00', true),
  ('ee200000-0003-4000-8000-000000000003', 'ee100000-0002-4000-8000-000000000002', 0, '10:00', '14:00', true);

-- Private pickup schedules:
-- V1 Green Acres: Monday 9am-5pm
INSERT INTO market_schedules (id, market_id, day_of_week, start_time, end_time, active)
VALUES ('ee200000-0101-4000-8000-000000000001', 'ee100000-0101-4000-8000-000000000001', 1, '09:00', '17:00', true);
-- V2 Sunrise Organics: Tuesday 10am-4pm
INSERT INTO market_schedules (id, market_id, day_of_week, start_time, end_time, active)
VALUES ('ee200000-0102-4000-8000-000000000002', 'ee100000-0102-4000-8000-000000000002', 2, '10:00', '16:00', true);
-- V3 Sweet Bee: Wednesday 8am-12pm
INSERT INTO market_schedules (id, market_id, day_of_week, start_time, end_time, active)
VALUES ('ee200000-0103-4000-8000-000000000003', 'ee100000-0103-4000-8000-000000000003', 3, '08:00', '12:00', true);
-- V4 Panhandle Preserves: Thursday 10am-3pm
INSERT INTO market_schedules (id, market_id, day_of_week, start_time, end_time, active)
VALUES ('ee200000-0104-4000-8000-000000000004', 'ee100000-0104-4000-8000-000000000004', 4, '10:00', '15:00', true);
-- V5 Prairie Wellness: Monday 10am-4pm
INSERT INTO market_schedules (id, market_id, day_of_week, start_time, end_time, active)
VALUES ('ee200000-0105-4000-8000-000000000005', 'ee100000-0105-4000-8000-000000000005', 1, '10:00', '16:00', true);
-- V6 West Texas Pottery: Wednesday 10am-5pm
INSERT INTO market_schedules (id, market_id, day_of_week, start_time, end_time, active)
VALUES ('ee200000-0106-4000-8000-000000000006', 'ee100000-0106-4000-8000-000000000006', 3, '10:00', '17:00', true);


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 6: Market-vendor associations (traditional markets only)
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO market_vendors (market_id, vendor_profile_id, approved)
VALUES
  -- Amarillo Farmers Market (Saturday): V1(free), V2(premium), V5(standard)
  ('ee100000-0001-4000-8000-000000000001', 'ee000000-0001-4000-8000-000000000001', true),
  ('ee100000-0001-4000-8000-000000000001', 'ee000000-0002-4000-8000-000000000002', true),
  ('ee100000-0001-4000-8000-000000000001', 'ee000000-0005-4000-8000-000000000005', true),
  -- Canyon Saturday Market (Saturday + Sunday): V2(premium), V3(standard), V4(free), V6(standard)
  ('ee100000-0002-4000-8000-000000000002', 'ee000000-0002-4000-8000-000000000002', true),
  ('ee100000-0002-4000-8000-000000000002', 'ee000000-0003-4000-8000-000000000003', true),
  ('ee100000-0002-4000-8000-000000000002', 'ee000000-0004-4000-8000-000000000004', true),
  ('ee100000-0002-4000-8000-000000000002', 'ee000000-0006-4000-8000-000000000006', true);


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 7: Create listings
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE listings DISABLE TRIGGER enforce_listing_limit_trigger;

-- V1: Sample Green Acres Farm (Produce, free tier, 4 listings)
INSERT INTO listings (id, vendor_profile_id, vertical_id, status, title, description, price_cents, quantity, category, listing_type, quantity_amount, quantity_unit, listing_data)
VALUES
  ('ee300000-0101-4000-8000-000000000001', 'ee000000-0001-4000-8000-000000000001', 'farmers_market', 'published',
   'Sample Heirloom Tomatoes', 'Vine-ripened heirloom tomatoes in a mix of Cherokee Purple, Brandywine, and Green Zebra varieties.',
   500, 40, 'Fruits & Vegetables', 'presale', 1, 'lb',
   jsonb_build_object('contains_allergens', false)),
  ('ee300000-0102-4000-8000-000000000002', 'ee000000-0001-4000-8000-000000000001', 'farmers_market', 'published',
   'Sample Sweet Corn', 'Fresh-picked bi-color sweet corn. So sweet you can eat it raw right off the cob.',
   800, 30, 'Fruits & Vegetables', 'presale', 6, 'ears',
   jsonb_build_object('contains_allergens', false)),
  ('ee300000-0103-4000-8000-000000000003', 'ee000000-0001-4000-8000-000000000001', 'farmers_market', 'published',
   'Sample Mixed Greens Bag', 'Spring mix of arugula, spinach, baby kale, and red leaf lettuce. Washed and ready to eat.',
   450, 50, 'Fruits & Vegetables', 'presale', 8, 'oz',
   jsonb_build_object('contains_allergens', false)),
  ('ee300000-0104-4000-8000-000000000004', 'ee000000-0001-4000-8000-000000000001', 'farmers_market', 'published',
   'Sample Jalapeño Peppers', 'Texas-grown jalapeños. Medium heat, perfect for salsa, poppers, or pickling.',
   350, 60, 'Fruits & Vegetables', 'presale', 0.5, 'lb',
   jsonb_build_object('contains_allergens', false));

-- V2: Sample Sunrise Organics (Produce, premium tier, 8 listings)
INSERT INTO listings (id, vendor_profile_id, vertical_id, status, title, description, price_cents, quantity, category, listing_type, quantity_amount, quantity_unit, listing_data)
VALUES
  ('ee300000-0201-4000-8000-000000000001', 'ee000000-0002-4000-8000-000000000002', 'farmers_market', 'published',
   'Sample Organic Salad Greens', 'Certified organic spring mix grown in our temperature-controlled greenhouse. Tender and flavorful.',
   600, 35, 'Fruits & Vegetables', 'presale', 5, 'oz',
   jsonb_build_object('contains_allergens', false)),
  ('ee300000-0202-4000-8000-000000000002', 'ee000000-0002-4000-8000-000000000002', 'farmers_market', 'published',
   'Sample Cherry Tomato Pint', 'Sweet Sungold and red cherry tomatoes. Perfect for snacking, salads, or roasting.',
   400, 45, 'Fruits & Vegetables', 'presale', 1, 'pint',
   jsonb_build_object('contains_allergens', false)),
  ('ee300000-0203-4000-8000-000000000003', 'ee000000-0002-4000-8000-000000000002', 'farmers_market', 'published',
   'Sample Fresh Basil Bunch', 'Fragrant Genovese basil, freshly cut. Makes the best pesto and caprese.',
   300, 40, 'Herbs & Plants', 'presale', 1, 'bunch',
   jsonb_build_object('contains_allergens', false)),
  ('ee300000-0204-4000-8000-000000000004', 'ee000000-0002-4000-8000-000000000002', 'farmers_market', 'published',
   'Sample Organic Zucchini', 'Tender summer squash harvested small for the best flavor. Great grilled, spiralized, or in bread.',
   400, 35, 'Fruits & Vegetables', 'presale', 1, 'lb',
   jsonb_build_object('contains_allergens', false)),
  ('ee300000-0205-4000-8000-000000000005', 'ee000000-0002-4000-8000-000000000002', 'farmers_market', 'published',
   'Sample Herb Starter Kit', 'Three 4-inch pots: basil, cilantro, and rosemary. Ready to plant or keep on your windowsill.',
   1000, 15, 'Herbs & Plants', 'presale', 3, 'pots',
   jsonb_build_object('contains_allergens', false)),
  ('ee300000-0206-4000-8000-000000000006', 'ee000000-0002-4000-8000-000000000002', 'farmers_market', 'published',
   'Sample Rainbow Chard Bunch', 'Bright red, orange, and yellow stems with tender dark-green leaves. Beautiful and nutritious.',
   350, 40, 'Fruits & Vegetables', 'presale', 1, 'bunch',
   jsonb_build_object('contains_allergens', false)),
  ('ee300000-0207-4000-8000-000000000007', 'ee000000-0002-4000-8000-000000000002', 'farmers_market', 'published',
   'Sample Microgreens Tray', 'Sunflower and radish microgreens. Packed with flavor and nutrients. Harvested the morning of market day.',
   500, 25, 'Fruits & Vegetables', 'presale', 4, 'oz',
   jsonb_build_object('contains_allergens', false)),
  ('ee300000-0208-4000-8000-000000000008', 'ee000000-0002-4000-8000-000000000002', 'farmers_market', 'published',
   'Sample Heirloom Cucumber Bag', 'Crisp Lemon cucumbers and Armenian cucumbers. Mild, sweet, and perfect for salads.',
   450, 30, 'Fruits & Vegetables', 'presale', 1, 'lb',
   jsonb_build_object('contains_allergens', false));

-- V3: Sample Sweet Bee Bakery (Cottage, standard, 5 listings)
INSERT INTO listings (id, vendor_profile_id, vertical_id, status, title, description, price_cents, quantity, category, listing_type, quantity_amount, quantity_unit, listing_data)
VALUES
  ('ee300000-0301-4000-8000-000000000001', 'ee000000-0003-4000-8000-000000000003', 'farmers_market', 'published',
   'Sample Sourdough Loaf', 'Wild-yeast sourdough made with Texas-milled flour. 48-hour cold ferment for deep tangy flavor and open crumb.',
   800, 20, 'Baked Goods', 'presale', 1, 'loaf',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Wheat (flour)')),
  ('ee300000-0302-4000-8000-000000000002', 'ee000000-0003-4000-8000-000000000003', 'farmers_market', 'published',
   'Sample Cinnamon Rolls (6-pack)', 'Soft, pillowy cinnamon rolls with cream cheese frosting. Made with local honey and real cinnamon.',
   1400, 15, 'Baked Goods', 'presale', 6, 'rolls',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Wheat (flour), dairy (butter, cream cheese), eggs')),
  ('ee300000-0303-4000-8000-000000000003', 'ee000000-0003-4000-8000-000000000003', 'farmers_market', 'published',
   'Sample Pecan Pie', 'Classic Texas pecan pie with locally harvested pecans and a flaky butter crust.',
   2200, 8, 'Baked Goods', 'presale', 1, 'pie',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Wheat (flour), dairy (butter), eggs, tree nuts (pecans)')),
  ('ee300000-0304-4000-8000-000000000004', 'ee000000-0003-4000-8000-000000000003', 'farmers_market', 'published',
   'Sample Chocolate Chip Cookies', 'Chewy chocolate chip cookies made with brown butter and sea salt. One dozen per bag.',
   900, 25, 'Baked Goods', 'presale', 12, 'cookies',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Wheat (flour), dairy (butter), eggs, soy (chocolate)')),
  ('ee300000-0305-4000-8000-000000000005', 'ee000000-0003-4000-8000-000000000003', 'farmers_market', 'published',
   'Sample Banana Nut Muffins', 'Moist banana muffins studded with Texas pecans. Made with local honey instead of refined sugar.',
   700, 18, 'Baked Goods', 'presale', 4, 'muffins',
   jsonb_build_object('contains_allergens', true, 'ingredients', 'Wheat (flour), dairy (butter), eggs, tree nuts (pecans)'));

-- V4: Sample Panhandle Preserves (Cottage, free tier, 4 listings)
INSERT INTO listings (id, vendor_profile_id, vertical_id, status, title, description, price_cents, quantity, category, listing_type, quantity_amount, quantity_unit, listing_data)
VALUES
  ('ee300000-0401-4000-8000-000000000001', 'ee000000-0004-4000-8000-000000000004', 'farmers_market', 'published',
   'Sample Peach Jalapeño Jam', 'Sweet peaches with a kick of jalapeño heat. Amazing on crackers with cream cheese or as a glaze for grilled chicken.',
   800, 30, 'Honey & Preserves', 'presale', 8, 'oz',
   jsonb_build_object('contains_allergens', false)),
  ('ee300000-0402-4000-8000-000000000002', 'ee000000-0004-4000-8000-000000000004', 'farmers_market', 'published',
   'Sample Bread & Butter Pickles', 'Crisp, tangy-sweet pickles made from locally grown cucumbers. Old family recipe.',
   700, 25, 'Honey & Preserves', 'presale', 16, 'oz',
   jsonb_build_object('contains_allergens', false)),
  ('ee300000-0403-4000-8000-000000000003', 'ee000000-0004-4000-8000-000000000004', 'farmers_market', 'published',
   'Sample Texas Hot Sauce', 'Small-batch hot sauce made with habaneros, roasted garlic, and apple cider vinegar. Medium-hot.',
   600, 35, 'Honey & Preserves', 'presale', 5, 'oz',
   jsonb_build_object('contains_allergens', false)),
  ('ee300000-0404-4000-8000-000000000004', 'ee000000-0004-4000-8000-000000000004', 'farmers_market', 'published',
   'Sample Strawberry Preserves', 'Whole strawberry preserves with just fruit, sugar, and pectin. Tastes like summer in a jar.',
   750, 30, 'Honey & Preserves', 'presale', 10, 'oz',
   jsonb_build_object('contains_allergens', false));

-- V5: Sample Prairie Wellness (Health, standard, 6 listings)
INSERT INTO listings (id, vendor_profile_id, vertical_id, status, title, description, price_cents, quantity, category, listing_type, quantity_amount, quantity_unit, listing_data)
VALUES
  ('ee300000-0501-4000-8000-000000000001', 'ee000000-0005-4000-8000-000000000005', 'farmers_market', 'published',
   'Sample Lavender Goat Milk Soap', 'Handmade bar soap with goat milk from a local farm and dried lavender buds. Gentle and moisturizing.',
   800, 30, 'Health & Wellness', 'presale', 1, 'bar',
   jsonb_build_object('contains_allergens', false)),
  ('ee300000-0502-4000-8000-000000000002', 'ee000000-0005-4000-8000-000000000005', 'farmers_market', 'published',
   'Sample Beeswax Candle Set', 'Three hand-dipped 100% beeswax taper candles. Natural honey scent, long burn time.',
   1200, 20, 'Health & Wellness', 'presale', 3, 'candles',
   jsonb_build_object('contains_allergens', false)),
  ('ee300000-0503-4000-8000-000000000003', 'ee000000-0005-4000-8000-000000000005', 'farmers_market', 'published',
   'Sample Herbal Salve Tin', 'Healing salve with calendula, comfrey, and plantain infused in olive oil with beeswax. For dry skin, minor cuts, and bug bites.',
   1000, 25, 'Health & Wellness', 'presale', 2, 'oz',
   jsonb_build_object('contains_allergens', false)),
  ('ee300000-0504-4000-8000-000000000004', 'ee000000-0005-4000-8000-000000000005', 'farmers_market', 'published',
   'Sample Essential Oil Roller', 'Pre-diluted essential oil blend in jojoba carrier oil. Choose: Stress Relief (lavender-chamomile), Energy (peppermint-orange), or Sleep (cedarwood-bergamot).',
   1400, 20, 'Health & Wellness', 'presale', 10, 'ml',
   jsonb_build_object('contains_allergens', false)),
  ('ee300000-0505-4000-8000-000000000005', 'ee000000-0005-4000-8000-000000000005', 'farmers_market', 'published',
   'Sample Lip Balm Set', 'Four all-natural lip balms: honey vanilla, peppermint, lavender, and unscented. Made with beeswax and shea butter.',
   800, 30, 'Health & Wellness', 'presale', 4, 'balms',
   jsonb_build_object('contains_allergens', false)),
  ('ee300000-0506-4000-8000-000000000006', 'ee000000-0005-4000-8000-000000000005', 'farmers_market', 'published',
   'Sample Dried Herb Bundle', 'Bundle of dried rosemary, sage, and lavender. Perfect for cooking, sachets, or home fragrance.',
   600, 25, 'Herbs & Plants', 'presale', 1, 'bundle',
   jsonb_build_object('contains_allergens', false));

-- V6: Sample West Texas Pottery (Art, standard, 5 listings)
INSERT INTO listings (id, vendor_profile_id, vertical_id, status, title, description, price_cents, quantity, category, listing_type, quantity_amount, quantity_unit, listing_data)
VALUES
  ('ee300000-0601-4000-8000-000000000001', 'ee000000-0006-4000-8000-000000000006', 'farmers_market', 'published',
   'Sample Handmade Coffee Mug', 'Wheel-thrown stoneware mug with a speckled desert glaze. Holds 12oz, dishwasher and microwave safe.',
   2800, 12, 'Arts & Crafts', 'presale', 1, 'mug',
   jsonb_build_object('contains_allergens', false)),
  ('ee300000-0602-4000-8000-000000000002', 'ee000000-0006-4000-8000-000000000006', 'farmers_market', 'published',
   'Sample Ceramic Bowl Set', 'Set of two nesting bowls in turquoise and sand glazes. Perfect for cereal, soup, or ice cream.',
   4500, 8, 'Arts & Crafts', 'presale', 2, 'bowls',
   jsonb_build_object('contains_allergens', false)),
  ('ee300000-0603-4000-8000-000000000003', 'ee000000-0006-4000-8000-000000000006', 'farmers_market', 'published',
   'Sample Succulent Planter', 'Small stoneware planter with drainage hole. Comes with a saucer. Plant not included.',
   1800, 15, 'Arts & Crafts', 'presale', 1, 'planter',
   jsonb_build_object('contains_allergens', false)),
  ('ee300000-0604-4000-8000-000000000004', 'ee000000-0006-4000-8000-000000000006', 'farmers_market', 'published',
   'Sample Decorative Wall Plate', 'Hand-painted stoneware plate with Palo Duro Canyon landscape design. For display, not food use.',
   3500, 6, 'Arts & Crafts', 'presale', 1, 'plate',
   jsonb_build_object('contains_allergens', false)),
  ('ee300000-0605-4000-8000-000000000005', 'ee000000-0006-4000-8000-000000000006', 'farmers_market', 'published',
   'Sample Ceramic Spoon Rest', 'Wheel-thrown spoon rest with a rustic desert glaze. Keeps your countertop clean in style.',
   1500, 10, 'Arts & Crafts', 'presale', 1, 'piece',
   jsonb_build_object('contains_allergens', false));

ALTER TABLE listings ENABLE TRIGGER enforce_listing_limit_trigger;


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 8: Create market boxes (1 produce + 1 cottage)
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO market_box_offerings (id, vendor_profile_id, vertical_id, name, description, price_cents, price_4week_cents, pickup_market_id, pickup_day_of_week, pickup_start_time, pickup_end_time, max_subscribers, active, quantity_amount, quantity_unit)
VALUES
  -- V2 Sunrise Organics: Weekly Produce Box (pickup at Canyon Market, Saturday)
  ('ee400000-0201-4000-8000-000000000001', 'ee000000-0002-4000-8000-000000000002', 'farmers_market',
   'Sample Weekly Organic Produce Box',
   'A curated selection of whatever is freshest this week from our greenhouse and outdoor plots. Typically includes: salad greens, tomatoes, herbs, and 2-3 seasonal items. Feeds 2-3 people for the week.',
   2500, 9000,
   'ee100000-0002-4000-8000-000000000002', 6, '09:00', '12:00',
   15, true, 1, 'box'),
  -- V3 Sweet Bee Bakery: Weekly Bread Box (pickup at Canyon Market, Saturday)
  ('ee400000-0301-4000-8000-000000000001', 'ee000000-0003-4000-8000-000000000003', 'farmers_market',
   'Sample Weekly Bread & Pastry Box',
   'One sourdough loaf, 4 cinnamon rolls, and a rotating surprise pastry (scone, muffin, or danish). Baked fresh Saturday morning.',
   2000, 7200,
   'ee100000-0002-4000-8000-000000000002', 6, '09:00', '12:00',
   10, true, 1, 'box');


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 9: Link listings to markets
-- ────────────────────────────────────────────────────────────────────────────

-- V1 Green Acres → Amarillo Farmers Market + Green Acres private
INSERT INTO listing_markets (listing_id, market_id)
SELECT l.id, m.id FROM listings l CROSS JOIN markets m
WHERE l.vendor_profile_id = 'ee000000-0001-4000-8000-000000000001' AND l.deleted_at IS NULL
  AND m.id IN ('ee100000-0001-4000-8000-000000000001', 'ee100000-0101-4000-8000-000000000001');

-- V2 Sunrise Organics → Amarillo Farmers Market + Canyon Market + Sunrise private
INSERT INTO listing_markets (listing_id, market_id)
SELECT l.id, m.id FROM listings l CROSS JOIN markets m
WHERE l.vendor_profile_id = 'ee000000-0002-4000-8000-000000000002' AND l.deleted_at IS NULL
  AND m.id IN ('ee100000-0001-4000-8000-000000000001', 'ee100000-0002-4000-8000-000000000002', 'ee100000-0102-4000-8000-000000000002');

-- V3 Sweet Bee → Canyon Market + Sweet Bee private
INSERT INTO listing_markets (listing_id, market_id)
SELECT l.id, m.id FROM listings l CROSS JOIN markets m
WHERE l.vendor_profile_id = 'ee000000-0003-4000-8000-000000000003' AND l.deleted_at IS NULL
  AND m.id IN ('ee100000-0002-4000-8000-000000000002', 'ee100000-0103-4000-8000-000000000003');

-- V4 Panhandle Preserves → Canyon Market + Panhandle private
INSERT INTO listing_markets (listing_id, market_id)
SELECT l.id, m.id FROM listings l CROSS JOIN markets m
WHERE l.vendor_profile_id = 'ee000000-0004-4000-8000-000000000004' AND l.deleted_at IS NULL
  AND m.id IN ('ee100000-0002-4000-8000-000000000002', 'ee100000-0104-4000-8000-000000000004');

-- V5 Prairie Wellness → Amarillo Farmers Market + Prairie private
INSERT INTO listing_markets (listing_id, market_id)
SELECT l.id, m.id FROM listings l CROSS JOIN markets m
WHERE l.vendor_profile_id = 'ee000000-0005-4000-8000-000000000005' AND l.deleted_at IS NULL
  AND m.id IN ('ee100000-0001-4000-8000-000000000001', 'ee100000-0105-4000-8000-000000000005');

-- V6 West Texas Pottery (Plainview) → Canyon Market + Pottery private (Plainview)
INSERT INTO listing_markets (listing_id, market_id)
SELECT l.id, m.id FROM listings l CROSS JOIN markets m
WHERE l.vendor_profile_id = 'ee000000-0006-4000-8000-000000000006' AND l.deleted_at IS NULL
  AND m.id IN ('ee100000-0002-4000-8000-000000000002', 'ee100000-0106-4000-8000-000000000006');


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 10: Vendor market schedule attendance
-- FM doesn't strictly require attendance like FT, but it enables the
-- availability function to show correct pickup dates
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE vendor_market_schedules DISABLE TRIGGER trg_check_vendor_schedule_conflict;

-- V1 Green Acres (FREE): Amarillo Sat + Monday private (free = 1 traditional market)
INSERT INTO vendor_market_schedules (vendor_profile_id, market_id, schedule_id, is_active)
VALUES
  ('ee000000-0001-4000-8000-000000000001', 'ee100000-0001-4000-8000-000000000001', 'ee200000-0001-4000-8000-000000000001', true),
  ('ee000000-0001-4000-8000-000000000001', 'ee100000-0101-4000-8000-000000000001', 'ee200000-0101-4000-8000-000000000001', true);

-- V2 Sunrise Organics: Amarillo Sat + Canyon Sat + Canyon Sun + Tuesday private
INSERT INTO vendor_market_schedules (vendor_profile_id, market_id, schedule_id, is_active)
VALUES
  ('ee000000-0002-4000-8000-000000000002', 'ee100000-0001-4000-8000-000000000001', 'ee200000-0001-4000-8000-000000000001', true),
  ('ee000000-0002-4000-8000-000000000002', 'ee100000-0002-4000-8000-000000000002', 'ee200000-0002-4000-8000-000000000002', true),
  ('ee000000-0002-4000-8000-000000000002', 'ee100000-0002-4000-8000-000000000002', 'ee200000-0003-4000-8000-000000000003', true),
  ('ee000000-0002-4000-8000-000000000002', 'ee100000-0102-4000-8000-000000000002', 'ee200000-0102-4000-8000-000000000002', true);

-- V3 Sweet Bee: Canyon Sat + Wednesday private
INSERT INTO vendor_market_schedules (vendor_profile_id, market_id, schedule_id, is_active)
VALUES
  ('ee000000-0003-4000-8000-000000000003', 'ee100000-0002-4000-8000-000000000002', 'ee200000-0002-4000-8000-000000000002', true),
  ('ee000000-0003-4000-8000-000000000003', 'ee100000-0103-4000-8000-000000000003', 'ee200000-0103-4000-8000-000000000003', true);

-- V4 Panhandle Preserves (FREE): Canyon Sat + Thursday private (free = 1 traditional market)
INSERT INTO vendor_market_schedules (vendor_profile_id, market_id, schedule_id, is_active)
VALUES
  ('ee000000-0004-4000-8000-000000000004', 'ee100000-0002-4000-8000-000000000002', 'ee200000-0002-4000-8000-000000000002', true),
  ('ee000000-0004-4000-8000-000000000004', 'ee100000-0104-4000-8000-000000000004', 'ee200000-0104-4000-8000-000000000004', true);

-- V5 Prairie Wellness: Amarillo Sat + Monday private
INSERT INTO vendor_market_schedules (vendor_profile_id, market_id, schedule_id, is_active)
VALUES
  ('ee000000-0005-4000-8000-000000000005', 'ee100000-0001-4000-8000-000000000001', 'ee200000-0001-4000-8000-000000000001', true),
  ('ee000000-0005-4000-8000-000000000005', 'ee100000-0105-4000-8000-000000000005', 'ee200000-0105-4000-8000-000000000005', true);

-- V6 West Texas Pottery (Plainview, standard): Canyon Sat + Wednesday private
INSERT INTO vendor_market_schedules (vendor_profile_id, market_id, schedule_id, is_active)
VALUES
  ('ee000000-0006-4000-8000-000000000006', 'ee100000-0002-4000-8000-000000000002', 'ee200000-0002-4000-8000-000000000002', true),
  ('ee000000-0006-4000-8000-000000000006', 'ee100000-0106-4000-8000-000000000006', 'ee200000-0106-4000-8000-000000000006', true);

ALTER TABLE vendor_market_schedules ENABLE TRIGGER trg_check_vendor_schedule_conflict;


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 11: Vendor location cache
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO vendor_location_cache (vendor_profile_id, latitude, longitude, location_source, source_market_id, vertical_id)
VALUES
  ('ee000000-0001-4000-8000-000000000001', 35.2050, -101.8350, 'market', 'ee100000-0001-4000-8000-000000000001', 'farmers_market'),
  ('ee000000-0002-4000-8000-000000000002', 34.9803, -101.9188, 'market', 'ee100000-0002-4000-8000-000000000002', 'farmers_market'),
  ('ee000000-0003-4000-8000-000000000003', 35.1850, -101.8400, 'market', 'ee100000-0002-4000-8000-000000000002', 'farmers_market'),
  ('ee000000-0004-4000-8000-000000000004', 35.1900, -101.8700, 'market', 'ee100000-0002-4000-8000-000000000002', 'farmers_market'),
  ('ee000000-0005-4000-8000-000000000005', 35.1780, -101.8550, 'market', 'ee100000-0001-4000-8000-000000000001', 'farmers_market'),
  ('ee000000-0006-4000-8000-000000000006', 34.1848, -101.7068, 'market', 'ee100000-0002-4000-8000-000000000002', 'farmers_market');


-- ────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ────────────────────────────────────────────────────────────────────────────
SELECT '=== FM VENDOR PROFILES ===' as section;
SELECT
  vp.profile_data->>'business_name' as vendor_name,
  vp.tier,
  vp.status,
  vp.stripe_payouts_enabled as stripe_ok,
  (SELECT vv.status FROM vendor_verifications vv WHERE vv.vendor_profile_id = vp.id) as verification,
  (SELECT count(*) FROM listings l WHERE l.vendor_profile_id = vp.id AND l.deleted_at IS NULL AND l.status = 'published') as listings,
  (SELECT count(*) FROM market_box_offerings mb WHERE mb.vendor_profile_id = vp.id AND mb.active = true) as market_boxes,
  (SELECT count(DISTINCT lm.market_id) FROM listing_markets lm JOIN listings l ON l.id = lm.listing_id WHERE l.vendor_profile_id = vp.id) as locations
FROM vendor_profiles vp
WHERE vp.id IN (
  'ee000000-0001-4000-8000-000000000001', 'ee000000-0002-4000-8000-000000000002',
  'ee000000-0003-4000-8000-000000000003', 'ee000000-0004-4000-8000-000000000004',
  'ee000000-0005-4000-8000-000000000005', 'ee000000-0006-4000-8000-000000000006'
)
ORDER BY vp.profile_data->>'business_name';

SELECT '=== FM MARKETS ===' as section;
SELECT name, market_type, city, cutoff_hours
FROM markets
WHERE id IN (
  'ee100000-0001-4000-8000-000000000001', 'ee100000-0002-4000-8000-000000000002',
  'ee100000-0101-4000-8000-000000000001', 'ee100000-0102-4000-8000-000000000002',
  'ee100000-0103-4000-8000-000000000003', 'ee100000-0104-4000-8000-000000000004',
  'ee100000-0105-4000-8000-000000000005', 'ee100000-0106-4000-8000-000000000006'
)
ORDER BY market_type, name;

SELECT '=== SCHEDULE SUMMARY ===' as section;
SELECT m.name, ms.day_of_week,
  CASE ms.day_of_week WHEN 0 THEN 'Sun' WHEN 1 THEN 'Mon' WHEN 2 THEN 'Tue' WHEN 3 THEN 'Wed' WHEN 4 THEN 'Thu' WHEN 5 THEN 'Fri' WHEN 6 THEN 'Sat' END as day_name,
  ms.start_time, ms.end_time
FROM market_schedules ms
JOIN markets m ON m.id = ms.market_id
WHERE ms.id IN (
  'ee200000-0001-4000-8000-000000000001', 'ee200000-0002-4000-8000-000000000002',
  'ee200000-0003-4000-8000-000000000003', 'ee200000-0101-4000-8000-000000000001',
  'ee200000-0102-4000-8000-000000000002', 'ee200000-0103-4000-8000-000000000003',
  'ee200000-0104-4000-8000-000000000004', 'ee200000-0105-4000-8000-000000000005',
  'ee200000-0106-4000-8000-000000000006'
)
ORDER BY m.market_type, m.name, ms.day_of_week;
