-- ============================================================================
-- FOOD TRUCK SEED DATA — PART A: Profiles, Verifications, Markets
-- Run on: Staging Supabase (vfknvs...) ONLY
-- Run this FIRST, then run PART B
-- ============================================================================

-- STEP 1: Update existing vendor profiles with full data
UPDATE vendor_profiles SET
  tier = 'basic',
  profile_data = jsonb_build_object(
    'business_name', 'Fuego Street Tacos',
    'legal_name', 'Fuego Food LLC',
    'email', 'foodtrucknapp+truck1@gmail.com',
    'phone', '806-555-2001',
    'description', 'Authentic street tacos and Mexican favorites made from scratch daily. We slow-cook our meats overnight and make our tortillas fresh on the truck. Family recipes from Oaxaca with a Texas twist.',
    'address', '2810 SW 6th Ave',
    'city', 'Amarillo',
    'state', 'TX',
    'zip', '79106',
    'vendor_type', jsonb_build_array('Mexican / Latin')
  ),
  description = 'Authentic street tacos and Mexican favorites made from scratch daily. Family recipes from Oaxaca with a Texas twist.',
  approved_at = COALESCE(approved_at, now() - interval '30 days'),
  last_active_at = now() - interval '1 day'
WHERE id = '64e94218-5a9e-4fb4-a15b-9e1b65bd7597';

UPDATE vendor_profiles SET
  tier = 'pro',
  profile_data = jsonb_build_object(
    'business_name', 'Smokestack BBQ',
    'legal_name', 'Smokestack Barbecue Inc.',
    'email', 'foodtrucknapp+truck2@gmail.com',
    'phone', '806-555-2002',
    'description', 'Low and slow Texas-style BBQ smoked over post oak for 14+ hours. Brisket, ribs, pulled pork, and all the classic sides. We started competing on the circuit in 2019 and brought our award-winning recipes to the street.',
    'address', '4415 S Georgia St',
    'city', 'Amarillo',
    'state', 'TX',
    'zip', '79110',
    'vendor_type', jsonb_build_array('BBQ & Smoked')
  ),
  description = 'Low and slow Texas-style BBQ smoked over post oak for 14+ hours. Award-winning brisket, ribs, and all the classic sides.',
  approved_at = COALESCE(approved_at, now() - interval '60 days'),
  last_active_at = now() - interval '2 days'
WHERE id = '48c865c8-07d5-46f9-92aa-de5991fb1918';

UPDATE vendor_profiles SET
  tier = 'boss',
  profile_data = jsonb_build_object(
    'business_name', 'Bao Down',
    'legal_name', 'Bao Down Food Co.',
    'email', 'foodtrucknapp+truck3@gmail.com',
    'phone', '806-555-2003',
    'description', 'Asian street food meets West Texas. Fluffy steamed bao buns, crispy rice bowls, and hand-folded dumplings made fresh to order. We source local beef and pork from Panhandle ranches and pair them with house-made sauces and pickled vegetables.',
    'address', '7200 W Interstate 40',
    'city', 'Amarillo',
    'state', 'TX',
    'zip', '79106',
    'vendor_type', jsonb_build_array('Asian', 'Fusion')
  ),
  description = 'Asian street food meets West Texas. Fluffy bao buns, crispy rice bowls, and hand-folded dumplings made fresh to order.',
  approved_at = COALESCE(approved_at, now() - interval '90 days'),
  last_active_at = now() - interval '1 day'
WHERE id = '802ad912-a8ea-459a-bd9a-f60c75c3c6d4';


-- STEP 2: Approve vendor verifications (all gates)
UPDATE vendor_verifications SET
  status = 'approved',
  submitted_at = now(),
  reviewed_at = now(),
  notes = 'Staging seed - all gates auto-approved',
  documents = jsonb_build_array(jsonb_build_object('filename', 'food_handler_permit.pdf', 'type', 'food_handler_permit', 'url', '', 'uploaded_at', '2026-02-20T00:00:00Z')),
  requested_categories = ARRAY['Mexican / Latin'],
  category_verifications = jsonb_build_object('Mexican / Latin', jsonb_build_object('status', 'approved', 'doc_type', 'food_handler_permit', 'documents', jsonb_build_array(), 'reviewed_at', '2026-02-20T00:00:00Z', 'notes', 'Seed data')),
  coi_status = 'approved',
  coi_verified_at = now(),
  coi_documents = jsonb_build_array(jsonb_build_object('filename', 'coi_2026.pdf', 'url', '', 'uploaded_at', '2026-02-20T00:00:00Z')),
  prohibited_items_acknowledged_at = now(),
  onboarding_completed_at = now()
WHERE vendor_profile_id = '64e94218-5a9e-4fb4-a15b-9e1b65bd7597';

UPDATE vendor_verifications SET
  status = 'approved',
  submitted_at = now(),
  reviewed_at = now(),
  notes = 'Staging seed - all gates auto-approved',
  documents = jsonb_build_array(jsonb_build_object('filename', 'food_handler_permit.pdf', 'type', 'food_handler_permit', 'url', '', 'uploaded_at', '2026-02-20T00:00:00Z')),
  requested_categories = ARRAY['BBQ & Smoked'],
  category_verifications = jsonb_build_object('BBQ & Smoked', jsonb_build_object('status', 'approved', 'doc_type', 'food_handler_permit', 'documents', jsonb_build_array(), 'reviewed_at', '2026-02-20T00:00:00Z', 'notes', 'Seed data')),
  coi_status = 'approved',
  coi_verified_at = now(),
  coi_documents = jsonb_build_array(jsonb_build_object('filename', 'coi_2026.pdf', 'url', '', 'uploaded_at', '2026-02-20T00:00:00Z')),
  prohibited_items_acknowledged_at = now(),
  onboarding_completed_at = now()
