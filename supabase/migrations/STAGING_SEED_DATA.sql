-- ============================================================================
-- STAGING TEST DATA SETUP
-- Run on: Staging Supabase (vfknvs...) ONLY
--
-- Creates: 6 vendor accounts, 2 new markets, reassigns all seeded listings,
-- sets up vendor verifications, market schedules, and listing-market links.
-- Delete this file after running.
-- ============================================================================

-- ============================================================================
-- STEP 1: Create 2 new markets (Canyon TX + Lubbock TX)
-- ============================================================================

INSERT INTO markets (id, name, market_type, address, city, state, zip, vertical_id, status, active, timezone, cutoff_hours)
VALUES
  ('a1b2c3d4-1111-4000-8000-000000000001', 'Canyon Farmers Market', 'traditional',
   '1501 4th Ave', 'Canyon', 'TX', '79015', 'farmers_market', 'active', true, 'America/Chicago', 18),
  ('a1b2c3d4-2222-4000-8000-000000000002', 'Lubbock Saturday Market', 'traditional',
   '1625 13th St', 'Lubbock', 'TX', '79401', 'farmers_market', 'active', true, 'America/Chicago', 18)
ON CONFLICT (id) DO NOTHING;

-- Create schedules for new markets
INSERT INTO market_schedules (id, market_id, day_of_week, start_time, end_time, active)
VALUES
  -- Canyon: Saturdays 8am-1pm
  ('b1b2c3d4-1111-4000-8000-000000000001', 'a1b2c3d4-1111-4000-8000-000000000001', 6, '08:00', '13:00', true),
  -- Lubbock: Saturdays 7am-12pm
  ('b1b2c3d4-2222-4000-8000-000000000002', 'a1b2c3d4-2222-4000-8000-000000000002', 6, '07:00', '12:00', true)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- STEP 2: Create user_profiles for all 6 vendor emails
-- ============================================================================

INSERT INTO user_profiles (user_id, email, display_name, role, buyer_tier)
SELECT
  au.id,
  au.email,
  CASE au.email
    WHEN 'farmersmarketingapp+vegvendor1@gmail.com' THEN 'Maria Garcia'
    WHEN 'farmersmarketingapp+cottagevendor1@gmail.com' THEN 'Sarah Mitchell'
    WHEN 'farmersmarketingapp+cottagevendor2@gmail.com' THEN 'Rosa Hernandez'
    WHEN 'farmersmarketingapp+artgvendor@gmail.com' THEN 'David Chen'
    WHEN 'farmersmarketingapp+fruitvendor@gmail.com' THEN 'Jake Thompson'
    WHEN 'farmersmarketingapp+wellnessvendor@gmail.com' THEN 'Emma Blackwood'
  END,
  'vendor',
  'standard'
FROM auth.users au
WHERE au.email IN (
  'farmersmarketingapp+vegvendor1@gmail.com',
  'farmersmarketingapp+cottagevendor1@gmail.com',
  'farmersmarketingapp+cottagevendor2@gmail.com',
  'farmersmarketingapp+artgvendor@gmail.com',
  'farmersmarketingapp+fruitvendor@gmail.com',
  'farmersmarketingapp+wellnessvendor@gmail.com'
)
ON CONFLICT (user_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  role = EXCLUDED.role,
  buyer_tier = 'standard';


-- ============================================================================
-- STEP 3: Create vendor_profiles for all 6 vendors
-- ============================================================================

-- Vendor 1: vegvendor1 → Valley Verde Farm (Produce + Dairy) — Canyon
INSERT INTO vendor_profiles (id, user_id, vertical_id, status, tier, profile_data)
SELECT
  gen_random_uuid(),
  au.id,
  'farmers_market',
  'approved',
  'standard',
  jsonb_build_object(
    'business_name', 'Valley Verde Farm',
    'email', 'farmersmarketingapp+vegvendor1@gmail.com',
    'phone', '806-555-0101',
    'description', 'Family-owned farm growing organic vegetables and raising free-range dairy cattle in the heart of the Texas Panhandle. We bring fresh-picked produce and farm-fresh dairy to your table.',
    'address', '4520 County Road 12',
    'city', 'Canyon',
    'state', 'TX',
    'zip', '79015'
  )
FROM auth.users au
WHERE au.email = 'farmersmarketingapp+vegvendor1@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM vendor_profiles vp WHERE vp.user_id = au.id AND vp.vertical_id = 'farmers_market'
  );

