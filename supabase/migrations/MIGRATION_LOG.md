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
| 20260221_039_add_event_market_type.sql | ✅ | 2026-02-21 | ✅ | 2026-02-21 | Add 'event' market_type + event date columns. Applied to all 3 envs (Prod applied 2026-03-07 — was missing, caused schedule bug). |
| 20260221_040_event_availability_function.sql | ✅ | 2026-02-21 | ✅ | 2026-02-21 | ⚠️ **SUPERSEDED by 054.** Rewrite get_available_pickup_dates() with event support. Applied to all 3 envs. Prod re-applied 2026-03-07 out of order, accidentally reverting 054's timezone fix (CURRENT_DATE→local_today). Function now managed by migration 079. |
| 20260220_041_add_tip_on_platform_fee.sql | ✅ | 2026-02-20 | ✅ | 2026-02-20 | Add tip_on_platform_fee_cents to orders. Applied to all 3 envs. |
| 20260220_042_fix_remaining_security_definer_search_paths.sql | ✅ | 2026-02-20 | ✅ | 2026-02-20 | SET search_path=public on 11 SECURITY DEFINER functions. Applied to all 3 envs. |
| 20260220_043_vendor_payout_unique_constraint.sql | ✅ | 2026-02-20 | ✅ | 2026-02-20 | Partial unique index on vendor_payouts(order_item_id). Applied to all 3 envs. |
| 20260221_046_supabase_linter_fixes.sql | ✅ | 2026-02-21 | ✅ | 2026-02-21 | Merged 9 overlapping permissive policies, dropped 4 duplicate indexes, added 18 FK indexes, dropped 4 legacy indexes. Applied to all 3 envs. |
| 20260222_047_vendor_quality_checks.sql | ✅ | 2026-02-22 | ✅ | 2026-02-22 | Vendor quality checks tables + cron. Applied to all 3 envs (Prod applied 2026-03-07 — was missing). |
| 20260304_068_user_agreement_acceptances.sql | ✅ | 2026-03-04 | ✅ | 2026-03-04 | user_agreement_acceptances table for legal agreement tracking. RLS: self-select + self-insert. Applied to all 3 envs. |
| 20260307_071_catering_help_articles.sql | ✅ | 2026-03-07 | ✅ | 2026-03-07 | 6 vendor catering help articles under "For Food Truck Operators". Data only. Applied to all 3 envs. |
| 20260307_070_corporate_catering.sql | ✅ | 2026-03-07 | ✅ | 2026-03-07 | New `catering_requests` table + columns on `markets` (catering_request_id, headcount) and `market_vendors` (response_status, response_notes, invited_at). RLS, indexes, trigger. Applied to all 3 envs. |
| 20260325_099_update_sales_tax_help_article.sql | ✅ | 2026-03-25 | ✅ | 2026-03-25 | Rewrite sales tax help article: platform is marketplace facilitator, handles tax collection/remittance. Updated vendor responsibilities, retention language. Applied to all 3 envs. Session 63. |
| 20260326_100_event_request_fields.sql | ✅ | 2026-03-26 | ✅ | 2026-03-26 | Event request fields v1: event_type, payment_model, budget, meals, beverages, dessert, recurring. Applied to all 3 envs. Session 63. |
| 20260326_101_event_form_fields_v2.sql | ✅ | 2026-03-26 | ✅ | 2026-03-26 | Event fields v2: per_meal_budget, competing_food, is_ticketed, dwell_hours. Applied to all 3 envs. Session 63. |
| 20260327_102_self_service_events.sql | ✅ | 2026-03-27 | ✅ | 2026-03-27 | Self-service: service_level, auto_invite_sent_at, organizer_user_id, vendor_preferences. Applied to all 3 envs. Session 63. |
| 20260327_103_event_backup_vendors.sql | ✅ | 2026-03-27 | ✅ | 2026-03-27 | Backup vendors: is_backup, backup_priority, replaced_vendor_id on market_vendors. Applied to all 3 envs. Session 63. |
| 20260329_104_event_form_considerations.sql | ✅ | 2026-03-29 | ✅ | 2026-03-29 | Event considerations: children_present, is_themed, theme_description, has_competing_vendors, estimated_spend, preferred_vendor_categories. Applied to all 3 envs. Session 65. |
| 20260330_105_event_date_range_in_pickup_dates.sql | ✅ | 2026-03-30 | ✅ | 2026-03-30 | Fix get_available_pickup_dates() to include event date ranges beyond 8-day window. Applied to all 3 envs. Session 66. |
| 20260330_106_event_vendor_order_caps.sql | ✅ | 2026-03-30 | ✅ | 2026-03-30 | event_max_orders_total + event_max_orders_per_wave on market_vendors. Applied to all 3 envs. Session 66. |
| 20260331_107_replaced_vendor_fk.sql | ✅ | 2026-03-31 | ✅ | 2026-03-31 | FK: market_vendors.replaced_vendor_id → vendor_profiles. Applied to all 3 envs. Session 67. |
| 20260331_108_day_of_sales_and_vendor_stay.sql | ✅ | 2026-03-31 | ✅ | 2026-03-31 | event_allow_day_of_orders on markets, vendor_stay_policy on catering_requests. Applied to all 3 envs. Session 67. |
| 20260331_109_day_of_cutoff_function.sql | ✅ | 2026-03-31 | ✅ | 2026-03-31 | Day-of event ordering in get_available_pickup_dates(). Applied to all 3 envs. Session 67. |
| 20260403_110_event_waves_schema.sql | ✅ | 2026-04-03 | ✅ | 2026-04-03 | 3 new tables (event_waves, event_wave_reservations, event_company_payments) + columns on markets/orders/order_items. Applied to all 3 envs (Prod 2026-04-06). Session 67/68. |
| 20260403_111_wave_rpc_functions.sql | ✅ | 2026-04-03 | ✅ | 2026-04-03 | 5 RPCs: reserve/cancel wave, company-paid order, find next wave, wave availability. Applied to all 3 envs (Prod 2026-04-06). Session 67/68. |
| 20260404_112_fix_company_paid_payout.sql | ✅ | 2026-04-04 | ✅ | 2026-04-04 | Fix create_company_paid_order: deduct 6.5% platform fee from vendor payout. Applied to all 3 envs (Prod 2026-04-06). Session 67/68. |
| 20260405_113_hybrid_events_access_code.sql | ✅ | 2026-04-05 | ✅ | 2026-04-05 | access_code + company_max_per_attendee_cents on catering_requests. Hybrid event support. Applied to all 3 envs (Prod 2026-04-06). Session 68. |
| 20260411_115_admin_auto_premium_tier.sql | ✅ | 2026-04-11 | ✅ | 2026-04-11 | Admin auto-premium trigger on user_profiles. Grant-only semantics (role loss does NOT drop tier). Backfills existing admins. First draft had text[]/user_role[] COALESCE mismatch — fixed to use && overlap operator + enum casts. Applied to all 3 envs (Prod 2026-04-11). Session 70. |
| 20260411_116_event_ratings_table.sql | ✅ | 2026-04-11 | ✅ | 2026-04-11 | New `event_ratings` table for event-general attendee ratings. Separate from `order_ratings` (which stays as the vendor rating system). Per-user unique per event. 5 RLS policies (user insert/update/read own, organizer read approved for own events, platform_admin all). pending→approved workflow (admin moderates). Used by rewritten EventFeedbackForm to replace the broken submission path. Applied to all 3 envs (Prod 2026-04-11). Session 71. |
| 20260412_117_error_logs_vertical_id.sql | ✅ | 2026-04-12 | ✅ | 2026-04-12 | New `vertical_id` TEXT column on `error_logs` (nullable FK→verticals). Enables vertical-scoped error dashboards. Partial index on vertical_id WHERE NOT NULL. Existing rows stay NULL. Routes opt-in via `withErrorTracing(route, method, handler, { vertical })`. Applied to all 3 envs (2026-04-12). Session 71. |
| 20260412_121_event_data_integrity.sql | ✅ | 2026-04-12 | ✅ | 2026-04-12 | CHECK on event times (requires start+end when date set), cleanup trigger for cancelled/declined events, organizer RLS for wave reservations + order items. Applied to all 3 envs (2026-04-12). Session 71. |
| 20260412_120_wave_system_hardening.sql | ✅ | 2026-04-12 | ✅ | 2026-04-12 | Wave hardening: expires_at on reservations (10-min timeout), reserve_event_wave rewrite, free_wave_on_order_cancel RPC, recalculate_wave_capacity RPC. Applied to all 3 envs (2026-04-12). Session 71. |
| 20260425_126_unified_market_box_tier_limits.sql | ✅ | 2026-04-25 | ✅ | 2026-04-25 | **Function rewrite:** `enforce_market_box_tier_limit()` (BEFORE INSERT/UPDATE trigger on `market_box_offerings`) now uses unified tier limits matching `vendor-limits.ts` (pro=6, boss=10, all others=3). Migration 064 used pre-unification limits (FM standard=2, premium=4, etc.) which diverged from app layer after migration 089 unified tiers. Vendors saw "2 of 3 used" in UI but got blocked at 2/2 by DB trigger. App and DB now agree. Applied to Dev + Staging 2026-04-25. **Pending Prod.** |
| 20260425_125_market_box_term_duration.sql | ✅ | 2026-04-25 | ✅ | 2026-04-25 | **Function rewrite (Option A duration semantics):** `create_market_box_pickups()` — `original_end_date` now equals `start_date + term_weeks*7` instead of `start_date + (num_pickups-1)*interval`. Effect: subscription's "ends" date matches the named term length (4-week = 28 days, 8-week = 56 days) regardless of cadence. Pickup dates unchanged. Buyer mental model: "1 Month subscription with N pickups." No backfill — staging/prod have no biweekly subs and existing weekly subs continue under old semantic. New subs only get the new end_date. Applied to Dev + Staging 2026-04-25. **Pending Prod.** |
| 20260420_124_market_box_biweekly_frequency.sql | ✅ | 2026-04-24 | ✅ | 2026-04-24 | **New columns:** `vendor_profiles.market_box_frequency` (TEXT NOT NULL DEFAULT 'weekly', CHECK weekly/biweekly), `market_box_subscriptions.pickup_frequency` (TEXT NOT NULL DEFAULT 'weekly', CHECK weekly/biweekly). **Function rewrites:** `create_market_box_pickups()` trigger reads `pickup_frequency` to set interval (7d weekly / 14d biweekly) and pickup count. `check_subscription_completion()` now counts actual pickup rows instead of `term_weeks` — fixes premature completion when extension weeks exist. `vendor_skip_week()` uses frequency-aware interval for extension scheduling. `subscribe_to_market_box_if_capacity()` adds 8th param `p_pickup_frequency TEXT DEFAULT 'weekly'` — note: 7-arg overload remains alongside (CREATE OR REPLACE matches by typed signature, not by defaults), future cleanup needed. Applied to Dev + Staging 2026-04-24. **Pending Prod.** Structured tables in SCHEMA_SNAPSHOT.md not yet regenerated. |
| 20260417_123_selection_email_dedup.sql | ✅ | 2026-04-17 | ✅ | 2026-04-17 | New `selection_email_sent_at` TIMESTAMPTZ column on catering_requests. Prevents duplicate organizer confirmation emails when self-service vendor selection email already sent. Applied to all 3 envs (2026-04-17). Session 72. |
| 20260413_122_fix_organizer_rls_recursion.sql | ✅ | 2026-04-13 | ✅ | 2026-04-13 | Dropped `organizer_read_event_order_items` on order_items + `organizer_read_wave_reservations` on event_wave_reservations. Both added by migration 121 and caused infinite recursion with markets_select (migration 075) for every authenticated query. Symptom on prod: browse silently returned 0 listings + /api/cart returned 500 for signed-in users. Root cause found in Postgres logs. No app code depends on the dropped policies (organizer dashboard uses serviceClient). If org RLS is reintroduced, must use SECURITY DEFINER helper per CLAUDE.md Rule 5. Applied to all 3 envs (Prod 2026-04-13). Hotfix. |
| 20260412_119_company_paid_fees_and_cap.sql | ✅ | 2026-04-12 | ✅ | 2026-04-12 | Rewrite `create_company_paid_order` RPC: standard fees (6.5%+$0.15 each side), per-attendee cap enforcement via company_max_per_attendee_cents. New `event_company_payment_id` UUID column on orders (FK→event_company_payments). Applied to all 3 envs (2026-04-12). Session 71. |
| 20260412_118_event_indexes_constraints.sql | ✅ | 2026-04-12 | ✅ | 2026-04-12 | 7 indexes on event-critical columns (catering_requests organizer+status, event_wave_reservations status, event_company_payments catering, market_vendors backup, orders wave_reservation, markets catering_request). FK on catering_requests.organizer_user_id → auth.users ON DELETE SET NULL. CHECK on event_wave_reservations: ordered requires order_id. Applied to all 3 envs (2026-04-12). Session 71. |
| 20260407_114_vendor_fee_discount.sql | ✅ | 2026-04-07 | ✅ | 2026-04-07 | vendor_fee_override_percent, fee_discount_code, fee_discount_approved_by/at on vendor_profiles. CHECK 3.6–6.5. Applied to all 3 envs. Session 69. |
| 20260324_098_expand_fm_vendor_type_options.sql | ✅ | 2026-03-24 | ✅ | 2026-03-24 | Expand FM vendor_type options from 6 to 11 (match listing categories). Config JSONB update. Applied to all 3 envs. Session 63. |
| 20260323_097_vendor_cover_image.sql | ✅ | 2026-03-23 | ✅ | 2026-03-23 | Add cover_image_url TEXT to vendor_profiles. Landscape photo display on vendor profile. Applied to all 3 envs. Session 63. |
| 20260322_096_vendor_pickup_lead_minutes.sql | ✅ | 2026-03-22 | ✅ | 2026-03-22 | Add pickup_lead_minutes INTEGER DEFAULT 30 to vendor_profiles. CHECK (15 or 30). Vendor configurable prep time. Applied to all 3 envs. Session 63. |
| 20260321_095_prod_sync_triggers_indexes_policies.sql | ✅ | 2026-03-21 | ✅ | 2026-03-21 | Comprehensive prod sync: 58 triggers, 30 indexes, 2 tables, 3 columns, 2 enum values, RLS policies. Idempotent. Applied to all 3 envs. Session 62. |
| 20260320_094_event_vendor_listings_and_lifecycle.sql | ✅ | 2026-03-20 | ✅ | 2026-03-20 | New event_vendor_listings table. Event lifecycle statuses (ready/active/review). Migration applied to all 3 envs. Session 62. |
| 20260320_093_auto_cancel_order_when_all_items_cancelled.sql | ✅ | 2026-03-20 | ✅ | 2026-03-20 | Auto-cancel trigger: when all order items cancelled, order status → cancelled. Safety net. Applied to all 3 envs. Session 62. |
| 20260319_091_event_token.sql | ✅ | 2026-03-19 | ✅ | 2026-03-19 | Add event_token TEXT UNIQUE to catering_requests. Public event page access. Applied to all 3 envs. Session 61. |
| 20260319_090_fix_tier_trigger_status_enum.sql | ✅ | 2026-03-19 | ✅ | 2026-03-19 | Fix 'active' → 'published' in enforce_listing_tier_limit(). Regression from 089. Applied to all 3 envs. Session 61. |
| 20260319_089_unified_tier_limits.sql | ✅ | 2026-03-19 | ✅ | 2026-03-19 | Rewrite enforce_listing_tier_limit() for Free/Pro/Boss (20/50/100). CHECK constraint updated. Applied to all 3 envs. Session 61. |
| 20260316_085b_lazy_profile_and_role_functions.sql | ✅ | 2026-03-20 | ✅ | 2026-03-20 | Lazy profile creation RPC, role migrations (verifier→regional_admin), is_platform_admin update. Applied to all 3 envs. Session 62. |
| 20260316_085a_add_role_enum_values.sql | ✅ | 2026-03-20 | ✅ | 2026-03-20 | Add platform_admin, regional_admin to user_role enum. Applied to all 3 envs. Session 62. |
| 20260316_084_add_vendor_tier_index.sql | ✅ | 2026-03-16 | ✅ | 2026-03-16 | Composite index on vendor_profiles(vertical_id, tier). Applied to all 3 envs. |
| 20260314_083_coi_soft_gate.sql | ✅ | 2026-03-14 | ✅ | 2026-03-14 | Remove COI check from can_vendor_publish(). COI is soft gate for publishing, hard gate for events only (VJ-R1). Applied to all 3 envs. |
| 20260314_082_sales_tax_help_article.sql | ✅ | 2026-03-14 | ✅ | 2026-03-14 | Sales tax help article for vendors. Data only. Applied to all 3 envs. |
| 20260314_081_add_listing_is_taxable.sql | ✅ | 2026-03-14 | ✅ | 2026-03-14 | Add listings.is_taxable BOOLEAN column. Applied to all 3 envs. |
| 20260312_080_catering_48hr_lead_time.sql | ✅ | 2026-03-13 | ✅ | 2026-03-13 | Rewrite get_available_pickup_dates(): catering items (advance_order_days>0) require 2-day min lead time (48hr rule). Window: [local_today+2, local_today+advance_order_days]. Regular items unchanged. Applied to all 3 envs. |
| 20260312_079_advance_order_days.sql | ✅ | 2026-03-12 | ✅ | 2026-03-12 | Add `advance_order_days` column to listings (default 0). Rewrite get_available_pickup_dates() with advance ordering + timezone fix (re-applies 054, supersedes 040). Applied to all 3 envs. |
| 20260312_078_session52_audit_fixes.sql | ✅ | 2026-03-12 | ✅ | 2026-03-12 | C-1: atomic_decrement_inventory RAISE on oversell + auto-draft. C-2: can_vendor_publish() in tier trigger. H-8: atomic_restore_inventory RPC. M-7: is_platform_admin() fix. M-13: cancellation_fee_cents column. Applied to all 3 envs. |
| 20260309_077_update_event_help_articles.sql | ✅ | 2026-03-09 | ✅ | 2026-03-09 | Update 2 FT event help articles: event approval process + Available for Events checkbox instructions. Data only. Applied to all 3 envs. |
| 20260309_076_vendor_event_approval.sql | ✅ | 2026-03-09 | ✅ | 2026-03-09 | Add event_approved + event_approved_at to vendor_profiles. Partial index on event_approved=true. FT private event vendor qualification. Applied to all 3 envs. |
| 20260308_075_merge_duplicate_select_policies_prod.sql | ✅ | 2026-03-08 | ✅ | 2026-03-08 | Merge 8 duplicate permissive SELECT policy pairs into single policies. Fixes Prod gap from migrations 002/003 + new vendor_quality_findings merge. Applied to all 3 envs. |
| 20260308_074_fix_rls_linter_warnings.sql | ✅ | 2026-03-08 | ✅ | 2026-03-08 | Fix error_reports INSERT policy (was WITH CHECK true) + add admin SELECT policies to 4 tables. Applied to all 3 envs. |
| 20260308_073_popup_market_help_articles.sql | ✅ | 2026-03-08 | ✅ | 2026-03-08 | 6 FM pop-up market help articles + rebrand 6 FT articles from "Corporate Catering" to "Private Events". Data only. Applied to all 3 envs. |
| 20260308_072_add_markets_is_private.sql | ✅ | 2026-03-08 | ✅ | 2026-03-08 | Add `is_private` BOOLEAN to markets. Backfill catering events to true. Partial index. Applied to all 3 envs. |
| 20260307_069_update_stale_help_articles.sql | ✅ | 2026-03-07 | ✅ | 2026-03-07 | Updated 6 stale knowledge_articles: payment methods, fees, tips, minimum order, FM/FT plan pricing. Data only. Applied to all 3 envs. |
| 20260303_067_batch_listing_availability.sql | ✅ | 2026-03-03 | ✅ | 2026-03-03 | Batch listing availability function. Calls get_available_pickup_dates() via LEFT JOIN LATERAL. Applied to all 3 envs (Prod applied 2026-03-07 — was missing). |
| 20260303_066_schedule_conflict_trigger.sql | ✅ | 2026-03-03 | ✅ | 2026-03-03 | Schedule conflict prevention trigger on vendor_market_schedules. Applied to all 3 envs (Prod applied 2026-03-07 — was missing). |
| 20260303_065_add_notification_vertical_id.sql | ✅ | 2026-03-03 | ✅ | 2026-03-03 | Add vertical_id to notifications table. FK to verticals, index on (user_id, vertical_id). Applied to all 3 envs. |
| 20260228_061_fm_free_tier.sql | ✅ | 2026-02-28 | ✅ | 2026-02-28 | FM free tier + updated listing limits. Renamed set_ft_default_tier → set_default_vendor_tier (both verticals get 'free'). Applied to all 3 envs. |
| 20260228_060_vendor_trial_system.sql | ✅ | 2026-02-28 | ✅ | 2026-02-28 | Add trial_started_at, trial_ends_at, trial_grace_ends_at to vendor_profiles. 90-day Basic trial for FT vendors. Applied to all 3 envs (Dev, Staging, Prod). |
| 20260228_059_market_box_subscription_payout.sql | ✅ | 2026-02-28 | ✅ | 2026-02-28 | Add market_box_subscription_id to vendor_payouts. Full prepaid vendor payout at checkout. Applied to all 3 envs. |
| 20260222_048_buyer_search_log.sql | ✅ | 2026-02-22 | ✅ | 2026-02-22 | Buyer search log table for geographic intelligence. Applied to all 3 envs. |
| 20260222_049_scan_vendor_activity_validation.sql | ✅ | 2026-02-22 | ✅ | 2026-02-22 | Add vertical_id validation to scan_vendor_activity(). Applied to all 3 envs. |
| 20260222_050_fix_notifications_user_id_fk.sql | ✅ | 2026-02-22 | ✅ | 2026-02-22 | Fix notifications.user_id FK → auth.users(id). Rewrite trigger. Applied to all 3 envs. |
| 20260223_054_fix_availability_timezone.sql | ✅ | 2026-02-23 | ✅ | 2026-02-23 | Fix get_available_pickup_dates() UTC timezone bug. Applied to all 3 envs. |
| 20260222_053_add_small_order_fee_cents.sql | ✅ | 2026-02-22 | ✅ | 2026-02-22 | Add orders.small_order_fee_cents column. Applied to all 3 envs. |
| 20260221_045_small_order_fee.sql | ✅ | 2026-02-22 | ✅ | 2026-02-22 | Add small order fee config to verticals.config JSONB. Applied to all 3 envs. |
| 20260222_052_update_ft_tier_listing_limits.sql | ✅ | 2026-02-22 | ✅ | 2026-02-22 | Update enforce_listing_tier_limit(): FT free 4→5, basic 8→10. Applied to all 3 envs. |
| 20260222_051_fix_ft_seed_onboarding_gates.sql | ✅ | 2026-02-22 | ✅ | 2026-02-22 | Fix FT seed vendor onboarding gates 2 & 4. Data-only. Applied to Dev & Staging. |

---

## Pending Migrations (Not Yet Applied to Staging)

| Migration File | Target Environments | Priority | Notes |
|----------------|---------------------|----------|-------|
| (None currently pending) | - | - | All migrations applied to all 3 envs as of 2026-03-30 |

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