WHERE vendor_profile_id = '48c865c8-07d5-46f9-92aa-de5991fb1918';

UPDATE vendor_verifications SET
  status = 'approved',
  submitted_at = now(),
  reviewed_at = now(),
  notes = 'Staging seed - all gates auto-approved',
  documents = jsonb_build_array(jsonb_build_object('filename', 'food_handler_permit.pdf', 'type', 'food_handler_permit', 'url', '', 'uploaded_at', '2026-02-20T00:00:00Z')),
  requested_categories = ARRAY['Asian', 'Fusion'],
  category_verifications = jsonb_build_object(
    'Asian', jsonb_build_object('status', 'approved', 'doc_type', 'food_handler_permit', 'documents', jsonb_build_array(), 'reviewed_at', '2026-02-20T00:00:00Z', 'notes', 'Seed data'),
    'Fusion', jsonb_build_object('status', 'approved', 'doc_type', 'food_handler_permit', 'documents', jsonb_build_array(), 'reviewed_at', '2026-02-20T00:00:00Z', 'notes', 'Seed data')
  ),
  coi_status = 'approved',
  coi_verified_at = now(),
  coi_documents = jsonb_build_array(jsonb_build_object('filename', 'coi_2026.pdf', 'url', '', 'uploaded_at', '2026-02-20T00:00:00Z')),
  prohibited_items_acknowledged_at = now(),
  onboarding_completed_at = now()
WHERE vendor_profile_id = '802ad912-a8ea-459a-bd9a-f60c75c3c6d4';


-- STEP 3: Create 3 food truck parks
INSERT INTO markets (id, name, market_type, address, city, state, zip, vertical_id, status, active, timezone, cutoff_hours, description)
VALUES
  ('f1000000-0001-4000-8000-000000000001', 'Sixth Street Food Park', 'traditional',
   '600 S Tyler St', 'Amarillo', 'TX', '79101', 'food_trucks', 'active', true,
   'America/Chicago', 0, 'Amarillo''s premier food truck park featuring rotating trucks every week. Covered seating, live music on weekends.'),
  ('f1000000-0002-4000-8000-000000000002', 'Canyon Town Square Eats', 'traditional',
   '1500 4th Ave', 'Canyon', 'TX', '79015', 'food_trucks', 'active', true,
   'America/Chicago', 0, 'Weekly food truck rally on the square. Family-friendly with picnic tables and a kids'' play area.'),
  ('f1000000-0003-4000-8000-000000000003', 'Hub City Food Truck Lot', 'traditional',
   '1901 Buddy Holly Ave', 'Lubbock', 'TX', '79401', 'food_trucks', 'active', true,
   'America/Chicago', 0, 'Lubbock''s go-to food truck lot near the Buddy Holly Center. Open lot with string lights and yard games.')
ON CONFLICT (id) DO NOTHING;


-- STEP 4: Create market schedules
INSERT INTO market_schedules (id, market_id, day_of_week, start_time, end_time, active)
VALUES
  ('f2000000-0001-4000-8000-000000000001', 'f1000000-0001-4000-8000-000000000001', 5, '17:00', '22:00', true),
  ('f2000000-0002-4000-8000-000000000002', 'f1000000-0001-4000-8000-000000000001', 6, '11:00', '21:00', true),
  ('f2000000-0003-4000-8000-000000000003', 'f1000000-0002-4000-8000-000000000002', 6, '11:00', '15:00', true),
  ('f2000000-0004-4000-8000-000000000004', 'f1000000-0003-4000-8000-000000000003', 4, '17:00', '21:00', true),
  ('f2000000-0005-4000-8000-000000000005', 'f1000000-0003-4000-8000-000000000003', 6, '11:00', '20:00', true)
ON CONFLICT (id) DO NOTHING;


-- STEP 5: Enable Stripe payouts (Gate 4) for seed vendors
-- Without this, ListingForm shows "onboarding not complete" because all 4 gates are required.
-- Real vendors complete Stripe Connect — seed vendors get placeholder values.
UPDATE vendor_profiles SET
  stripe_payouts_enabled = true,
  stripe_account_id = 'acct_seed_test_fuego'
WHERE id = '64e94218-5a9e-4fb4-a15b-9e1b65bd7597' AND stripe_payouts_enabled = false;

UPDATE vendor_profiles SET
  stripe_payouts_enabled = true,
  stripe_account_id = 'acct_seed_test_smokestack'
WHERE id = '48c865c8-07d5-46f9-92aa-de5991fb1918' AND stripe_payouts_enabled = false;

UPDATE vendor_profiles SET
  stripe_payouts_enabled = true,
  stripe_account_id = 'acct_seed_test_baodown'
WHERE id = '802ad912-a8ea-459a-bd9a-f60c75c3c6d4' AND stripe_payouts_enabled = false;


-- VERIFICATION: Run this after Part A to confirm everything worked
SELECT vp.id, vp.profile_data->>'business_name' as truck, vp.tier, vv.status as verification,
  vp.stripe_payouts_enabled as stripe_ok
FROM vendor_profiles vp
LEFT JOIN vendor_verifications vv ON vv.vendor_profile_id = vp.id
WHERE vp.id IN (
  '64e94218-5a9e-4fb4-a15b-9e1b65bd7597',
  '48c865c8-07d5-46f9-92aa-de5991fb1918',
  '802ad912-a8ea-459a-bd9a-f60c75c3c6d4'
);