-- Vendor 2: cottagevendor1 → Sweet Rise Bakery (Baked Goods) — Canyon
INSERT INTO vendor_profiles (id, user_id, vertical_id, status, tier, profile_data)
SELECT
  gen_random_uuid(),
  au.id,
  'farmers_market',
  'approved',
  'standard',
  jsonb_build_object(
    'business_name', 'Sweet Rise Bakery',
    'email', 'farmersmarketingapp+cottagevendor1@gmail.com',
    'phone', '806-555-0102',
    'description', 'Artisan bakery specializing in small-batch sourdough, pastries, and seasonal treats. Everything is baked fresh the morning of market day using locally sourced flour and butter.',
    'address', '312 15th Street',
    'city', 'Canyon',
    'state', 'TX',
    'zip', '79015'
  )
FROM auth.users au
WHERE au.email = 'farmersmarketingapp+cottagevendor1@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM vendor_profiles vp WHERE vp.user_id = au.id AND vp.vertical_id = 'farmers_market'
  );

-- Vendor 3: cottagevendor2 → Abuela's Kitchen (Prepared Foods) — Amarillo
INSERT INTO vendor_profiles (id, user_id, vertical_id, status, tier, profile_data)
SELECT
  gen_random_uuid(),
  au.id,
  'farmers_market',
  'approved',
  'standard',
  jsonb_build_object(
    'business_name', 'Abuela''s Kitchen',
    'email', 'farmersmarketingapp+cottagevendor2@gmail.com',
    'phone', '806-555-0103',
    'description', 'Authentic Tex-Mex prepared foods made from family recipes passed down through generations. From tamales to fresh salsa, every dish is handmade with love.',
    'address', '1847 S Washington St',
    'city', 'Amarillo',
    'state', 'TX',
    'zip', '79102'
  )
FROM auth.users au
WHERE au.email = 'farmersmarketingapp+cottagevendor2@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM vendor_profiles vp WHERE vp.user_id = au.id AND vp.vertical_id = 'farmers_market'
  );

-- Vendor 4: artgvendor → Desert Bloom Art & Garden (Art + Plants) — Amarillo
INSERT INTO vendor_profiles (id, user_id, vertical_id, status, tier, profile_data)
SELECT
  gen_random_uuid(),
  au.id,
  'farmers_market',
  'approved',
  'standard',
  jsonb_build_object(
    'business_name', 'Desert Bloom Art & Garden',
    'email', 'farmersmarketingapp+artgvendor@gmail.com',
    'phone', '806-555-0104',
    'description', 'Handcrafted art and native Texas plants. We specialize in oil pastels, watercolors, and drought-resistant succulents and native plants perfect for Panhandle gardens.',
    'address', '623 S Polk St',
    'city', 'Amarillo',
    'state', 'TX',
    'zip', '79101'
  )
FROM auth.users au
WHERE au.email = 'farmersmarketingapp+artgvendor@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM vendor_profiles vp WHERE vp.user_id = au.id AND vp.vertical_id = 'farmers_market'
  );

