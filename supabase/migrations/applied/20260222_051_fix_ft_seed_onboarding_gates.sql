-- ============================================================================
-- Migration 051: Fix FT seed vendor onboarding gates 2 & 4
-- ============================================================================
-- Problem: FT seed data stored cuisine categories ('Asian', 'BBQ & Smoked')
-- in category_verifications, but the app checks for permit doc types
-- (mfu_permit, cfm_certificate, food_handler_card, fire_safety_certificate).
-- Gate 2 fails → canPublishListings=false → edit page shows "Draft"
-- while listing card shows "Published" (from DB status). Conflicting display.
--
-- Also: stripe_payouts_enabled was never set → gate 4 fails too.
--
-- Fix: Update category_verifications with correct permit doc type keys,
-- and set stripe_payouts_enabled for all 3 seed vendors.
-- Only affects staging seed data. No production impact.
-- ============================================================================

-- Correct permit doc types for FT gate 2
-- Required: mfu_permit, cfm_certificate, food_handler_card, fire_safety_certificate
-- Optional: commissary_agreement (not required, omit)

-- Truck 1: Fuego Street Tacos
UPDATE vendor_verifications SET
  category_verifications = jsonb_build_object(
    'mfu_permit', jsonb_build_object('status', 'approved', 'doc_type', 'mfu_permit', 'documents', '[]'::jsonb, 'reviewed_at', now()::text, 'notes', 'Seed data'),
    'cfm_certificate', jsonb_build_object('status', 'approved', 'doc_type', 'cfm_certificate', 'documents', '[]'::jsonb, 'reviewed_at', now()::text, 'notes', 'Seed data'),
    'food_handler_card', jsonb_build_object('status', 'approved', 'doc_type', 'food_handler_card', 'documents', '[]'::jsonb, 'reviewed_at', now()::text, 'notes', 'Seed data'),
    'fire_safety_certificate', jsonb_build_object('status', 'approved', 'doc_type', 'fire_safety_certificate', 'documents', '[]'::jsonb, 'reviewed_at', now()::text, 'notes', 'Seed data')
  )
WHERE vendor_profile_id = '64e94218-5a9e-4fb4-a15b-9e1b65bd7597';

-- Truck 2: Smokestack BBQ
UPDATE vendor_verifications SET
  category_verifications = jsonb_build_object(
    'mfu_permit', jsonb_build_object('status', 'approved', 'doc_type', 'mfu_permit', 'documents', '[]'::jsonb, 'reviewed_at', now()::text, 'notes', 'Seed data'),
    'cfm_certificate', jsonb_build_object('status', 'approved', 'doc_type', 'cfm_certificate', 'documents', '[]'::jsonb, 'reviewed_at', now()::text, 'notes', 'Seed data'),
    'food_handler_card', jsonb_build_object('status', 'approved', 'doc_type', 'food_handler_card', 'documents', '[]'::jsonb, 'reviewed_at', now()::text, 'notes', 'Seed data'),
    'fire_safety_certificate', jsonb_build_object('status', 'approved', 'doc_type', 'fire_safety_certificate', 'documents', '[]'::jsonb, 'reviewed_at', now()::text, 'notes', 'Seed data')
  )
WHERE vendor_profile_id = '48c865c8-07d5-46f9-92aa-de5991fb1918';

-- Truck 3: Bao Down
UPDATE vendor_verifications SET
  category_verifications = jsonb_build_object(
    'mfu_permit', jsonb_build_object('status', 'approved', 'doc_type', 'mfu_permit', 'documents', '[]'::jsonb, 'reviewed_at', now()::text, 'notes', 'Seed data'),
    'cfm_certificate', jsonb_build_object('status', 'approved', 'doc_type', 'cfm_certificate', 'documents', '[]'::jsonb, 'reviewed_at', now()::text, 'notes', 'Seed data'),
    'food_handler_card', jsonb_build_object('status', 'approved', 'doc_type', 'food_handler_card', 'documents', '[]'::jsonb, 'reviewed_at', now()::text, 'notes', 'Seed data'),
    'fire_safety_certificate', jsonb_build_object('status', 'approved', 'doc_type', 'fire_safety_certificate', 'documents', '[]'::jsonb, 'reviewed_at', now()::text, 'notes', 'Seed data')
  )
WHERE vendor_profile_id = '802ad912-a8ea-459a-bd9a-f60c75c3c6d4';

-- Gate 4: Enable Stripe payouts for seed vendors
-- Uses a placeholder account ID so stripe_account_id is non-null
UPDATE vendor_profiles SET
  stripe_payouts_enabled = true,
  stripe_account_id = COALESCE(stripe_account_id, 'acct_seed_' || LEFT(id::text, 8))
WHERE id IN (
  '64e94218-5a9e-4fb4-a15b-9e1b65bd7597',
  '48c865c8-07d5-46f9-92aa-de5991fb1918',
  '802ad912-a8ea-459a-bd9a-f60c75c3c6d4'
);
