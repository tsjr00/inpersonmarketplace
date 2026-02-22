# Migration Application Log

## Legend
- ✅ Applied successfully
- ❌ Failed / Not yet applied
- 🔄 In progress
- ⚠️ Needs attention

---

## Current Status

| Migration File | Dev Status | Dev Date | Staging Status | Staging Date | Notes |
|----------------|------------|----------|----------------|--------------|-------|
| 20260103_001_initial_schema.sql | ✅ | 2026-01-03 | ✅ | 2026-01-03 | Initial 11 tables, enums, indexes |
| 20260103_002_rls_policies.sql | ✅ | 2026-01-03 | ✅ | 2026-01-03 | Row Level Security policies |
| 20260103_003_functions_triggers.sql | ✅ | 2026-01-03 | ✅ | 2026-01-03 | Auto-update timestamps |
| 20260103_004_seed_data.sql | ✅ | 2026-01-03 | ✅ | 2026-01-03 | Seed fireworks + farmers_market |
| 20260104_001_allow_anonymous_vendors.sql | ✅ | 2026-01-04 | ✅ | 2026-01-04 | Remove vendor_owner_check constraint |
| 20260104_002_remove_permit_years.sql | ✅ | 2026-01-04 | ✅ | 2026-01-04 | Remove permit_years from fireworks config |
| 20260104_003_vendor_vertical_constraint.sql | ✅ | 2026-01-05 | ✅ | 2026-01-05 | Unique constraint on (user_id, vertical_id) |
| 20260105_152200_001_user_profile_trigger.sql | ⚠️ | 2026-01-05 | ❌ | - | Applied but BROKEN - wrong column name |
| 20260105_152230_002_user_profiles_rls.sql | ✅ | 2026-01-05 | ❌ | - | RLS policies for user_profiles |
| 20260105_180000_001_fix_user_profile_trigger.sql | ✅ | 2026-01-05 | ✅ | 2026-01-05 | FIX: use display_name not full_name |
| 20260106_093233_001_add_branding_to_verticals.sql | ❌ | - | ❌ | - | Add comments and GIN index for config |
| 20260106_093233_002_seed_vertical_branding.sql | ❌ | - | ❌ | - | Seed branding data for verticals |
| 20260109_204341_001_orders_and_payments.sql | ✅ | 2026-01-09 20:43 | ✅ | 2026-01-09 21:15 | Phase 3: Core commerce tables |
| 20260114_001_phase_k1_markets_tables.sql | ✅ | 2026-01-14 | ❌ | - | Phase K-1: Markets tables, schedules, vendor-market links |
| 20260114_002_phase_k1_listings_market_link.sql | ✅ | 2026-01-14 | ❌ | - | Phase K-1: listing_markets join table |
| 20260115_001_add_markets_active_column.sql | ✅ | 2026-01-15 | ❌ | - | Add active flag to markets |
| 20260115_002_add_markets_contact_email.sql | ✅ | 2026-01-15 | ❌ | - | Add contact_email to markets |
| 20260115_003_add_vendor_profile_image.sql | ✅ | 2026-01-15 | ❌ | - | Add profile_image_url to vendor_profiles |
| 20260115_004_add_vendor_profile_fields.sql | ✅ | 2026-01-15 | ❌ | - | Add tier, has_completed_setup to vendor_profiles |
| 20260116_001_add_user_verticals.sql | ✅ | 2026-01-16 | ❌ | - | Phase J: User verticals for multi-vertical support |
| 20260116_002_add_buyer_tier.sql | ✅ | 2026-01-16 | ❌ | - | Phase J: Buyer premium tier support |
| 20260116_003_buyer_pickup_confirmation.sql | ✅ | 2026-01-16 | ❌ | - | Phase J-1: buyer_confirmed_at, pickup_confirmed_at |
| 20260116_004_order_cancellation_support.sql | ✅ | 2026-01-16 | ❌ | - | Phase J-2: Cancellation tracking fields |
| 20260116_005_order_expiration.sql | ✅ | 2026-01-16 | ❌ | - | Phase J-3: Order expiration based on pickup date |
| 20260126_006_fix_markets_buyer_access.sql | ⚠️ | ? | ❌ | - | Needs verification |
| 20260126_007_cleanup_order_policies.sql | ⚠️ | ? | ❌ | - | Needs verification |
| 20260130_011_fix_orders_rls_recursion.sql | ⚠️ | ? | ❌ | - | Needs verification |
| 20260203_001_security_fixes.sql | ⚠️ | ? | ❌ | - | Needs verification |
| 20260203_002_fix_admin_helper_functions.sql | ✅ | 2026-02-03 | ❌ | - | Fixed is_platform_admin(), added admin helper functions |
| 20260203_003_add_vertical_admin_rls_support.sql | ✅ | 2026-02-03 | ❌ | - | Vertical admin RLS for 14 tables |
| 20260203_004_fix_market_box_trigger_column_name.sql | ✅ | 2026-02-03 | ❌ | - | Fix trigger: is_active → active |
| 20260204_001_zip_codes_table.sql | ✅ | 2026-02-04 | ❌ | - | 33k+ US ZIP codes with coordinates |
| 20260205_001_pickup_scheduling_schema.sql | ✅ | 2026-02-05 | ❌ | - | schedule_id, pickup_date, pickup_snapshot columns |
| 20260205_002_pickup_scheduling_functions.sql | ✅ | 2026-02-05 | ❌ | - | get_available_pickup_dates(), validate_cart_item_schedule() |
| 20260205_003_fix_cutoff_threshold.sql | ✅ | 2026-02-05 | ❌ | - | Added cutoff_hours to function output |
| 20260206_001_atomic_inventory_decrement.sql | ✅ | 2026-02-06 | ✅ | 2026-02-06 | Atomic inventory decrement function (race condition fix) |
| 20260208_001_market_box_mutual_confirmation.sql | ✅ | 2026-02-08 | ✅ | 2026-02-08 | 3 confirmation columns on market_box_pickups |
| 20260209_001_add_performance_indexes.sql | ✅ | 2026-02-09 | ✅ | 2026-02-09 | 10 performance indexes across 5 tables |
| 20260209_002_merge_duplicate_select_policies.sql | ✅ | 2026-02-09 | ✅ | 2026-02-09 | Merged admin+regular SELECT policies on 6 tables |
| 20260209_003_merge_markets_select_policies.sql | ✅ | 2026-02-09 | ✅ | 2026-02-09 | Merged markets SELECT policies into single comprehensive policy |
| 20260209_004_drop_remaining_old_policies.sql | ✅ | 2026-02-09 | ✅ | 2026-02-09 | Dropped old duplicate policies on 6 tables |
| 20260209_006_vendor_cancellation_tracking.sql | ✅ | 2026-02-09 | ✅ | 2026-02-09 | Vendor cancellation tracking: 3 columns + 2 RPC functions |
| 20260209_007_vendor_documents_storage.sql | ✅ | 2026-02-09 | ✅ | 2026-02-09 | vendor-documents storage bucket (10MB, PDF/JPG/PNG) + RLS policies |
| 20260213_021_grandfather_vendor_verifications.sql | ✅ | 2026-02-13 | ✅ | 2026-02-13 | Grandfather verification records for existing FM vendors; fix sync_verification_status() search_path |
| 20260213_022_add_vendor_stripe_subscription_id.sql | ✅ | 2026-02-13 | ✅ | 2026-02-13 | Add missing stripe_subscription_id to vendor_profiles; fix test vendor tier |
| 20260217_024_add_quantity_measurement.sql | ✅ | 2026-02-17 | ✅ | 2026-02-17 | Add quantity_amount (NUMERIC) + quantity_unit (TEXT) to listings and market_box_offerings; CHECK constraint on publish. Also applied to Prod. |
| FOOD_TRUCK_FAQ_SEED.sql | ✅ | 2026-02-17 | ✅ | 2026-02-17 | 15 FAQ articles for food_trucks vertical in knowledge_articles. Also applied to Prod. |
| 20260217_025_rename_fireworks_vertical.sql | ✅ | 2026-02-17 | ✅ | 2026-02-17 | Rename vertical_id 'fireworks' → 'fire_works' in verticals + all child tables. Applied to all 3 envs. |
| 20260217_026_vertical_premium_triggers.sql | ✅ | 2026-02-17 | ✅ | 2026-02-17 | Per-vertical buyer premium: vertical-aware triggers, market box regression fix, verticals config. Applied to all 3 envs. |
| 20260217_027_expand_vendor_tier_check_constraint.sql | ✅ | 2026-02-17 | ✅ | 2026-02-17 | Expand tier CHECK to include basic/pro/boss (FT tiers); migrate existing FT vendors to basic. |
| 20260217_028_add_preferred_pickup_time.sql | ✅ | 2026-02-17 | ✅ | 2026-02-17 | Add preferred_pickup_time TIME to cart_items + order_items. Applied to all 3 envs. |
| 20260217_029_add_tip_columns.sql | ✅ | 2026-02-17 | ✅ | 2026-02-17 | Add tip_percentage (smallint) + tip_amount (integer) to orders. Applied to all 3 envs. |
| 20260218_032_ft_vendor_attendance_hours.sql | ✅ | 2026-02-18 | ✅ | 2026-02-18 | Add vendor_start_time/end_time to vms, backfill FT attendance, rewrite SQL function with attendance filter. Prod needed unique constraint added first. Applied to all 3 envs. |
| 20260218_031_fix_ft_cutoff_hours_override.sql | ✅ | 2026-02-18 | ✅ | 2026-02-18 | Fix COALESCE bug: FT always gets cutoff=0 regardless of DB value. Applied to all 3 envs. |
| 20260218_030_ft_same_day_ordering.sql | ✅ | 2026-02-18 | ✅ | 2026-02-18 | FT-aware get_available_pickup_dates(): today-only, accept until end_time, cutoff=0. Applied to all 3 envs. |
| 20260218_033_add_free_ft_tier.sql | ✅ | 2026-02-18 | ✅ | 2026-02-18 | Expand tier CHECK to include 'free'; auto-set trigger for new FT vendors. Applied to all 3 envs. |
| 20260218_034_vendor_favorites.sql | ✅ | 2026-02-18 | ✅ | 2026-02-18 | New vendor_favorites table with RLS for shopper favorites. Applied to all 3 envs. |
| 20260218_035_market_box_type.sql | ✅ | 2026-02-18 | ✅ | 2026-02-18 | Add box_type TEXT column to market_box_offerings for FT Chef Box categories. Applied to all 3 envs. |
| 20260219_036_enforce_listing_tier_limits.sql | ✅ | 2026-02-19 | ✅ | 2026-02-19 | BEFORE INSERT/UPDATE trigger enforcing vendor tier listing limits. Applied to all 3 envs. |
| 20260219_035_add_payout_status_enum_values.sql | ✅ | 2026-02-19 | ✅ | 2026-02-19 | Add skipped_dev + pending_stripe_setup to payout_status enum. Applied to all 3 envs. |
| 20260219_037_market_box_payout_support.sql | ✅ | 2026-02-19 | ✅ | 2026-02-19 | Make vendor_payouts.order_item_id nullable, add market_box_pickup_id FK. Applied to all 3 envs. |
| 20260220_038_fix_listing_tier_trigger_status.sql | ✅ | 2026-02-20 | ✅ | 2026-02-20 | Fix tier trigger to check 'published' not 'active'. Applied to all 3 envs. |
| 20260221_039_add_event_market_type.sql | ✅ | 2026-02-21 | ✅ | 2026-02-21 | Add 'event' market_type + event date columns. Applied to Staging & Prod. |
| 20260221_040_event_availability_function.sql | ✅ | 2026-02-21 | ✅ | 2026-02-21 | Rewrite get_available_pickup_dates() with event support. Applied to Staging & Prod. |
| 20260220_041_add_tip_on_platform_fee.sql | ✅ | 2026-02-20 | ✅ | 2026-02-20 | Add tip_on_platform_fee_cents to orders. Applied to all 3 envs. |
| 20260220_042_fix_remaining_security_definer_search_paths.sql | ✅ | 2026-02-20 | ✅ | 2026-02-20 | SET search_path=public on 11 SECURITY DEFINER functions. Applied to all 3 envs. |
| 20260220_043_vendor_payout_unique_constraint.sql | ✅ | 2026-02-20 | ✅ | 2026-02-20 | Partial unique index on vendor_payouts(order_item_id). Applied to all 3 envs. |
| 20260221_046_supabase_linter_fixes.sql | ✅ | 2026-02-21 | ✅ | 2026-02-21 | Merged 9 overlapping permissive policies, dropped 4 duplicate indexes, added 18 FK indexes, dropped 4 legacy indexes. Applied to all 3 envs. |
| 20260222_047_vendor_quality_checks.sql | ✅ | 2026-02-22 | ✅ | 2026-02-22 | Vendor quality checks tables + cron. Applied to all 3 envs. |
| 20260222_048_buyer_search_log.sql | ✅ | 2026-02-22 | ✅ | 2026-02-22 | Buyer search log table for geographic intelligence. Applied to all 3 envs. |
| 20260222_049_scan_vendor_activity_validation.sql | ✅ | 2026-02-22 | ✅ | 2026-02-22 | Add vertical_id validation to scan_vendor_activity(). Applied to all 3 envs. |
| 20260222_050_fix_notifications_user_id_fk.sql | ✅ | 2026-02-22 | ✅ | 2026-02-22 | Fix notifications.user_id FK → auth.users(id). Rewrite trigger. Applied to all 3 envs. |
| 20260222_051_fix_ft_seed_onboarding_gates.sql | ✅ | 2026-02-22 | ✅ | 2026-02-22 | Fix FT seed vendor onboarding gates 2 & 4. Data-only. Applied to Dev & Staging. |