-- Vendor 5: fruitvendor → Pecan Creek Ranch (Meat + Pantry/Honey) — Lubbock
INSERT INTO vendor_profiles (id, user_id, vertical_id, status, tier, profile_data)
SELECT
  gen_random_uuid(),
  au.id,
  'farmers_market',
  'approved',
  'standard',
  jsonb_build_object(
    'business_name', 'Pecan Creek Ranch',
    'email', 'farmersmarketingapp+fruitvendor@gmail.com',
    'phone', '806-555-0105',
    'description', 'Sustainable ranch raising grass-fed beef, heritage pork, and pastured poultry. We also harvest raw honey from our on-site apiaries. From our family ranch to your family table.',
    'address', '8901 FM 1585',
    'city', 'Lubbock',
    'state', 'TX',
    'zip', '79424'
  )
FROM auth.users au
WHERE au.email = 'farmersmarketingapp+fruitvendor@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM vendor_profiles vp WHERE vp.user_id = au.id AND vp.vertical_id = 'farmers_market'
  );

-- Vendor 6: wellnessvendor → Hill Country Herbals (Health & Wellness) — Amarillo
INSERT INTO vendor_profiles (id, user_id, vertical_id, status, tier, profile_data)
SELECT
  gen_random_uuid(),
  au.id,
  'farmers_market',
  'approved',
  'standard',
  jsonb_build_object(
    'business_name', 'Hill Country Herbals',
    'email', 'farmersmarketingapp+wellnessvendor@gmail.com',
    'phone', '806-555-0106',
    'description', 'Small-batch herbal products crafted from organically grown herbs. Our elderberry syrups, herbal teas, and natural skincare are all made by hand in small batches.',
    'address', '405 S Tyler St',
    'city', 'Amarillo',
    'state', 'TX',
    'zip', '79101'
  )
FROM auth.users au
WHERE au.email = 'farmersmarketingapp+wellnessvendor@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM vendor_profiles vp WHERE vp.user_id = au.id AND vp.vertical_id = 'farmers_market'
  );


-- ============================================================================
-- STEP 4: Reassign listings to new vendor_profiles
-- ============================================================================

-- vegvendor1 gets Produce + Dairy & Eggs
UPDATE listings SET vendor_profile_id = (
  SELECT vp.id FROM vendor_profiles vp
  JOIN auth.users au ON au.id = vp.user_id
  WHERE au.email = 'farmersmarketingapp+vegvendor1@gmail.com'
  AND vp.vertical_id = 'farmers_market'
  LIMIT 1
)
WHERE vendor_profile_id IN ('2f19e70f-ddc2-46aa-9513-f72d34a9f630', '60cd01a8-0c30-4fb8-be8c-a26102d2f277', '6be716c9-3531-42a6-a9aa-ac47ac3653e3');

-- cottagevendor1 gets Baked Goods
UPDATE listings SET vendor_profile_id = (
  SELECT vp.id FROM vendor_profiles vp
  JOIN auth.users au ON au.id = vp.user_id
  WHERE au.email = 'farmersmarketingapp+cottagevendor1@gmail.com'
  AND vp.vertical_id = 'farmers_market'
  LIMIT 1
)
WHERE vendor_profile_id = 'e431b20a-0f52-4b47-af4e-6981732480b0';

-- cottagevendor2 gets Prepared Foods
UPDATE listings SET vendor_profile_id = (
  SELECT vp.id FROM vendor_profiles vp
  JOIN auth.users au ON au.id = vp.user_id
  WHERE au.email = 'farmersmarketingapp+cottagevendor2@gmail.com'
  AND vp.vertical_id = 'farmers_market'
  LIMIT 1
)
WHERE vendor_profile_id = '00beac18-be2d-4f1d-90f0-44abfc9fdec3';

-- artgvendor gets Art & Decor + Plants & Flowers
UPDATE listings SET vendor_profile_id = (
  SELECT vp.id FROM vendor_profiles vp
  JOIN auth.users au ON au.id = vp.user_id
  WHERE au.email = 'farmersmarketingapp+artgvendor@gmail.com'
  AND vp.vertical_id = 'farmers_market'
  LIMIT 1
)
WHERE vendor_profile_id IN ('8129c312-f39f-4f09-93c3-5205069fe148', '3c8eba45-a516-4441-a6e1-38451c98b980');

-- fruitvendor gets Meat & Poultry + Pantry/Honey
UPDATE listings SET vendor_profile_id = (
  SELECT vp.id FROM vendor_profiles vp
  JOIN auth.users au ON au.id = vp.user_id
  WHERE au.email = 'farmersmarketingapp+fruitvendor@gmail.com'
  AND vp.vertical_id = 'farmers_market'
  LIMIT 1
)
WHERE vendor_profile_id IN ('1ab86a5b-2b6b-4f63-a776-51e0657d66e2', '399ecb6e-6424-40b5-b90b-4c2247b017bd');

-- wellnessvendor gets Health & Wellness
UPDATE listings SET vendor_profile_id = (
  SELECT vp.id FROM vendor_profiles vp
  JOIN auth.users au ON au.id = vp.user_id
  WHERE au.email = 'farmersmarketingapp+wellnessvendor@gmail.com'
  AND vp.vertical_id = 'farmers_market'
  LIMIT 1
)
WHERE vendor_profile_id = '73e70d37-220a-48cc-8408-9376985da5e4';


-- ============================================================================
-- STEP 5: Set up listing_markets for new markets
-- ============================================================================

-- Canyon market: vegvendor1 + cottagevendor1 listings
INSERT INTO listing_markets (listing_id, market_id)
SELECT l.id, 'a1b2c3d4-1111-4000-8000-000000000001'
FROM listings l
JOIN vendor_profiles vp ON vp.id = l.vendor_profile_id
JOIN auth.users au ON au.id = vp.user_id
WHERE au.email IN ('farmersmarketingapp+vegvendor1@gmail.com', 'farmersmarketingapp+cottagevendor1@gmail.com')
  AND l.deleted_at IS NULL
ON CONFLICT (listing_id, market_id) DO NOTHING;

-- Lubbock market: fruitvendor listings
INSERT INTO listing_markets (listing_id, market_id)
SELECT l.id, 'a1b2c3d4-2222-4000-8000-000000000002'
FROM listings l
JOIN vendor_profiles vp ON vp.id = l.vendor_profile_id
JOIN auth.users au ON au.id = vp.user_id
WHERE au.email = 'farmersmarketingapp+fruitvendor@gmail.com'
  AND l.deleted_at IS NULL
ON CONFLICT (listing_id, market_id) DO NOTHING;

-- Also add Canyon/Lubbock vendors to one Amarillo market for multi-market testing
INSERT INTO listing_markets (listing_id, market_id)
SELECT l.id, '98b55c73-f13c-4f8f-9612-373359440d9f'  -- Amarillo Community Market
FROM listings l
JOIN vendor_profiles vp ON vp.id = l.vendor_profile_id
JOIN auth.users au ON au.id = vp.user_id
WHERE au.email IN (
  'farmersmarketingapp+vegvendor1@gmail.com',
  'farmersmarketingapp+cottagevendor1@gmail.com',
  'farmersmarketingapp+fruitvendor@gmail.com'
)
  AND l.deleted_at IS NULL
ON CONFLICT (listing_id, market_id) DO NOTHING;

-- Amarillo vendors: ensure they're at both Amarillo markets
INSERT INTO listing_markets (listing_id, market_id)
SELECT l.id, m.id
FROM listings l
JOIN vendor_profiles vp ON vp.id = l.vendor_profile_id
JOIN auth.users au ON au.id = vp.user_id
CROSS JOIN markets m
WHERE au.email IN (
  'farmersmarketingapp+cottagevendor2@gmail.com',
  'farmersmarketingapp+artgvendor@gmail.com',
  'farmersmarketingapp+wellnessvendor@gmail.com'
)
  AND l.deleted_at IS NULL
  AND m.id IN ('98b55c73-f13c-4f8f-9612-373359440d9f', 'e33b5b54-f7e7-41ea-b855-43411276021a')