---

## Pending Migrations (Not Yet Applied to Staging)

| Migration File | Target Environments | Priority | Notes |
|----------------|---------------------|----------|-------|
| (None currently pending) | - | - | All migrations applied to all 3 envs as of 2026-02-20 |

---

## Failed/Rolled Back Migrations

| Migration File | Environment | Date | Reason | Resolution |
|----------------|-------------|------|--------|------------|
| [None yet] | - | - | - | - |

---

## Notes
- **Dev project:** vawpviatqalicckkqchs (InPersonMarketplace)
- **Staging project:** vfknvsxfgcwqmlkuzhnq (InPersonMarketplace-Staging)
- **Process:** Always apply to Dev first, test, then apply to Staging
- **Update this log:** Immediately after applying each migration
- **Last verified sync:** 2026-02-05 (Dev verified via schema queries)

---

## Environment Sync Status

### Current State: ✅ DEV UP TO DATE (as of 2026-02-05)
- Dev: Updated through pickup scheduling (20260205_003)
- Staging: Significantly behind - needs many migrations

### Recent Additions (2026-02-05)
- **Pickup Scheduling:** Buyers select specific pickup dates, not just locations
  - schedule_id, pickup_date, pickup_snapshot columns on order_items
  - get_available_pickup_dates() function with cutoff calculation
  - **IMPORTANT:** pickup_start_time/pickup_end_time do NOT exist - use pickup_snapshot
- **ZIP Codes:** 33k+ US ZIP codes for geographic search
- **Admin Functions:** Fixed is_platform_admin(), added vertical admin support

### Migrations Needing Verification (⚠️)
These files exist but we're unsure if they were applied via SQL Editor:
1. 20260126_006_fix_markets_buyer_access.sql
2. 20260126_007_cleanup_order_policies.sql
3. 20260130_011_fix_orders_rls_recursion.sql
4. 20260203_001_security_fixes.sql

### Action Required
1. ❌ Verify the 4 uncertain migrations above
2. ❌ Apply all 2026-02+ migrations to Staging
3. ❌ Keep this log updated after each migration

---

## Migration Standards Reference
See `MIGRATION_STANDARDS.md` for:
- File naming conventions (with timestamps)
- Required header format
- Application workflow
- Versioning rules
- Tracking procedures