ON CONFLICT (listing_id, market_id) DO NOTHING;


-- ============================================================================
-- STEP 6: Create vendor_market_schedules (vendor attendance at markets)
-- ============================================================================

-- Canyon vendors attend Canyon market schedule
INSERT INTO vendor_market_schedules (vendor_profile_id, market_id, schedule_id, is_active)
SELECT vp.id, 'a1b2c3d4-1111-4000-8000-000000000001', 'b1b2c3d4-1111-4000-8000-000000000001', true
FROM vendor_profiles vp
JOIN auth.users au ON au.id = vp.user_id
WHERE au.email IN ('farmersmarketingapp+vegvendor1@gmail.com', 'farmersmarketingapp+cottagevendor1@gmail.com')
  AND vp.vertical_id = 'farmers_market'
ON CONFLICT (vendor_profile_id, schedule_id) DO NOTHING;

-- Lubbock vendor attends Lubbock market schedule
INSERT INTO vendor_market_schedules (vendor_profile_id, market_id, schedule_id, is_active)
SELECT vp.id, 'a1b2c3d4-2222-4000-8000-000000000002', 'b1b2c3d4-2222-4000-8000-000000000002', true
FROM vendor_profiles vp
JOIN auth.users au ON au.id = vp.user_id
WHERE au.email = 'farmersmarketingapp+fruitvendor@gmail.com'
  AND vp.vertical_id = 'farmers_market'
ON CONFLICT (vendor_profile_id, schedule_id) DO NOTHING;

-- Canyon/Lubbock vendors also attend Amarillo Community Market
INSERT INTO vendor_market_schedules (vendor_profile_id, market_id, schedule_id, is_active)
SELECT vp.id, ms.market_id, ms.id, true
FROM vendor_profiles vp
JOIN auth.users au ON au.id = vp.user_id
CROSS JOIN market_schedules ms
WHERE au.email IN (
  'farmersmarketingapp+vegvendor1@gmail.com',
  'farmersmarketingapp+cottagevendor1@gmail.com',
  'farmersmarketingapp+fruitvendor@gmail.com'
)
  AND vp.vertical_id = 'farmers_market'
  AND ms.market_id = '98b55c73-f13c-4f8f-9612-373359440d9f'
  AND ms.active = true
ON CONFLICT (vendor_profile_id, schedule_id) DO NOTHING;

-- Amarillo vendors attend both Amarillo market schedules
INSERT INTO vendor_market_schedules (vendor_profile_id, market_id, schedule_id, is_active)
SELECT vp.id, ms.market_id, ms.id, true
FROM vendor_profiles vp
JOIN auth.users au ON au.id = vp.user_id
CROSS JOIN market_schedules ms
WHERE au.email IN (
  'farmersmarketingapp+cottagevendor2@gmail.com',
  'farmersmarketingapp+artgvendor@gmail.com',
  'farmersmarketingapp+wellnessvendor@gmail.com'
)
  AND vp.vertical_id = 'farmers_market'
  AND ms.market_id IN ('98b55c73-f13c-4f8f-9612-373359440d9f', 'e33b5b54-f7e7-41ea-b855-43411276021a')
  AND ms.active = true
ON CONFLICT (vendor_profile_id, schedule_id) DO NOTHING;


-- ============================================================================
-- STEP 7: Create vendor_verifications (all 3 gates approved)
-- ============================================================================

-- Update existing vendor_verifications (auto-created by trigger on vendor_profile insert)
UPDATE vendor_verifications vv SET
  status = 'approved',
  submitted_at = now(),
  reviewed_at = now(),
  notes = 'Staging test vendor — all gates auto-approved',
  documents = '[{"filename": "test_business_license", "type": "business_license", "url": "", "uploaded_at": "2026-02-13T00:00:00Z"}]'::jsonb,
  requested_categories = ARRAY(
    SELECT DISTINCT l.category FROM listings l
    WHERE l.vendor_profile_id = vv.vendor_profile_id AND l.deleted_at IS NULL
  ),
  category_verifications = COALESCE(
    (SELECT jsonb_object_agg(
      cat,
      jsonb_build_object('status', 'approved', 'doc_type', 'test_data', 'documents', '[]'::jsonb,
        'reviewed_at', '2026-02-13T00:00:00Z', 'notes', 'Test data - auto-approved')
    )
    FROM (SELECT DISTINCT l.category AS cat FROM listings l
          WHERE l.vendor_profile_id = vv.vendor_profile_id AND l.deleted_at IS NULL) cats),
    '{}'::jsonb
  ),
  coi_status = 'approved',
  coi_verified_at = now(),
  coi_documents = '[{"filename": "test_coi", "url": "", "uploaded_at": "2026-02-13T00:00:00Z"}]'::jsonb,
  prohibited_items_acknowledged_at = now(),
  onboarding_completed_at = now()
WHERE vv.vendor_profile_id IN (
  SELECT vp.id FROM vendor_profiles vp
  JOIN auth.users au ON au.id = vp.user_id
  WHERE au.email IN (
    'farmersmarketingapp+vegvendor1@gmail.com',
    'farmersmarketingapp+cottagevendor1@gmail.com',
    'farmersmarketingapp+cottagevendor2@gmail.com',
    'farmersmarketingapp+artgvendor@gmail.com',
    'farmersmarketingapp+fruitvendor@gmail.com',
    'farmersmarketingapp+wellnessvendor@gmail.com'
  )
  AND vp.vertical_id = 'farmers_market'
);


-- ============================================================================
-- STEP 7b: Enable Stripe payouts (Gate 4) for seed vendors
-- Without this, ListingForm shows "onboarding not complete" because all 4 gates are required.
-- Real vendors complete Stripe Connect — seed vendors get placeholder values.
-- ============================================================================

UPDATE vendor_profiles SET
  stripe_payouts_enabled = true,
  stripe_account_id = 'acct_seed_test_' || SUBSTRING(id::text, 1, 8)
WHERE id IN (
  SELECT vp.id FROM vendor_profiles vp
  JOIN auth.users au ON au.id = vp.user_id
  WHERE au.email IN (
    'farmersmarketingapp+vegvendor1@gmail.com',
    'farmersmarketingapp+cottagevendor1@gmail.com',
    'farmersmarketingapp+cottagevendor2@gmail.com',
    'farmersmarketingapp+artgvendor@gmail.com',
    'farmersmarketingapp+fruitvendor@gmail.com',
    'farmersmarketingapp+wellnessvendor@gmail.com'
  )
  AND vp.vertical_id = 'farmers_market'
)
AND stripe_payouts_enabled = false;


-- ============================================================================
-- STEP 8: Verify jennifer admin account exists and has admin role
-- ============================================================================

UPDATE user_profiles
SET role = 'admin', roles = ARRAY['admin']::user_role[]
WHERE email ILIKE '%jennifer%8fifteenconsulting%';


-- ============================================================================
-- VERIFICATION QUERIES (run after to confirm)
-- ============================================================================

-- Check vendors created
-- SELECT vp.id, au.email, vp.profile_data->>'business_name' as business,
--   vp.status, (SELECT count(*) FROM listings l WHERE l.vendor_profile_id = vp.id AND l.deleted_at IS NULL) as listings
-- FROM vendor_profiles vp
-- JOIN auth.users au ON au.id = vp.user_id
-- WHERE vp.vertical_id = 'farmers_market'
-- ORDER BY au.email;

-- Check market assignments
-- SELECT m.name, m.city, count(lm.listing_id) as listings
-- FROM markets m
-- LEFT JOIN listing_markets lm ON lm.market_id = m.id
-- GROUP BY m.id, m.name, m.city
-- ORDER BY m.name;
