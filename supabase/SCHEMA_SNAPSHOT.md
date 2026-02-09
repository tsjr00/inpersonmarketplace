# Database Schema Snapshot

**Source of truth for database structure. Updated after each confirmed migration.**

**Last Updated:** 2026-02-09
**Database:** Dev (inpersonmarketplace)
**Updated By:** Claude + User

---

## Change Log

| Date | Migration | Changes |
|------|-----------|---------|
| 2026-02-09 | 20260209_006_vendor_cancellation_tracking | Added 3 columns to `vendor_profiles`: `orders_confirmed_count` (INT NOT NULL DEFAULT 0), `orders_cancelled_after_confirm_count` (INT NOT NULL DEFAULT 0), `cancellation_warning_sent_at` (TIMESTAMPTZ). Added 2 SECURITY DEFINER functions: `increment_vendor_confirmed(UUID)` returns void, `increment_vendor_cancelled(UUID)` returns TABLE(confirmed_count, cancelled_count). Applied to Dev & Staging. |
| 2026-02-09 | 20260209_004_drop_remaining_old_policies | Dropped remaining old-named duplicate policies on 6 tables. transactions: 3 old SELECT/UPDATE. vendor_payouts: 1 old vendor_select. organizations: 1 old admin select. vendor_profiles: merged admin access into select/update, dropped 5 old. vendor_verifications: merged admin access into select, dropped 2 old. verticals: replaced ALL policy with specific admin INSERT/UPDATE/DELETE. Skipped user_profiles (recursion risk). Applied to Dev & Staging. |
| 2026-02-09 | 20260209_003_merge_markets_select_policies | Merged `markets_select` + `markets_public_select` into single comprehensive `markets_select` policy. Includes: approved+active, vendor owns it, buyer order history (via order_items.market_id and listing_markets), platform admin, vertical admin. Applied to Dev & Staging. |
| 2026-02-09 | 20260209_002_merge_duplicate_select_policies | Merged admin+regular SELECT policies into single policy on 6 tables: listings, orders, order_items, transactions, vendor_payouts, notifications. Dropped ~40 old-named policies from previous schema versions. Pure performance optimization — no behavioral change. Applied to Dev & Staging. |
| 2026-02-09 | 20260209_001_add_performance_indexes | Added 10 performance indexes: notifications (user_unread, user_created), order_items (status_expires, vendor_status_created, pickup_date_market), orders (parent_id, vertical_created), market_box_pickups (sub_date_status), market_box_offerings (vendor_active w/ WHERE), market_box_subscriptions (offering_active). Note: 2 indexes had name collisions with existing indexes (IF NOT EXISTS skipped). Applied to Dev & Staging. |
| 2026-02-08 | 20260208_001_market_box_mutual_confirmation | Added 3 columns to `market_box_pickups`: `buyer_confirmed_at` (TIMESTAMPTZ), `vendor_confirmed_at` (TIMESTAMPTZ), `confirmation_window_expires_at` (TIMESTAMPTZ). Enables 30-second mutual confirmation window for market box pickups, matching regular order confirmation flow. Applied to Dev & Staging. |
| 2026-02-06 | 20260206_001_atomic_inventory_decrement | Added `atomic_decrement_inventory(UUID, INTEGER)` function (SECURITY DEFINER). Atomically decrements `listings.quantity` using `GREATEST(0, quantity - p_quantity)` with RETURNING clause. Prevents race condition in concurrent checkouts. Applied to Dev & Staging. |
| 2026-02-06 | (app code) | **Inventory Management**: `listings.quantity` decremented on successful payment in `checkout/success`. New notification types: `inventory_out_of_stock`, `inventory_low_stock` (threshold: 5). No schema changes. |
| 2026-02-06 | (app code) | **Market Box Pricing**: Applied `calculateBuyerPrice()` to market box checkout - now includes 6.5% + $0.15 fee. No schema changes. |
| 2026-02-05 | 20260205_001_pickup_scheduling_schema | Added to cart_items: `schedule_id`, `pickup_date`. Added to order_items: `schedule_id`, `pickup_date`, `pickup_snapshot` (JSONB). Added to orders: `parent_order_id`, `order_suffix`. **NOTE: pickup_start_time/pickup_end_time do NOT exist - use pickup_snapshot.start_time/end_time** |
| 2026-02-05 | 20260205_002_pickup_scheduling_functions | Added functions: `get_available_pickup_dates()`, `validate_cart_item_schedule()`, `build_pickup_snapshot()` |
| 2026-02-05 | 20260205_003_fix_cutoff_threshold | Added `cutoff_hours` to get_available_pickup_dates output |
| 2026-02-04 | 20260204_001_zip_codes_table | Added `zip_codes` table (33k+ US ZIP codes with coordinates); new functions: `get_zip_coordinates()`, `get_nearby_zip_codes()`, `get_region_zip_codes()` |
| 2026-02-03 | 20260203_004_fix_market_box_trigger_column_name | Fixed `set_market_box_premium_window()` trigger: changed `is_active` to `active` (correct column name) |
| 2026-02-03 | 20260203_003_add_vertical_admin_rls_support | Added vertical admin RLS support to 14 tables; new helper functions: `can_admin_market()`, `can_admin_order()`, `can_admin_vendor()` |
| 2026-02-03 | 20260203_002_fix_admin_helper_functions | Fixed `is_platform_admin()` to check both `role` column and `roles` array; added `is_vertical_admin()`, `is_admin_for_vertical()`, `is_any_admin()`, `get_user_admin_verticals()` |
| 2026-02-03 | Initial snapshot | Full schema capture |

---

Where Schema = public : map

## ALL TABLES AS OF 02/05/2026

| table_name               |
| ------------------------ |
| admin_activity_log       |
| audit_log                |
| cart_items               |
| carts                    |
| error_logs               |
| error_reports            |
| error_resolutions        |
| fulfillments             |
| listing_images           |
| listing_markets          |
| listings                 |
| market_box_offerings     |
| market_box_pickups       |
| market_box_subscriptions |
| market_schedules         |
| market_vendors           |
| markets                  |
| notifications            |
| order_items              |
| order_ratings            |
| orders                   |
| organizations            |
| payments                 |
| platform_settings        |
| shopper_feedback         |
| spatial_ref_sys          |
| transactions             |
| user_profiles            |
| vendor_activity_flags    |
| vendor_activity_scan_log |
| vendor_activity_settings |
| vendor_fee_balance       |
| vendor_fee_ledger        |
| vendor_feedback          |
| vendor_location_cache    |
| vendor_market_schedules  |
| vendor_payouts           |
| vendor_profiles          |
| vendor_referral_credits  |
| vendor_verifications     |
| vertical_admins          |
| verticals                |
| zip_codes                |


-- ALL COLUMNS WITH TYPES AS OF 02/05/2026

**NOTE: Not all tables are fully documented below. Core tables (order_items, orders, cart_items) were verified against the database on 02/05/2026. When in doubt, query the database directly.**

**CRITICAL - Pickup Scheduling Columns (added 02/05/2026):**
- `order_items.schedule_id` (UUID, FK to market_schedules.id) - Reference to schedule at checkout
- `order_items.pickup_date` (DATE) - Immutable promised pickup date
- `order_items.pickup_snapshot` (JSONB) - Frozen pickup details (market_name, address, start_time, end_time)
- `orders.parent_order_id` (UUID, FK to orders.id) - Links split orders from same checkout
- `orders.order_suffix` (VARCHAR(5)) - Distinguishes split orders (-A, -B, etc.)
- `cart_items.schedule_id` (UUID, FK to market_schedules.id) - Selected pickup schedule
- `cart_items.pickup_date` (DATE) - Selected pickup date

**IMPORTANT: `pickup_start_time` and `pickup_end_time` columns DO NOT EXIST on order_items. Always use `pickup_snapshot.start_time` and `pickup_snapshot.end_time` instead.**

**Market Box Mutual Confirmation Columns (added 02/08/2026):**
- `market_box_pickups.buyer_confirmed_at` (TIMESTAMPTZ) - When buyer confirmed pickup
- `market_box_pickups.vendor_confirmed_at` (TIMESTAMPTZ) - When vendor confirmed pickup
- `market_box_pickups.confirmation_window_expires_at` (TIMESTAMPTZ) - 30-second window expiry after first confirmation



| table_name         | column_name            | data_type                | is_nullable | column_default         |
| ------------------ | ---------------------- | ------------------------ | ----------- | ---------------------- |
| active_markets     | id                     | uuid                     | YES         | null                   |
| active_markets     | vertical_id            | text                     | YES         | null                   |
| active_markets     | vendor_profile_id      | uuid                     | YES         | null                   |
| active_markets     | name                   | text                     | YES         | null                   |
| active_markets     | market_type            | text                     | YES         | null                   |
| active_markets     | address                | text                     | YES         | null                   |
| active_markets     | city                   | text                     | YES         | null                   |
| active_markets     | state                  | text                     | YES         | null                   |
| active_markets     | zip                    | text                     | YES         | null                   |
| active_markets     | day_of_week            | integer                  | YES         | null                   |
| active_markets     | start_time             | time without time zone   | YES         | null                   |
| active_markets     | end_time               | time without time zone   | YES         | null                   |
| active_markets     | status                 | text                     | YES         | null                   |
| active_markets     | created_at             | timestamp with time zone | YES         | null                   |
| active_markets     | updated_at             | timestamp with time zone | YES         | null                   |
| active_markets     | active                 | boolean                  | YES         | null                   |
| active_markets     | contact_email          | text                     | YES         | null                   |
| active_markets     | submitted_by           | uuid                     | YES         | null                   |
| active_markets     | submitted_at           | timestamp with time zone | YES         | null                   |
| active_markets     | reviewed_by            | uuid                     | YES         | null                   |
| active_markets     | reviewed_at            | timestamp with time zone | YES         | null                   |
| active_markets     | rejection_reason       | text                     | YES         | null                   |
| active_markets     | latitude               | numeric                  | YES         | null                   |
| active_markets     | longitude              | numeric                  | YES         | null                   |
| active_markets     | geocoding_failed       | boolean                  | YES         | null                   |
| active_markets     | contact_phone          | text                     | YES         | null                   |
| active_markets     | timezone               | text                     | YES         | null                   |
| active_markets     | cutoff_hours           | integer                  | YES         | null                   |
| active_markets     | season_start           | date                     | YES         | null                   |
| active_markets     | season_end             | date                     | YES         | null                   |
| active_markets     | approval_status        | USER-DEFINED             | YES         | null                   |
| active_markets     | submitted_by_vendor_id | uuid                     | YES         | null                   |
| active_markets     | description            | text                     | YES         | null                   |
| active_markets     | website                | text                     | YES         | null                   |
| active_markets     | vendor_sells_at_market | boolean                  | YES         | null                   |
| active_markets     | expires_at             | timestamp with time zone | YES         | null                   |
| admin_activity_log | id                     | uuid                     | NO          | uuid_generate_v4()     |
| admin_activity_log | action                 | text                     | NO          | null                   |
| admin_activity_log | target_user_id         | uuid                     | NO          | null                   |
| admin_activity_log | performed_by           | uuid                     | NO          | null                   |
| admin_activity_log | vertical_id            | text                     | YES         | null                   |
| admin_activity_log | details                | jsonb                    | YES         | null                   |
| admin_activity_log | created_at             | timestamp with time zone | YES         | now()                  |
| audit_log          | id                     | uuid                     | NO          | uuid_generate_v4()     |
| audit_log          | user_id                | uuid                     | YES         | null                   |
| audit_log          | action                 | text                     | NO          | null                   |
| audit_log          | table_name             | text                     | NO          | null                   |
| audit_log          | record_id              | uuid                     | YES         | null                   |
| audit_log          | old_data               | jsonb                    | YES         | null                   |
| audit_log          | new_data               | jsonb                    | YES         | null                   |
| audit_log          | ip_address             | inet                     | YES         | null                   |
| audit_log          | user_agent             | text                     | YES         | null                   |
| audit_log          | created_at             | timestamp with time zone | YES         | now()                  |
| cart_items         | id                     | uuid                     | NO          | gen_random_uuid()      |
| cart_items         | cart_id                | uuid                     | NO          | null                   |
| cart_items         | listing_id             | uuid                     | NO          | null                   |
| cart_items         | quantity               | integer                  | NO          | null                   |
| cart_items         | created_at             | timestamp with time zone | NO          | now()                  |
| cart_items         | updated_at             | timestamp with time zone | NO          | now()                  |
| cart_items         | market_id              | uuid                     | YES         | null                   |
| cart_items         | schedule_id            | uuid                     | YES         | null                   |
| cart_items         | pickup_date            | date                     | YES         | null                   |
| carts              | id                     | uuid                     | NO          | gen_random_uuid()      |
| carts              | user_id                | uuid                     | NO          | null                   |
| carts              | vertical_id            | uuid                     | NO          | null                   |
| carts              | created_at             | timestamp with time zone | NO          | now()                  |
| carts              | updated_at             | timestamp with time zone | NO          | now()                  |
| error_logs         | id                     | uuid                     | NO          | gen_random_uuid()      |
| error_logs         | trace_id               | text                     | NO          | null                   |
| error_logs         | error_code             | text                     | NO          | null                   |
| error_logs         | message                | text                     | NO          | null                   |
| error_logs         | context                | jsonb                    | YES         | '{}'::jsonb            |
| error_logs         | breadcrumbs            | jsonb                    | YES         | '[]'::jsonb            |
| error_logs         | user_id                | uuid                     | YES         | null                   |
| error_logs         | route                  | text                     | YES         | null                   |
| error_logs         | method                 | text                     | YES         | null                   |
| error_logs         | pg_code                | text                     | YES         | null                   |
| error_logs         | severity               | text                     | YES         | null                   |
| error_logs         | created_at             | timestamp with time zone | YES         | now()                  |
| error_reports      | id                     | uuid                     | NO          | gen_random_uuid()      |
| error_reports      | error_code             | text                     | YES         | null                   |
| error_reports      | trace_id               | text                     | YES         | null                   |
| error_reports      | vertical_id            | text                     | YES         | null                   |
| error_reports      | page_url               | text                     | YES         | null                   |
| error_reports      | user_agent             | text                     | YES         | null                   |
| error_reports      | reported_by_user_id    | uuid                     | YES         | null                   |
| error_reports      | reporter_email         | text                     | YES         | null                   |
| error_reports      | user_description       | text                     | YES         | null                   |
| error_reports      | status                 | text                     | NO          | 'pending'::text        |
| error_reports      | escalation_level       | text                     | NO          | 'vertical_admin'::text |
| error_reports      | assigned_to_user_id    | uuid                     | YES         | null                   |
| error_reports      | resolution_id          | uuid                     | YES         | null                   |
| error_reports      | resolution_notes       | text                     | YES         | null                   |
| error_reports      | vertical_admin_notes   | text                     | YES         | null                   |
| error_reports      | escalated_at           | timestamp with time zone | YES         | null                   |
| error_reports      | escalated_by_user_id   | uuid                     | YES         | null                   |
| error_reports      | platform_admin_notes   | text                     | YES         | null                   |
| error_reports      | resolved_at            | timestamp with time zone | YES         | null                   |
| error_reports      | resolved_by_user_id    | uuid                     | YES         | null                   |
| error_reports      | created_at             | timestamp with time zone | YES         | now()                  |
| error_reports      | updated_at             | timestamp with time zone | YES         | now()                  |
| error_resolutions  | id                     | uuid                     | NO          | gen_random_uuid()      |
| zip_codes          | zip                    | character varying(5)     | NO          | null (PRIMARY KEY)     |
| zip_codes          | city                   | character varying(100)   | NO          | null                   |
| zip_codes          | state                  | character varying(2)     | NO          | null                   |
| zip_codes          | state_name             | character varying(50)    | YES         | null                   |
| zip_codes          | county                 | character varying(100)   | YES         | null                   |
| zip_codes          | latitude               | numeric(9,6)             | NO          | null                   |
| zip_codes          | longitude              | numeric(9,6)             | NO          | null                   |
| zip_codes          | timezone               | character varying(50)    | YES         | null                   |
| zip_codes          | population             | integer                  | YES         | null                   |
| zip_codes          | region_code            | character varying(20)    | YES         | null                   |
| zip_codes          | active_market_area     | boolean                  | YES         | false                  |
| zip_codes          | created_at             | timestamp with time zone | YES         | now()                  |
| zip_codes          | updated_at             | timestamp with time zone | YES         | now()                  |

-- VERIFIED FROM DATABASE 02/05/2026 --

| order_items        | id                             | uuid                     | NO          | gen_random_uuid()      |
| order_items        | order_id                       | uuid                     | NO          | null                   |
| order_items        | listing_id                     | uuid                     | NO          | null                   |
| order_items        | vendor_profile_id              | uuid                     | NO          | null                   |
| order_items        | quantity                       | integer                  | NO          | null                   |
| order_items        | unit_price_cents               | integer                  | NO          | null                   |
| order_items        | subtotal_cents                 | integer                  | NO          | null                   |
| order_items        | platform_fee_cents             | integer                  | NO          | null                   |
| order_items        | vendor_payout_cents            | integer                  | NO          | null                   |
| order_items        | status                         | USER-DEFINED             | NO          | null                   |
| order_items        | pickup_confirmed_at            | timestamp with time zone | YES         | null                   |
| order_items        | created_at                     | timestamp with time zone | YES         | null                   |
| order_items        | updated_at                     | timestamp with time zone | YES         | null                   |
| order_items        | buyer_confirmed_at             | timestamp with time zone | YES         | null                   |
| order_items        | cancelled_at                   | timestamp with time zone | YES         | null                   |
| order_items        | cancelled_by                   | text                     | YES         | null                   |
| order_items        | cancellation_reason            | text                     | YES         | null                   |
| order_items        | refund_amount_cents            | integer                  | YES         | null                   |
| order_items        | expires_at                     | timestamp with time zone | YES         | null                   |
| order_items        | pickup_date                    | date                     | YES         | null                   |
| order_items        | market_id                      | uuid                     | YES         | null                   |
| order_items        | vendor_confirmed_at            | timestamp with time zone | YES         | null                   |
| order_items        | confirmation_window_expires_at | timestamp with time zone | YES         | null                   |
| order_items        | lockdown_active                | boolean                  | YES         | null                   |
| order_items        | lockdown_initiated_at          | timestamp with time zone | YES         | null                   |
| order_items        | issue_reported_at              | timestamp with time zone | YES         | null                   |
| order_items        | issue_reported_by              | text                     | YES         | null                   |
| order_items        | issue_description              | text                     | YES         | null                   |
| order_items        | issue_resolved_at              | timestamp with time zone | YES         | null                   |
| order_items        | issue_resolved_by              | text                     | YES         | null                   |
| order_items        | issue_status                   | text                     | YES         | null                   |
| order_items        | issue_admin_notes              | text                     | YES         | null                   |
| order_items        | schedule_id                    | uuid                     | YES         | null                   |
| order_items        | pickup_snapshot                | jsonb                    | YES         | null                   |

| orders             | id                            | uuid                     | NO          | gen_random_uuid()      |
| orders             | buyer_user_id                 | uuid                     | NO          | null                   |
| orders             | vertical_id                   | text                     | NO          | null                   |
| orders             | order_number                  | text                     | NO          | null                   |
| orders             | status                        | USER-DEFINED             | NO          | null                   |
| orders             | subtotal_cents                | integer                  | NO          | null                   |
| orders             | platform_fee_cents            | integer                  | NO          | null                   |
| orders             | total_cents                   | integer                  | NO          | null                   |
| orders             | stripe_checkout_session_id    | text                     | YES         | null                   |
| orders             | created_at                    | timestamp with time zone | YES         | null                   |
| orders             | updated_at                    | timestamp with time zone | YES         | null                   |
| orders             | payment_method                | USER-DEFINED             | YES         | null                   |
| orders             | external_payment_confirmed_at | timestamp with time zone | YES         | null                   |
| orders             | external_payment_confirmed_by | uuid                     | YES         | null                   |
| orders             | parent_order_id               | uuid                     | YES         | null                   |
| orders             | order_suffix                  | character varying        | YES         | null                   |

**IMPORTANT: `grace_period_ends_at` column does NOT EXIST on orders.**
**The migration 20260127_001_cancellation_grace_period.sql was NOT applied. Use `created_at + 1 hour` for grace period calculation.**

**IMPORTANT: `pickup_start_time` and `pickup_end_time` columns DO NOT EXIST on order_items.**
**Always use `pickup_snapshot.start_time` and `pickup_snapshot.end_time` instead.**

## vendor_profiles (verified 02/09/2026)

| column_name                | data_type                | is_nullable |
| -------------------------- | ------------------------ | ----------- |
| id                         | uuid                     | NO          |
| user_id                    | uuid                     | YES         |
| organization_id            | uuid                     | YES         |
| vertical_id                | text                     | NO          |
| status                     | USER-DEFINED             | YES         |
| profile_data               | jsonb                    | YES         |
| created_at                 | timestamp with time zone | YES         |
| updated_at                 | timestamp with time zone | YES         |
| deleted_at                 | timestamp with time zone | YES         |
| stripe_account_id          | text                     | YES         |
| stripe_onboarding_complete | boolean                  | YES         |
| stripe_charges_enabled     | boolean                  | YES         |
| stripe_payouts_enabled     | boolean                  | YES         |
| tier                       | text                     | YES         |
| profile_image_url          | text                     | YES         |
| description                | text                     | YES         |
| social_links               | jsonb                    | YES         |
| home_market_id             | uuid                     | YES         |
| latitude                   | numeric                  | YES         |
| longitude                  | numeric                  | YES         |
| geocoding_failed           | boolean                  | YES         |
| referral_code              | text                     | YES         |
| referred_by_vendor_id      | uuid                     | YES         |
| is_founding_vendor         | boolean                  | YES         |
| founding_vendor_granted_at | timestamp with time zone | YES         |
| last_active_at             | timestamp with time zone | YES         |
| last_login_at              | timestamp with time zone | YES         |
| first_listing_at           | timestamp with time zone | YES         |
| approved_at                | timestamp with time zone | YES         |
| average_rating             | numeric                  | YES         |
| rating_count               | integer                  | YES         |
| subscription_status        | text                     | YES         |
| subscription_cycle         | text                     | YES         |
| tier_started_at            | timestamp with time zone | YES         |
| tier_expires_at            | timestamp with time zone | YES         |
| stripe_customer_id         | text                     | YES         |
| venmo_username             | text                     | YES         |
| cashapp_cashtag            | text                     | YES         |
| paypal_username            | text                     | YES         |
| accepts_cash_at_pickup     | boolean                  | YES         |
| certifications             | jsonb                    | YES         |
| orders_confirmed_count              | integer                  | NO (default 0) |
| orders_cancelled_after_confirm_count| integer                  | NO (default 0) |
| cancellation_warning_sent_at        | timestamp with time zone | YES         |

-- FOREIGN KEYS AS OF 02/05/2026


| table_name               | column_name            | foreign_table            | foreign_column |
| ------------------------ | ---------------------- | ------------------------ | -------------- |
| admin_activity_log       | vertical_id            | verticals                | vertical_id    |
| audit_log                | user_id                | user_profiles            | id             |
| cart_items               | market_id              | markets                  | id             |
| cart_items               | cart_id                | carts                    | id             |
| cart_items               | listing_id             | listings                 | id             |
| carts                    | vertical_id            | verticals                | id             |
| error_reports            | vertical_id            | verticals                | vertical_id    |
| error_reports            | resolution_id          | error_resolutions        | id             |
| fulfillments             | transaction_id         | transactions             | id             |
| listing_images           | listing_id             | listings                 | id             |
| listing_markets          | listing_id             | listings                 | id             |
| listing_markets          | market_id              | markets                  | id             |
| listings                 | vertical_id            | verticals                | vertical_id    |
| listings                 | vendor_profile_id      | vendor_profiles          | id             |
| market_box_offerings     | vertical_id            | verticals                | vertical_id    |
| market_box_offerings     | pickup_market_id       | markets                  | id             |
| market_box_offerings     | vendor_profile_id      | vendor_profiles          | id             |
| market_box_pickups       | subscription_id        | market_box_subscriptions | id             |
| market_box_subscriptions | buyer_user_id          | user_profiles            | user_id        |
| market_box_subscriptions | order_id               | orders                   | id             |
| market_box_subscriptions | offering_id            | market_box_offerings     | id             |
| market_schedules         | market_id              | markets                  | id             |
| market_vendors           | market_id              | markets                  | id             |
| market_vendors           | vendor_profile_id      | vendor_profiles          | id             |
| markets                  | submitted_by           | user_profiles            | user_id        |
| markets                  | reviewed_by            | user_profiles            | user_id        |
| markets                  | vendor_profile_id      | vendor_profiles          | id             |
| markets                  | submitted_by_vendor_id | vendor_profiles          | id             |
| notifications            | user_id                | user_profiles            | id             |
| order_items              | market_id              | markets                  | id             |
| order_items              | order_id               | orders                   | id             |
| order_items              | vendor_profile_id      | vendor_profiles          | id             |
| order_items              | listing_id             | listings                 | id             |
| order_items              | schedule_id            | market_schedules         | id             |
| cart_items               | schedule_id            | market_schedules         | id             |
| orders                   | parent_order_id        | orders                   | id             |
| order_ratings            | order_id               | orders                   | id             |
| order_ratings            | vendor_profile_id      | vendor_profiles          | id             |
| orders                   | vertical_id            | verticals                | vertical_id    |
| organizations            | owner_user_id          | user_profiles            | id             |
| payments                 | order_id               | orders                   | id             |
| shopper_feedback         | vertical_id            | verticals                | vertical_id    |
| transactions             | vendor_profile_id      | vendor_profiles          | id             |
| transactions             | listing_id             | listings                 | id             |
| transactions             | vertical_id            | verticals                | vertical_id    |
| transactions             | buyer_user_id          | user_profiles            | id             |
| vendor_activity_flags    | vendor_profile_id      | vendor_profiles          | id             |
| vendor_fee_balance       | vendor_profile_id      | vendor_profiles          | id             |
| vendor_fee_ledger        | order_id               | orders                   | id             |
| vendor_fee_ledger        | vendor_profile_id      | vendor_profiles          | id             |
| vendor_feedback          | vendor_profile_id      | vendor_profiles          | id             |
| vendor_feedback          | vertical_id            | verticals                | vertical_id    |
| vendor_location_cache    | source_market_id       | markets                  | id             |
| vendor_location_cache    | vendor_profile_id      | vendor_profiles          | id             |
| vendor_market_schedules  | schedule_id            | market_schedules         | id             |
| vendor_market_schedules  | vendor_profile_id      | vendor_profiles          | id             |
| vendor_market_schedules  | market_id              | markets                  | id             |
| vendor_payouts           | vendor_profile_id      | vendor_profiles          | id             |
| vendor_payouts           | order_item_id          | order_items              | id             |
| vendor_profiles          | vertical_id            | verticals                | vertical_id    |
| vendor_profiles          | organization_id        | organizations            | id             |
| vendor_profiles          | home_market_id         | markets                  | id             |
| vendor_profiles          | user_id                | user_profiles            | user_id        |
| vendor_profiles          | referred_by_vendor_id  | vendor_profiles          | id             |
| vendor_referral_credits  | referred_vendor_id     | vendor_profiles          | id             |
| vendor_referral_credits  | referrer_vendor_id     | vendor_profiles          | id             |
| vendor_verifications     | vendor_profile_id      | vendor_profiles          | id             |
| vendor_verifications     | reviewed_by            | user_profiles            | id             |
| vertical_admins          | vertical_id            | verticals                | vertical_id    |


-- ALL RLS POLICIES AS OF 02/03/2026


| schemaname | tablename                | policyname                       | permissive | roles    | cmd    | qual                                                                                                                                                                                                                                                                                                             | with_check                                                                                                                                                                                                                                                                           |
| ---------- | ------------------------ | -------------------------------- | ---------- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| public     | cart_items               | cart_items_all                   | PERMISSIVE | {public} | ALL    | (cart_id IN ( SELECT carts.id
   FROM carts
  WHERE (carts.user_id = ( SELECT auth.uid() AS uid))))                                                                                                                                                                                                              | null                                                                                                                                                                                                                                                                                 |
| public     | carts                    | carts_all                        | PERMISSIVE | {public} | ALL    | (user_id = ( SELECT auth.uid() AS uid))                                                                                                                                                                                                                                                                          | null                                                                                                                                                                                                                                                                                 |
| public     | error_logs               | error_logs_admin_select          | PERMISSIVE | {public} | SELECT | (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.user_id = ( SELECT auth.uid() AS uid)) AND ('admin'::user_role = ANY (user_profiles.roles)))))                                                                                                                                                  | null                                                                                                                                                                                                                                                                                 |
| public     | error_reports            | error_reports_select             | PERMISSIVE | {public} | SELECT | ((reported_by_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM vertical_admins va
  WHERE ((va.vertical_id = error_reports.vertical_id) AND (va.user_id = ( SELECT auth.uid() AS uid))))) OR is_platform_admin())                                                                            | null                                                                                                                                                                                                                                                                                 |
| public     | error_reports            | error_reports_update             | PERMISSIVE | {public} | UPDATE | ((EXISTS ( SELECT 1
   FROM vertical_admins va
  WHERE ((va.vertical_id = error_reports.vertical_id) AND (va.user_id = ( SELECT auth.uid() AS uid))))) OR is_platform_admin())                                                                                                                                   | null                                                                                                                                                                                                                                                                                 |
| public     | error_reports            | error_reports_user_insert        | PERMISSIVE | {public} | INSERT | null                                                                                                                                                                                                                                                                                                             | true                                                                                                                                                                                                                                                                                 |
| public     | fulfillments             | fulfillments_delete              | PERMISSIVE | {public} | DELETE | (transaction_id IN ( SELECT transactions.id
   FROM transactions
  WHERE (transactions.vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))))                                                                                                                                    | null                                                                                                                                                                                                                                                                                 |
| public     | fulfillments             | fulfillments_insert              | PERMISSIVE | {public} | INSERT | null                                                                                                                                                                                                                                                                                                             | (transaction_id IN ( SELECT transactions.id
   FROM transactions
  WHERE (transactions.vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))))                                                                                                        |
| public     | fulfillments             | fulfillments_select              | PERMISSIVE | {public} | SELECT | (transaction_id IN ( SELECT transactions.id
   FROM transactions
  WHERE ((transactions.buyer_user_id = ( SELECT auth.uid() AS uid)) OR (transactions.vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids)))))                                                                    | null                                                                                                                                                                                                                                                                                 |
| public     | fulfillments             | fulfillments_update              | PERMISSIVE | {public} | UPDATE | (transaction_id IN ( SELECT transactions.id
   FROM transactions
  WHERE (transactions.vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))))                                                                                                                                    | null                                                                                                                                                                                                                                                                                 |
| public     | listing_images           | listing_images_delete            | PERMISSIVE | {public} | DELETE | (listing_id IN ( SELECT listings.id
   FROM listings
  WHERE (listings.vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))))                                                                                                                                                    | null                                                                                                                                                                                                                                                                                 |
| public     | listing_images           | listing_images_insert            | PERMISSIVE | {public} | INSERT | null                                                                                                                                                                                                                                                                                                             | (listing_id IN ( SELECT listings.id
   FROM listings
  WHERE (listings.vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))))                                                                                                                        |
| public     | listing_images           | listing_images_select            | PERMISSIVE | {public} | SELECT | ((EXISTS ( SELECT 1
   FROM listings
  WHERE ((listings.id = listing_images.listing_id) AND (listings.status = 'published'::listing_status)))) OR (listing_id IN ( SELECT listings.id
   FROM listings
  WHERE (listings.vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))))) | null                                                                                                                                                                                                                                                                                 |
| public     | listing_images           | listing_images_update            | PERMISSIVE | {public} | UPDATE | (listing_id IN ( SELECT listings.id
   FROM listings
  WHERE (listings.vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))))                                                                                                                                                    | null                                                                                                                                                                                                                                                                                 |
| public     | listing_markets          | listing_markets_delete           | PERMISSIVE | {public} | DELETE | (listing_id IN ( SELECT listings.id
   FROM listings
  WHERE (listings.vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))))                                                                                                                                                    | null                                                                                                                                                                                                                                                                                 |
| public     | listing_markets          | listing_markets_insert           | PERMISSIVE | {public} | INSERT | null                                                                                                                                                                                                                                                                                                             | (listing_id IN ( SELECT listings.id
   FROM listings
  WHERE (listings.vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))))                                                                                                                        |
| public     | listing_markets          | listing_markets_select           | PERMISSIVE | {public} | SELECT | true                                                                                                                                                                                                                                                                                                             | null                                                                                                                                                                                                                                                                                 |
| public     | listing_markets          | listing_markets_update           | PERMISSIVE | {public} | UPDATE | (listing_id IN ( SELECT listings.id
   FROM listings
  WHERE (listings.vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))))                                                                                                                                                    | null                                                                                                                                                                                                                                                                                 |
| public     | listings                 | listings_delete                  | PERMISSIVE | {public} | DELETE | (vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))                                                                                                                                                                                                                            | null                                                                                                                                                                                                                                                                                 |
| public     | listings                 | listings_insert                  | PERMISSIVE | {public} | INSERT | null                                                                                                                                                                                                                                                                                                             | (vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))                                                                                                                                                                                                |
| public     | listings                 | listings_select                  | PERMISSIVE | {public} | SELECT | ((status = 'published'::listing_status) OR (vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids)) OR is_admin_for_vertical(vertical_id))                                                                                                                                                                                | null                                                                                                                                                                                                                                                                                 |
| public     | listings                 | listings_update                  | PERMISSIVE | {public} | UPDATE | (vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))                                                                                                                                                                                                                            | null                                                                                                                                                                                                                                                                                 |
| public     | market_box_offerings     | market_box_offerings_delete      | PERMISSIVE | {public} | DELETE | (vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))                                                                                                                                                                                                                            | null                                                                                                                                                                                                                                                                                 |
| public     | market_box_offerings     | market_box_offerings_insert      | PERMISSIVE | {public} | INSERT | null                                                                                                                                                                                                                                                                                                             | (vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))                                                                                                                                                                                                |
| public     | market_box_offerings     | market_box_offerings_select      | PERMISSIVE | {public} | SELECT | ((active = true) OR (vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids)))                                                                                                                                                                                                       | null                                                                                                                                                                                                                                                                                 |
| public     | market_box_offerings     | market_box_offerings_update      | PERMISSIVE | {public} | UPDATE | (vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))                                                                                                                                                                                                                            | null                                                                                                                                                                                                                                                                                 |
| public     | market_box_pickups       | market_box_pickups_select        | PERMISSIVE | {public} | SELECT | can_access_subscription(subscription_id)                                                                                                                                                                                                                                                                         | null                                                                                                                                                                                                                                                                                 |
| public     | market_box_pickups       | market_box_pickups_update        | PERMISSIVE | {public} | UPDATE | can_access_subscription(subscription_id)                                                                                                                                                                                                                                                                         | null                                                                                                                                                                                                                                                                                 |
| public     | market_box_subscriptions | market_box_subscriptions_insert  | PERMISSIVE | {public} | INSERT | null                                                                                                                                                                                                                                                                                                             | (buyer_user_id = ( SELECT auth.uid() AS uid))                                                                                                                                                                                                                                        |
| public     | market_box_subscriptions | market_box_subscriptions_select  | PERMISSIVE | {public} | SELECT | ((buyer_user_id = ( SELECT auth.uid() AS uid)) OR (offering_id IN ( SELECT market_box_offerings.id
   FROM market_box_offerings
  WHERE (market_box_offerings.vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids)))))                                                            | null                                                                                                                                                                                                                                                                                 |
| public     | market_schedules         | market_schedules_delete          | PERMISSIVE | {public} | DELETE | ((EXISTS ( SELECT 1
   FROM markets m
  WHERE ((m.id = market_schedules.market_id) AND (m.submitted_by_vendor_id IN ( SELECT vendor_profiles.id
           FROM vendor_profiles
          WHERE (vendor_profiles.user_id = ( SELECT auth.uid() AS uid))))))) OR is_platform_admin())                             | null                                                                                                                                                                                                                                                                                 |
| public     | market_schedules         | market_schedules_insert          | PERMISSIVE | {public} | INSERT | null                                                                                                                                                                                                                                                                                                             | ((EXISTS ( SELECT 1
   FROM markets m
  WHERE ((m.id = market_schedules.market_id) AND (m.submitted_by_vendor_id IN ( SELECT vendor_profiles.id
           FROM vendor_profiles
          WHERE (vendor_profiles.user_id = ( SELECT auth.uid() AS uid))))))) OR is_platform_admin()) |
| public     | market_schedules         | market_schedules_select          | PERMISSIVE | {public} | SELECT | true                                                                                                                                                                                                                                                                                                             | null                                                                                                                                                                                                                                                                                 |
| public     | market_schedules         | market_schedules_update          | PERMISSIVE | {public} | UPDATE | ((EXISTS ( SELECT 1
   FROM markets m
  WHERE ((m.id = market_schedules.market_id) AND (m.submitted_by_vendor_id IN ( SELECT vendor_profiles.id
           FROM vendor_profiles
          WHERE (vendor_profiles.user_id = ( SELECT auth.uid() AS uid))))))) OR is_platform_admin())                             | null                                                                                                                                                                                                                                                                                 |
| public     | market_vendors           | market_vendors_delete            | PERMISSIVE | {public} | DELETE | (vendor_profile_id IN ( SELECT vendor_profiles.id
   FROM vendor_profiles
  WHERE (vendor_profiles.user_id = ( SELECT auth.uid() AS uid))))                                                                                                                                                                      | null                                                                                                                                                                                                                                                                                 |
| public     | market_vendors           | market_vendors_insert            | PERMISSIVE | {public} | INSERT | null                                                                                                                                                                                                                                                                                                             | (vendor_profile_id IN ( SELECT vendor_profiles.id
   FROM vendor_profiles
  WHERE (vendor_profiles.user_id = ( SELECT auth.uid() AS uid))))                                                                                                                                          |
| public     | market_vendors           | market_vendors_select            | PERMISSIVE | {public} | SELECT | true                                                                                                                                                                                                                                                                                                             | null                                                                                                                                                                                                                                                                                 |
| public     | market_vendors           | market_vendors_update            | PERMISSIVE | {public} | UPDATE | (vendor_profile_id IN ( SELECT vendor_profiles.id
   FROM vendor_profiles
  WHERE (vendor_profiles.user_id = ( SELECT auth.uid() AS uid))))                                                                                                                                                                      | null                                                                                                                                                                                                                                                                                 |
| public     | markets                  | markets_delete                   | PERMISSIVE | {public} | DELETE | (submitted_by_vendor_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))                                                                                                                                                                                                                       | null                                                                                                                                                                                                                                                                                 |
| public     | markets                  | markets_insert                   | PERMISSIVE | {public} | INSERT | null                                                                                                                                                                                                                                                                                                             | (submitted_by_vendor_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))                                                                                                                                                                                           |
| public     | markets                  | markets_select                   | PERMISSIVE | {public} | SELECT | (((approval_status = 'approved'::market_approval_status) AND (active = true)) OR (submitted_by_vendor_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids)) OR (id IN (SELECT oi.market_id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.buyer_user_id = (SELECT auth.uid()) AND oi.market_id IS NOT NULL)) OR (id IN (SELECT lm.market_id FROM listing_markets lm JOIN order_items oi ON oi.listing_id = lm.listing_id JOIN orders o ON o.id = oi.order_id WHERE o.buyer_user_id = (SELECT auth.uid()))) OR (SELECT is_platform_admin()) OR is_vertical_admin(vertical_id))                                                                                                                                     | null                                                                                                                                                                                                                                                                                 |
| public     | markets                  | markets_update                   | PERMISSIVE | {public} | UPDATE | (submitted_by_vendor_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))                                                                                                                                                                                                                       | null                                                                                                                                                                                                                                                                                 |
| public     | notifications            | notifications_select             | PERMISSIVE | {public} | SELECT | ((user_id = ( SELECT auth.uid() AS uid)) OR (SELECT is_platform_admin()))                                                                                                                                                                                                                                                                          | null                                                                                                                                                                                                                                                                                 |
| public     | notifications            | notifications_update             | PERMISSIVE | {public} | UPDATE | (user_id = ( SELECT auth.uid() AS uid))                                                                                                                                                                                                                                                                          | null                                                                                                                                                                                                                                                                                 |
| public     | order_items              | order_items_insert               | PERMISSIVE | {public} | INSERT | null                                                                                                                                                                                                                                                                                                             | (order_id IN ( SELECT user_buyer_order_ids() AS user_buyer_order_ids))                                                                                                                                                                                                               |
| public     | order_items              | order_items_select               | PERMISSIVE | {public} | SELECT | ((order_id IN ( SELECT user_buyer_order_ids() AS user_buyer_order_ids)) OR (vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids)) OR can_admin_order(order_id))                                                                                                                                                | null                                                                                                                                                                                                                                                                                 |
| public     | order_items              | order_items_update               | PERMISSIVE | {public} | UPDATE | ((vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids)) OR (order_id IN ( SELECT user_buyer_order_ids() AS user_buyer_order_ids)))                                                                                                                                                | null                                                                                                                                                                                                                                                                                 |
| public     | order_ratings            | order_ratings_delete             | PERMISSIVE | {public} | DELETE | (buyer_user_id = ( SELECT auth.uid() AS uid))                                                                                                                                                                                                                                                                    | null                                                                                                                                                                                                                                                                                 |
| public     | order_ratings            | order_ratings_insert             | PERMISSIVE | {public} | INSERT | null                                                                                                                                                                                                                                                                                                             | (order_id IN ( SELECT orders.id
   FROM orders
  WHERE (orders.buyer_user_id = ( SELECT auth.uid() AS uid))))                                                                                                                                                                        |
| public     | order_ratings            | order_ratings_select             | PERMISSIVE | {public} | SELECT | ((order_id IN ( SELECT orders.id
   FROM orders
  WHERE (orders.buyer_user_id = ( SELECT auth.uid() AS uid)))) OR (order_id IN ( SELECT order_items.order_id
   FROM order_items
  WHERE (order_items.vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids)))))                    | null                                                                                                                                                                                                                                                                                 |
| public     | orders                   | orders_insert                    | PERMISSIVE | {public} | INSERT | null                                                                                                                                                                                                                                                                                                             | (buyer_user_id = ( SELECT auth.uid() AS uid))                                                                                                                                                                                                                                        |
| public     | orders                   | orders_select                    | PERMISSIVE | {public} | SELECT | ((buyer_user_id = ( SELECT auth.uid() AS uid)) OR (id IN ( SELECT user_vendor_order_ids() AS user_vendor_order_ids)) OR is_admin_for_vertical(vertical_id))                                                                                                                                                                                            | null                                                                                                                                                                                                                                                                                 |
| public     | orders                   | orders_update                    | PERMISSIVE | {public} | UPDATE | ((buyer_user_id = ( SELECT auth.uid() AS uid)) OR (id IN ( SELECT user_vendor_order_ids() AS user_vendor_order_ids)))                                                                                                                                                                                            | null                                                                                                                                                                                                                                                                                 |
| public     | organizations            | organizations_insert             | PERMISSIVE | {public} | INSERT | null                                                                                                                                                                                                                                                                                                             | (owner_user_id IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (user_profiles.user_id = ( SELECT auth.uid() AS uid))))                                                                                                                                                    |
| public     | organizations            | organizations_select             | PERMISSIVE | {public} | SELECT | true                                                                                                                                                                                                                                                                                                             | null                                                                                                                                                                                                                                                                                 |
| public     | organizations            | organizations_update             | PERMISSIVE | {public} | UPDATE | ((owner_user_id IN ( SELECT user_profiles.id
   FROM user_profiles
  WHERE (user_profiles.user_id = ( SELECT auth.uid() AS uid)))) OR is_platform_admin())                                                                                                                                                       | null                                                                                                                                                                                                                                                                                 |
| public     | payments                 | payments_select                  | PERMISSIVE | {public} | SELECT | (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = payments.order_id) AND (o.buyer_user_id = ( SELECT auth.uid() AS uid)))))                                                                                                                                                                                   | null                                                                                                                                                                                                                                                                                 |
| public     | platform_settings        | platform_settings_admin_delete   | PERMISSIVE | {public} | DELETE | is_platform_admin()                                                                                                                                                                                                                                                                                              | null                                                                                                                                                                                                                                                                                 |
| public     | platform_settings        | platform_settings_admin_insert   | PERMISSIVE | {public} | INSERT | null                                                                                                                                                                                                                                                                                                             | is_platform_admin()                                                                                                                                                                                                                                                                  |
| public     | platform_settings        | platform_settings_admin_update   | PERMISSIVE | {public} | UPDATE | is_platform_admin()                                                                                                                                                                                                                                                                                              | null                                                                                                                                                                                                                                                                                 |
| public     | platform_settings        | platform_settings_select         | PERMISSIVE | {public} | SELECT | true                                                                                                                                                                                                                                                                                                             | null                                                                                                                                                                                                                                                                                 |
| public     | shopper_feedback         | shopper_feedback_insert          | PERMISSIVE | {public} | INSERT | null                                                                                                                                                                                                                                                                                                             | (user_id = ( SELECT auth.uid() AS uid))                                                                                                                                                                                                                                              |
| public     | shopper_feedback         | shopper_feedback_select          | PERMISSIVE | {public} | SELECT | (user_id = ( SELECT auth.uid() AS uid))                                                                                                                                                                                                                                                                          | null                                                                                                                                                                                                                                                                                 |
| public     | shopper_feedback         | shopper_feedback_update          | PERMISSIVE | {public} | UPDATE | is_platform_admin()                                                                                                                                                                                                                                                                                              | null                                                                                                                                                                                                                                                                                 |
| public     | transactions             | transactions_insert              | PERMISSIVE | {public} | INSERT | null                                                                                                                                                                                                                                                                                                             | (buyer_user_id = ( SELECT auth.uid() AS uid))                                                                                                                                                                                                                                        |
| public     | transactions             | transactions_select              | PERMISSIVE | {public} | SELECT | ((buyer_user_id = ( SELECT auth.uid() AS uid)) OR (vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids)) OR is_admin_for_vertical(vertical_id))                                                                                                                                    | null                                                                                                                                                                                                                                                                                 |
| public     | transactions             | transactions_update              | PERMISSIVE | {public} | UPDATE | ((buyer_user_id = ( SELECT auth.uid() AS uid)) OR (vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids)))                                                                                                                                                                         | null                                                                                                                                                                                                                                                                                 |
| public     | user_profiles            | user_profiles_insert             | PERMISSIVE | {public} | INSERT | null                                                                                                                                                                                                                                                                                                             | (user_id = ( SELECT auth.uid() AS uid))                                                                                                                                                                                                                                              |
| public     | user_profiles            | user_profiles_select             | PERMISSIVE | {public} | SELECT | (user_id = ( SELECT auth.uid() AS uid))                                                                                                                                                                                                                                                                          | null                                                                                                                                                                                                                                                                                 |
| public     | user_profiles            | user_profiles_update             | PERMISSIVE | {public} | UPDATE | (user_id = ( SELECT auth.uid() AS uid))                                                                                                                                                                                                                                                                          | null                                                                                                                                                                                                                                                                                 |
| public     | vendor_activity_flags    | vendor_activity_flags_access     | PERMISSIVE | {public} | ALL    | (is_platform_admin() OR (EXISTS ( SELECT 1
   FROM vertical_admins va
  WHERE ((va.user_id = ( SELECT auth.uid() AS uid)) AND (va.vertical_id = vendor_activity_flags.vertical_id)))))                                                                                                                           | null                                                                                                                                                                                                                                                                                 |
| public     | vendor_activity_scan_log | vendor_activity_scan_log_admin   | PERMISSIVE | {public} | SELECT | is_platform_admin()                                                                                                                                                                                                                                                                                              | null                                                                                                                                                                                                                                                                                 |
| public     | vendor_activity_settings | vendor_activity_settings_admin   | PERMISSIVE | {public} | ALL    | is_platform_admin()                                                                                                                                                                                                                                                                                              | null                                                                                                                                                                                                                                                                                 |
| public     | vendor_fee_balance       | vendor_fee_balance_select        | PERMISSIVE | {public} | SELECT | (vendor_profile_id IN ( SELECT vendor_profiles.id
   FROM vendor_profiles
  WHERE (vendor_profiles.user_id = auth.uid())))                                                                                                                                                                                       | null                                                                                                                                                                                                                                                                                 |
| public     | vendor_fee_ledger        | vendor_fee_ledger_select         | PERMISSIVE | {public} | SELECT | (vendor_profile_id IN ( SELECT vendor_profiles.id
   FROM vendor_profiles
  WHERE (vendor_profiles.user_id = auth.uid())))                                                                                                                                                                                       | null                                                                                                                                                                                                                                                                                 |
| public     | vendor_feedback          | vendor_feedback_insert           | PERMISSIVE | {public} | INSERT | null                                                                                                                                                                                                                                                                                                             | (vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))                                                                                                                                                                                                |
| public     | vendor_feedback          | vendor_feedback_select           | PERMISSIVE | {public} | SELECT | (vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))                                                                                                                                                                                                                            | null                                                                                                                                                                                                                                                                                 |
| public     | vendor_feedback          | vendor_feedback_update           | PERMISSIVE | {public} | UPDATE | is_platform_admin()                                                                                                                                                                                                                                                                                              | null                                                                                                                                                                                                                                                                                 |
| public     | vendor_location_cache    | Anyone can view vendor locations | PERMISSIVE | {public} | SELECT | true                                                                                                                                                                                                                                                                                                             | null                                                                                                                                                                                                                                                                                 |
| public     | vendor_market_schedules  | vms_delete                       | PERMISSIVE | {public} | DELETE | (vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))                                                                                                                                                                                                                            | null                                                                                                                                                                                                                                                                                 |
| public     | vendor_market_schedules  | vms_insert                       | PERMISSIVE | {public} | INSERT | null                                                                                                                                                                                                                                                                                                             | (vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))                                                                                                                                                                                                |
| public     | vendor_market_schedules  | vms_select                       | PERMISSIVE | {public} | SELECT | true                                                                                                                                                                                                                                                                                                             | null                                                                                                                                                                                                                                                                                 |
| public     | vendor_market_schedules  | vms_update                       | PERMISSIVE | {public} | UPDATE | (vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids))                                                                                                                                                                                                                            | null                                                                                                                                                                                                                                                                                 |
| public     | vendor_payouts           | vendor_payouts_select            | PERMISSIVE | {public} | SELECT | ((vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids)) OR can_admin_vendor(vendor_profile_id))                                                                                                                                                                                                                            | null                                                                                                                                                                                                                                                                                 |
| public     | vendor_profiles          | vendor_profiles_insert           | PERMISSIVE | {public} | INSERT | null                                                                                                                                                                                                                                                                                                             | (user_id = ( SELECT auth.uid() AS uid))                                                                                                                                                                                                                                              |
| public     | vendor_profiles          | vendor_profiles_select           | PERMISSIVE | {public} | SELECT | (((status = 'approved'::vendor_status) AND (deleted_at IS NULL)) OR (user_id = ( SELECT auth.uid() AS uid)) OR (SELECT is_platform_admin()) OR is_admin_for_vertical(vertical_id))                                                                                                                                | null                                                                                                                                                                                                                                                                                 |
| public     | vendor_profiles          | vendor_profiles_update           | PERMISSIVE | {public} | UPDATE | ((user_id = ( SELECT auth.uid() AS uid)) OR (SELECT is_platform_admin()) OR is_admin_for_vertical(vertical_id))                                                                                                                                                                                                  | null                                                                                                                                                                                                                                                                                 |
| public     | vendor_referral_credits  | vendor_referral_credits_select   | PERMISSIVE | {public} | SELECT | ((referrer_vendor_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids)) OR (referred_vendor_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids)))                                                                                                                               | null                                                                                                                                                                                                                                                                                 |
| public     | vendor_verifications     | vendor_verifications_select      | PERMISSIVE | {public} | SELECT | ((vendor_profile_id IN ( SELECT user_vendor_profile_ids() AS user_vendor_profile_ids)) OR (SELECT is_platform_admin()) OR can_admin_vendor(vendor_profile_id))                                                                                                                                                     | null                                                                                                                                                                                                                                                                                 |
| public     | verticals                | verticals_select                 | PERMISSIVE | {public} | SELECT | true                                                                                                                                                                                                                                                                                                             | null                                                                                                                                                                                                                                                                                 |
| public     | verticals                | verticals_admin_insert           | PERMISSIVE | {public} | INSERT | null                                                                                                                                                                                                                                                                                                             | (SELECT is_platform_admin())                                                                                                                                                                                                                                                         |
| public     | verticals                | verticals_admin_update           | PERMISSIVE | {public} | UPDATE | (SELECT is_platform_admin())                                                                                                                                                                                                                                                                                     | null                                                                                                                                                                                                                                                                                 |
| public     | verticals                | verticals_admin_delete           | PERMISSIVE | {public} | DELETE | (SELECT is_platform_admin())                                                                                                                                                                                                                                                                                     | null                                                                                                                                                                                                                                                                                 |
| public     | zip_codes                | zip_codes_public_read            | PERMISSIVE | {public} | SELECT | true                                                                                                                                                                                                                                                                                                             | null                                                                                                                                                                                                                                                                                 |
| public     | zip_codes                | zip_codes_admin_all              | PERMISSIVE | {public} | ALL    | EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin')                                                                                                                                                                                                                              | null                                                                                                                                                                                                                                                                                 |



-- ALL INDEXES AS OF 02/09/2026


| tablename                | indexname                                          | indexdef                                                                                                                                                                                                              |
| ------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| admin_activity_log       | admin_activity_log_pkey                            | CREATE UNIQUE INDEX admin_activity_log_pkey ON public.admin_activity_log USING btree (id)                                                                                                                             |
| admin_activity_log       | idx_admin_activity_log_created_at                  | CREATE INDEX idx_admin_activity_log_created_at ON public.admin_activity_log USING btree (created_at DESC)                                                                                                             |
| admin_activity_log       | idx_admin_activity_log_performed_by                | CREATE INDEX idx_admin_activity_log_performed_by ON public.admin_activity_log USING btree (performed_by)                                                                                                              |
| admin_activity_log       | idx_admin_activity_log_target                      | CREATE INDEX idx_admin_activity_log_target ON public.admin_activity_log USING btree (target_user_id)                                                                                                                  |
| audit_log                | audit_log_pkey                                     | CREATE UNIQUE INDEX audit_log_pkey ON public.audit_log USING btree (id)                                                                                                                                               |
| audit_log                | idx_audit_log_created                              | CREATE INDEX idx_audit_log_created ON public.audit_log USING btree (created_at)                                                                                                                                       |
| audit_log                | idx_audit_log_table                                | CREATE INDEX idx_audit_log_table ON public.audit_log USING btree (table_name)                                                                                                                                         |
| audit_log                | idx_audit_log_user                                 | CREATE INDEX idx_audit_log_user ON public.audit_log USING btree (user_id)                                                                                                                                             |
| cart_items               | cart_items_cart_id_listing_id_key                  | CREATE UNIQUE INDEX cart_items_cart_id_listing_id_key ON public.cart_items USING btree (cart_id, listing_id)                                                                                                          |
| cart_items               | cart_items_pkey                                    | CREATE UNIQUE INDEX cart_items_pkey ON public.cart_items USING btree (id)                                                                                                                                             |
| cart_items               | idx_cart_items_cart                                | CREATE INDEX idx_cart_items_cart ON public.cart_items USING btree (cart_id)                                                                                                                                           |
| cart_items               | idx_cart_items_listing                             | CREATE INDEX idx_cart_items_listing ON public.cart_items USING btree (listing_id)                                                                                                                                     |
| cart_items               | idx_cart_items_market                              | CREATE INDEX idx_cart_items_market ON public.cart_items USING btree (market_id)                                                                                                                                       |
| carts                    | carts_pkey                                         | CREATE UNIQUE INDEX carts_pkey ON public.carts USING btree (id)                                                                                                                                                       |
| carts                    | carts_user_id_vertical_id_key                      | CREATE UNIQUE INDEX carts_user_id_vertical_id_key ON public.carts USING btree (user_id, vertical_id)                                                                                                                  |
| carts                    | idx_carts_user                                     | CREATE INDEX idx_carts_user ON public.carts USING btree (user_id)                                                                                                                                                     |
| carts                    | idx_carts_vertical                                 | CREATE INDEX idx_carts_vertical ON public.carts USING btree (vertical_id)                                                                                                                                             |
| error_logs               | error_logs_pkey                                    | CREATE UNIQUE INDEX error_logs_pkey ON public.error_logs USING btree (id)                                                                                                                                             |
| error_logs               | idx_error_logs_code                                | CREATE INDEX idx_error_logs_code ON public.error_logs USING btree (error_code)                                                                                                                                        |
| error_logs               | idx_error_logs_created                             | CREATE INDEX idx_error_logs_created ON public.error_logs USING btree (created_at DESC)                                                                                                                                |
| error_logs               | idx_error_logs_pg_code                             | CREATE INDEX idx_error_logs_pg_code ON public.error_logs USING btree (pg_code)                                                                                                                                        |
| error_logs               | idx_error_logs_route                               | CREATE INDEX idx_error_logs_route ON public.error_logs USING btree (route)                                                                                                                                            |
| error_logs               | idx_error_logs_severity                            | CREATE INDEX idx_error_logs_severity ON public.error_logs USING btree (severity)                                                                                                                                      |
| error_logs               | idx_error_logs_user                                | CREATE INDEX idx_error_logs_user ON public.error_logs USING btree (user_id)                                                                                                                                           |
| error_reports            | error_reports_pkey                                 | CREATE UNIQUE INDEX error_reports_pkey ON public.error_reports USING btree (id)                                                                                                                                       |
| error_reports            | idx_error_reports_code                             | CREATE INDEX idx_error_reports_code ON public.error_reports USING btree (error_code, created_at DESC)                                                                                                                 |
| error_reports            | idx_error_reports_escalated                        | CREATE INDEX idx_error_reports_escalated ON public.error_reports USING btree (escalation_level, status, created_at DESC) WHERE (escalation_level = 'platform_admin'::text)                                            |
| error_reports            | idx_error_reports_pending                          | CREATE INDEX idx_error_reports_pending ON public.error_reports USING btree (status, created_at DESC) WHERE (status = 'pending'::text)                                                                                 |
| error_reports            | idx_error_reports_resolution                       | CREATE INDEX idx_error_reports_resolution ON public.error_reports USING btree (resolution_id) WHERE (resolution_id IS NOT NULL)                                                                                       |
| error_reports            | idx_error_reports_trace                            | CREATE INDEX idx_error_reports_trace ON public.error_reports USING btree (trace_id) WHERE (trace_id IS NOT NULL)                                                                                                      |
| error_reports            | idx_error_reports_vertical                         | CREATE INDEX idx_error_reports_vertical ON public.error_reports USING btree (vertical_id, status, created_at DESC)                                                                                                    |
| error_resolutions        | error_resolutions_pkey                             | CREATE UNIQUE INDEX error_resolutions_pkey ON public.error_resolutions USING btree (id)                                                                                                                               |
| error_resolutions        | idx_error_resolutions_code                         | CREATE INDEX idx_error_resolutions_code ON public.error_resolutions USING btree (error_code)                                                                                                                          |
| error_resolutions        | idx_error_resolutions_failed                       | CREATE INDEX idx_error_resolutions_failed ON public.error_resolutions USING btree (error_code, status) WHERE (status = 'failed'::text)                                                                                |
| error_resolutions        | idx_error_resolutions_pending                      | CREATE INDEX idx_error_resolutions_pending ON public.error_resolutions USING btree (status, created_at) WHERE (status = 'pending'::text)                                                                              |
| error_resolutions        | idx_error_resolutions_trace                        | CREATE INDEX idx_error_resolutions_trace ON public.error_resolutions USING btree (trace_id) WHERE (trace_id IS NOT NULL)                                                                                              |
| error_resolutions        | idx_error_resolutions_verified                     | CREATE INDEX idx_error_resolutions_verified ON public.error_resolutions USING btree (error_code, status) WHERE (status = 'verified'::text)                                                                            |
| fulfillments             | fulfillments_pkey                                  | CREATE UNIQUE INDEX fulfillments_pkey ON public.fulfillments USING btree (id)                                                                                                                                         |
| fulfillments             | fulfillments_transaction_id_key                    | CREATE UNIQUE INDEX fulfillments_transaction_id_key ON public.fulfillments USING btree (transaction_id)                                                                                                               |
| fulfillments             | idx_fulfillments_status                            | CREATE INDEX idx_fulfillments_status ON public.fulfillments USING btree (status)                                                                                                                                      |
| fulfillments             | idx_fulfillments_transaction                       | CREATE INDEX idx_fulfillments_transaction ON public.fulfillments USING btree (transaction_id)                                                                                                                         |
| listing_images           | idx_listing_images_listing_id                      | CREATE INDEX idx_listing_images_listing_id ON public.listing_images USING btree (listing_id)                                                                                                                          |
| listing_images           | idx_listing_images_order                           | CREATE INDEX idx_listing_images_order ON public.listing_images USING btree (listing_id, display_order)                                                                                                                |
| listing_images           | listing_images_pkey                                | CREATE UNIQUE INDEX listing_images_pkey ON public.listing_images USING btree (id)                                                                                                                                     |
| listing_markets          | idx_listing_markets_listing                        | CREATE INDEX idx_listing_markets_listing ON public.listing_markets USING btree (listing_id)                                                                                                                           |
| listing_markets          | idx_listing_markets_market                         | CREATE INDEX idx_listing_markets_market ON public.listing_markets USING btree (market_id)                                                                                                                             |
| listing_markets          | listing_markets_listing_id_market_id_key           | CREATE UNIQUE INDEX listing_markets_listing_id_market_id_key ON public.listing_markets USING btree (listing_id, market_id)                                                                                            |
| listing_markets          | listing_markets_pkey                               | CREATE UNIQUE INDEX listing_markets_pkey ON public.listing_markets USING btree (id)                                                                                                                                   |
| listings                 | idx_listings_available                             | CREATE INDEX idx_listings_available ON public.listings USING btree (available_from, available_to)                                                                                                                     |
| listings                 | idx_listings_category                              | CREATE INDEX idx_listings_category ON public.listings USING btree (vertical_id, category) WHERE (deleted_at IS NULL)                                                                                                  |
| listings                 | idx_listings_city                                  | CREATE INDEX idx_listings_city ON public.listings USING btree (city)                                                                                                                                                  |
| listings                 | idx_listings_data                                  | CREATE INDEX idx_listings_data ON public.listings USING gin (listing_data)                                                                                                                                            |
| listings                 | idx_listings_location                              | CREATE INDEX idx_listings_location ON public.listings USING btree (latitude, longitude) WHERE (latitude IS NOT NULL)                                                                                                  |
| listings                 | idx_listings_premium_window                        | CREATE INDEX idx_listings_premium_window ON public.listings USING btree (premium_window_ends_at) WHERE (premium_window_ends_at IS NOT NULL)                                                                           |
| listings                 | idx_listings_status                                | CREATE INDEX idx_listings_status ON public.listings USING btree (status)                                                                                                                                              |
| listings                 | idx_listings_vendor                                | CREATE INDEX idx_listings_vendor ON public.listings USING btree (vendor_profile_id)                                                                                                                                   |
| listings                 | idx_listings_vendor_created                        | CREATE INDEX idx_listings_vendor_created ON public.listings USING btree (vendor_profile_id, created_at DESC) WHERE (deleted_at IS NULL)                                                                               |
| listings                 | idx_listings_vendor_status                         | CREATE INDEX idx_listings_vendor_status ON public.listings USING btree (vendor_profile_id, status) WHERE (deleted_at IS NULL)                                                                                         |
| listings                 | idx_listings_vertical                              | CREATE INDEX idx_listings_vertical ON public.listings USING btree (vertical_id)                                                                                                                                       |
| listings                 | idx_listings_vertical_status                       | CREATE INDEX idx_listings_vertical_status ON public.listings USING btree (vertical_id, status) WHERE (deleted_at IS NULL)                                                                                             |
| listings                 | idx_listings_vertical_status_created               | CREATE INDEX idx_listings_vertical_status_created ON public.listings USING btree (vertical_id, status, created_at DESC) WHERE (deleted_at IS NULL)                                                                    |
| listings                 | listings_pkey                                      | CREATE UNIQUE INDEX listings_pkey ON public.listings USING btree (id)                                                                                                                                                 |
| listings                 | idx_listings_vertical_created                      | CREATE INDEX idx_listings_vertical_created ON public.listings USING btree (vertical_id, deleted_at, created_at DESC) WHERE (deleted_at IS NULL)                                                                       |
| market_box_offerings     | idx_market_box_offerings_active                    | CREATE INDEX idx_market_box_offerings_active ON public.market_box_offerings USING btree (active) WHERE (active = true)                                                                                                |
| market_box_offerings     | idx_market_box_offerings_market                    | CREATE INDEX idx_market_box_offerings_market ON public.market_box_offerings USING btree (pickup_market_id)                                                                                                            |
| market_box_offerings     | idx_market_box_offerings_vendor                    | CREATE INDEX idx_market_box_offerings_vendor ON public.market_box_offerings USING btree (vendor_profile_id)                                                                                                           |
| market_box_offerings     | idx_market_box_offerings_vendor_active             | CREATE INDEX idx_market_box_offerings_vendor_active ON public.market_box_offerings USING btree (vendor_profile_id, active)                                                                                            |
| market_box_offerings     | idx_market_box_offerings_vertical                  | CREATE INDEX idx_market_box_offerings_vertical ON public.market_box_offerings USING btree (vertical_id)                                                                                                               |
| market_box_offerings     | idx_market_box_premium_window                      | CREATE INDEX idx_market_box_premium_window ON public.market_box_offerings USING btree (premium_window_ends_at) WHERE (premium_window_ends_at IS NOT NULL)                                                             |
| market_box_offerings     | market_box_offerings_pkey                          | CREATE UNIQUE INDEX market_box_offerings_pkey ON public.market_box_offerings USING btree (id)                                                                                                                         |
| market_box_pickups       | idx_market_box_pickups_date                        | CREATE INDEX idx_market_box_pickups_date ON public.market_box_pickups USING btree (scheduled_date)                                                                                                                    |
| market_box_pickups       | idx_market_box_pickups_status                      | CREATE INDEX idx_market_box_pickups_status ON public.market_box_pickups USING btree (status)                                                                                                                          |
| market_box_pickups       | idx_market_box_pickups_sub                         | CREATE INDEX idx_market_box_pickups_sub ON public.market_box_pickups USING btree (subscription_id)                                                                                                                    |
| market_box_pickups       | idx_market_box_pickups_upcoming                    | CREATE INDEX idx_market_box_pickups_upcoming ON public.market_box_pickups USING btree (scheduled_date, status) WHERE (status = ANY (ARRAY['scheduled'::market_box_pickup_status, 'ready'::market_box_pickup_status])) |
| market_box_pickups       | market_box_pickups_pkey                            | CREATE UNIQUE INDEX market_box_pickups_pkey ON public.market_box_pickups USING btree (id)                                                                                                                             |
| market_box_pickups       | market_box_pickups_subscription_id_week_number_key | CREATE UNIQUE INDEX market_box_pickups_subscription_id_week_number_key ON public.market_box_pickups USING btree (subscription_id, week_number)                                                                        |
| market_box_pickups       | idx_market_box_pickups_sub_date_status             | CREATE INDEX idx_market_box_pickups_sub_date_status ON public.market_box_pickups USING btree (subscription_id, scheduled_date, status) WHERE (status IN ('scheduled', 'ready'))                                       |
| market_box_subscriptions | idx_market_box_subs_active                         | CREATE INDEX idx_market_box_subs_active ON public.market_box_subscriptions USING btree (offering_id, status) WHERE (status = 'active'::market_box_subscription_status)                                                |
| market_box_subscriptions | idx_market_box_subs_buyer                          | CREATE INDEX idx_market_box_subs_buyer ON public.market_box_subscriptions USING btree (buyer_user_id)                                                                                                                 |
| market_box_subscriptions | idx_market_box_subs_offering                       | CREATE INDEX idx_market_box_subs_offering ON public.market_box_subscriptions USING btree (offering_id)                                                                                                                |
| market_box_subscriptions | idx_market_box_subs_status                         | CREATE INDEX idx_market_box_subs_status ON public.market_box_subscriptions USING btree (status)                                                                                                                       |
| market_box_subscriptions | idx_market_box_subscriptions_buyer_offering        | CREATE INDEX idx_market_box_subscriptions_buyer_offering ON public.market_box_subscriptions USING btree (buyer_user_id, offering_id, status)                                                                          |
| market_box_subscriptions | idx_market_box_subscriptions_offering_status       | CREATE INDEX idx_market_box_subscriptions_offering_status ON public.market_box_subscriptions USING btree (offering_id, status)                                                                                        |
| market_box_subscriptions | idx_market_box_subscriptions_payment_intent        | CREATE UNIQUE INDEX idx_market_box_subscriptions_payment_intent ON public.market_box_subscriptions USING btree (stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL)                                |
| market_box_subscriptions | idx_market_box_subscriptions_user                  | CREATE INDEX idx_market_box_subscriptions_user ON public.market_box_subscriptions USING btree (buyer_user_id, status)                                                                                                 |
| market_box_subscriptions | market_box_subscriptions_pkey                      | CREATE UNIQUE INDEX market_box_subscriptions_pkey ON public.market_box_subscriptions USING btree (id)                                                                                                                 |
| market_box_subscriptions | idx_market_box_subscriptions_offering_active       | CREATE INDEX idx_market_box_subscriptions_offering_active ON public.market_box_subscriptions USING btree (offering_id, status) WHERE (status = 'active')                                                              |
| market_schedules         | idx_market_schedules_day                           | CREATE INDEX idx_market_schedules_day ON public.market_schedules USING btree (day_of_week)                                                                                                                            |
| market_schedules         | idx_market_schedules_market                        | CREATE INDEX idx_market_schedules_market ON public.market_schedules USING btree (market_id)                                                                                                                           |
| market_schedules         | idx_market_schedules_market_active                 | CREATE INDEX idx_market_schedules_market_active ON public.market_schedules USING btree (market_id, active) WHERE (active = true)                                                                                      |
| market_schedules         | market_schedules_pkey                              | CREATE UNIQUE INDEX market_schedules_pkey ON public.market_schedules USING btree (id)                                                                                                                                 |
| market_vendors           | idx_market_vendors_market                          | CREATE INDEX idx_market_vendors_market ON public.market_vendors USING btree (market_id)                                                                                                                               |
| market_vendors           | idx_market_vendors_market_approved                 | CREATE INDEX idx_market_vendors_market_approved ON public.market_vendors USING btree (market_id, approved)                                                                                                            |
| market_vendors           | idx_market_vendors_vendor                          | CREATE INDEX idx_market_vendors_vendor ON public.market_vendors USING btree (vendor_profile_id)                                                                                                                       |
| market_vendors           | market_vendors_market_id_vendor_profile_id_key     | CREATE UNIQUE INDEX market_vendors_market_id_vendor_profile_id_key ON public.market_vendors USING btree (market_id, vendor_profile_id)                                                                                |
| market_vendors           | market_vendors_pkey                                | CREATE UNIQUE INDEX market_vendors_pkey ON public.market_vendors USING btree (id)                                                                                                                                     |
| markets                  | idx_markets_active                                 | CREATE INDEX idx_markets_active ON public.markets USING btree (active)                                                                                                                                                |
| markets                  | idx_markets_coordinates                            | CREATE INDEX idx_markets_coordinates ON public.markets USING btree (latitude, longitude) WHERE ((latitude IS NOT NULL) AND (longitude IS NOT NULL))                                                                   |
| markets                  | idx_markets_expires_at                             | CREATE INDEX idx_markets_expires_at ON public.markets USING btree (expires_at) WHERE (expires_at IS NOT NULL)                                                                                                         |
| markets                  | idx_markets_location                               | CREATE INDEX idx_markets_location ON public.markets USING btree (latitude, longitude) WHERE (latitude IS NOT NULL)                                                                                                    |
| markets                  | idx_markets_pending                                | CREATE INDEX idx_markets_pending ON public.markets USING btree (status, vertical_id) WHERE (status = 'pending'::text)                                                                                                 |
| markets                  | idx_markets_status                                 | CREATE INDEX idx_markets_status ON public.markets USING btree (status)                                                                                                                                                |
| markets                  | idx_markets_submitted_by                           | CREATE INDEX idx_markets_submitted_by ON public.markets USING btree (submitted_by)                                                                                                                                    |
| notifications            | idx_notifications_user_unread                      | CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, read_at, created_at DESC) WHERE (read_at IS NULL)                                                                            |
| notifications            | idx_notifications_user_created                     | CREATE INDEX idx_notifications_user_created ON public.notifications USING btree (user_id, created_at DESC)                                                                                                            |
| order_items              | idx_order_items_status_expires                     | CREATE INDEX idx_order_items_status_expires ON public.order_items USING btree (status, expires_at) WHERE (status = 'pending' AND cancelled_at IS NULL)                                                                |
| order_items              | idx_order_items_vendor_status_created              | CREATE INDEX idx_order_items_vendor_status_created ON public.order_items USING btree (vendor_profile_id, status, created_at DESC) WHERE (cancelled_at IS NULL)                                                        |
| order_items              | idx_order_items_pickup_date_market                 | CREATE INDEX idx_order_items_pickup_date_market ON public.order_items USING btree (pickup_date, market_id, status) WHERE (status != 'cancelled' AND pickup_date IS NOT NULL)                                          |
| orders                   | idx_orders_parent_id                               | CREATE INDEX idx_orders_parent_id ON public.orders USING btree (parent_order_id) WHERE (parent_order_id IS NOT NULL)                                                                                                  |
| orders                   | idx_orders_vertical_created                        | CREATE INDEX idx_orders_vertical_created ON public.orders USING btree (vertical_id, created_at DESC)                                                                                                                  |
| zip_codes                | zip_codes_pkey                                     | CREATE UNIQUE INDEX zip_codes_pkey ON public.zip_codes USING btree (zip)                                                                                                                                              |
| zip_codes                | idx_zip_codes_state                                | CREATE INDEX idx_zip_codes_state ON public.zip_codes USING btree (state)                                                                                                                                              |
| zip_codes                | idx_zip_codes_region                               | CREATE INDEX idx_zip_codes_region ON public.zip_codes USING btree (region_code) WHERE (region_code IS NOT NULL)                                                                                                       |
| zip_codes                | idx_zip_codes_active_market                        | CREATE INDEX idx_zip_codes_active_market ON public.zip_codes USING btree (active_market_area) WHERE (active_market_area = true)                                                                                       |
| zip_codes                | idx_zip_codes_city_state                           | CREATE INDEX idx_zip_codes_city_state ON public.zip_codes USING btree (city, state)                                                                                                                                   |
| zip_codes                | idx_zip_codes_coords                               | CREATE INDEX idx_zip_codes_coords ON public.zip_codes USING btree (latitude, longitude)                                                                                                                               |



-- ALL FUNCTIONS AS OF 02/04/2026 



| routine_name                        | routine_type | return_type              |
| ----------------------------------- | ------------ | ------------------------ |
| _postgis_deprecate                  | FUNCTION     | void                     |
| _postgis_index_extent               | FUNCTION     | USER-DEFINED             |
| _postgis_join_selectivity           | FUNCTION     | double precision         |
| _postgis_pgsql_version              | FUNCTION     | text                     |
| _postgis_scripts_pgsql_version      | FUNCTION     | text                     |
| _postgis_selectivity                | FUNCTION     | double precision         |
| _postgis_stats                      | FUNCTION     | text                     |
| _st_3ddfullywithin                  | FUNCTION     | boolean                  |
| _st_3ddwithin                       | FUNCTION     | boolean                  |
| _st_3dintersects                    | FUNCTION     | boolean                  |
| _st_asgml                           | FUNCTION     | text                     |
| _st_asx3d                           | FUNCTION     | text                     |
| _st_bestsrid                        | FUNCTION     | integer                  |
| _st_bestsrid                        | FUNCTION     | integer                  |
| _st_contains                        | FUNCTION     | boolean                  |
| _st_containsproperly                | FUNCTION     | boolean                  |
| _st_coveredby                       | FUNCTION     | boolean                  |
| _st_coveredby                       | FUNCTION     | boolean                  |
| _st_covers                          | FUNCTION     | boolean                  |
| _st_covers                          | FUNCTION     | boolean                  |
| _st_crosses                         | FUNCTION     | boolean                  |
| _st_dfullywithin                    | FUNCTION     | boolean                  |
| _st_distancetree                    | FUNCTION     | double precision         |
| _st_distancetree                    | FUNCTION     | double precision         |
| _st_distanceuncached                | FUNCTION     | double precision         |
| _st_distanceuncached                | FUNCTION     | double precision         |
| _st_distanceuncached                | FUNCTION     | double precision         |
| _st_dwithin                         | FUNCTION     | boolean                  |
| _st_dwithin                         | FUNCTION     | boolean                  |
| _st_dwithinuncached                 | FUNCTION     | boolean                  |
| _st_dwithinuncached                 | FUNCTION     | boolean                  |
| _st_equals                          | FUNCTION     | boolean                  |
| _st_expand                          | FUNCTION     | USER-DEFINED             |
| _st_geomfromgml                     | FUNCTION     | USER-DEFINED             |
| _st_intersects                      | FUNCTION     | boolean                  |
| _st_linecrossingdirection           | FUNCTION     | integer                  |
| _st_longestline                     | FUNCTION     | USER-DEFINED             |
| _st_maxdistance                     | FUNCTION     | double precision         |
| _st_orderingequals                  | FUNCTION     | boolean                  |
| _st_overlaps                        | FUNCTION     | boolean                  |
| _st_pointoutside                    | FUNCTION     | USER-DEFINED             |
| _st_sortablehash                    | FUNCTION     | bigint                   |
| _st_touches                         | FUNCTION     | boolean                  |
| _st_voronoi                         | FUNCTION     | USER-DEFINED             |
| _st_within                          | FUNCTION     | boolean                  |
| addauth                             | FUNCTION     | boolean                  |
| addgeometrycolumn                   | FUNCTION     | text                     |
| addgeometrycolumn                   | FUNCTION     | text                     |
| addgeometrycolumn                   | FUNCTION     | text                     |
| auto_add_schedule_to_vendors        | FUNCTION     | trigger                  |
| auto_create_vendor_schedules        | FUNCTION     | trigger                  |
| auto_create_vendor_schedules_insert | FUNCTION     | trigger                  |
| award_referral_credit_on_first_sale | FUNCTION     | trigger                  |
| box                                 | FUNCTION     | box                      |
| box                                 | FUNCTION     | box                      |
| box2d                               | FUNCTION     | USER-DEFINED             |
| box2d                               | FUNCTION     | USER-DEFINED             |
| box2d_in                            | FUNCTION     | USER-DEFINED             |
| box2d_out                           | FUNCTION     | cstring                  |
| box2df_in                           | FUNCTION     | USER-DEFINED             |
| box2df_out                          | FUNCTION     | cstring                  |
| box3d                               | FUNCTION     | USER-DEFINED             |
| box3d                               | FUNCTION     | USER-DEFINED             |
| box3d_in                            | FUNCTION     | USER-DEFINED             |
| box3d_out                           | FUNCTION     | cstring                  |
| box3dtobox                          | FUNCTION     | box                      |
| bytea                               | FUNCTION     | bytea                    |
| bytea                               | FUNCTION     | bytea                    |
| calculate_order_item_expiration     | FUNCTION     | timestamp with time zone |
| can_access_pickup                   | FUNCTION     | boolean                  |
| can_access_subscription             | FUNCTION     | boolean                  |
| can_vendor_add_fixed_market         | FUNCTION     | boolean                  |
| can_vendor_add_listing_to_market    | FUNCTION     | boolean                  |
| check_subscription_completion       | FUNCTION     | trigger                  |
| checkauth                           | FUNCTION     | integer                  |
| checkauth                           | FUNCTION     | integer                  |
| checkauthtrigger                    | FUNCTION     | trigger                  |
| contains_2d                         | FUNCTION     | boolean                  |
| contains_2d                         | FUNCTION     | boolean                  |
| contains_2d                         | FUNCTION     | boolean                  |
| create_market_box_pickups           | FUNCTION     | trigger                  |
| create_profile_for_user             | FUNCTION     | trigger                  |
| disablelongtransactions             | FUNCTION     | text                     |
| dropgeometrycolumn                  | FUNCTION     | text                     |
| dropgeometrycolumn                  | FUNCTION     | text                     |
| dropgeometrycolumn                  | FUNCTION     | text                     |
| dropgeometrytable                   | FUNCTION     | text                     |
| dropgeometrytable                   | FUNCTION     | text                     |
| dropgeometrytable                   | FUNCTION     | text                     |
| enablelongtransactions              | FUNCTION     | text                     |
| equals                              | FUNCTION     | boolean                  |
| find_srid                           | FUNCTION     | integer                  |
| generate_vendor_referral_code       | FUNCTION     | text                     |
| geog_brin_inclusion_add_value       | FUNCTION     | boolean                  |
| geography                           | FUNCTION     | USER-DEFINED             |
| geography                           | FUNCTION     | USER-DEFINED             |
| geography                           | FUNCTION     | USER-DEFINED             |
| geography_analyze                   | FUNCTION     | boolean                  |
| geography_cmp                       | FUNCTION     | integer                  |
| geography_distance_knn              | FUNCTION     | double precision         |



-- ALL TRIGGERS AS OF 02/04/2026 



| trigger_name                                | event_manipulation | event_object_table       | action_statement                                       |
| ------------------------------------------- | ------------------ | ------------------------ | ------------------------------------------------------ |
| set_cart_items_updated_at                   | UPDATE             | cart_items               | EXECUTE FUNCTION update_updated_at_column()            |
| set_carts_updated_at                        | UPDATE             | carts                    | EXECUTE FUNCTION update_updated_at_column()            |
| error_reports_updated_at                    | UPDATE             | error_reports            | EXECUTE FUNCTION update_error_reports_updated_at()     |
| error_resolutions_updated_at                | UPDATE             | error_resolutions        | EXECUTE FUNCTION update_error_resolutions_updated_at() |
| update_fulfillments_updated_at              | UPDATE             | fulfillments             | EXECUTE FUNCTION update_updated_at_column()            |
| trg_vlc_listing_market_change               | INSERT             | listing_markets          | EXECUTE FUNCTION trg_refresh_vendor_location()         |
| trg_vlc_listing_market_change               | DELETE             | listing_markets          | EXECUTE FUNCTION trg_refresh_vendor_location()         |
| trg_vlc_listing_change                      | INSERT             | listings                 | EXECUTE FUNCTION trg_refresh_vendor_location()         |
| trg_vlc_listing_change                      | DELETE             | listings                 | EXECUTE FUNCTION trg_refresh_vendor_location()         |
| trg_vlc_listing_change                      | UPDATE             | listings                 | EXECUTE FUNCTION trg_refresh_vendor_location()         |
| trigger_listing_premium_window              | INSERT             | listings                 | EXECUTE FUNCTION set_listing_premium_window()          |
| trigger_listing_premium_window              | UPDATE             | listings                 | EXECUTE FUNCTION set_listing_premium_window()          |
| update_listings_updated_at                  | UPDATE             | listings                 | EXECUTE FUNCTION update_updated_at_column()            |
| vendor_activity_listing_trigger             | INSERT             | listings                 | EXECUTE FUNCTION update_vendor_activity_on_listing()   |
| vendor_activity_listing_trigger             | UPDATE             | listings                 | EXECUTE FUNCTION update_vendor_activity_on_listing()   |
| trigger_market_box_premium_window           | INSERT             | market_box_offerings     | EXECUTE FUNCTION set_market_box_premium_window()       |
| trigger_market_box_premium_window           | UPDATE             | market_box_offerings     | EXECUTE FUNCTION set_market_box_premium_window()       |
| trigger_check_subscription_completion       | UPDATE             | market_box_pickups       | EXECUTE FUNCTION check_subscription_completion()       |
| trigger_create_market_box_pickups           | INSERT             | market_box_subscriptions | EXECUTE FUNCTION create_market_box_pickups()           |
| trigger_auto_add_schedule_to_vendors        | INSERT             | market_schedules         | EXECUTE FUNCTION auto_add_schedule_to_vendors()        |
| trigger_auto_add_schedule_to_vendors_update | UPDATE             | market_schedules         | EXECUTE FUNCTION auto_add_schedule_to_vendors()        |
| trigger_market_schedule_deactivation        | UPDATE             | market_schedules         | EXECUTE FUNCTION handle_market_schedule_deactivation() |
| trigger_auto_create_vendor_schedules        | UPDATE             | market_vendors           | EXECUTE FUNCTION auto_create_vendor_schedules()        |
| trigger_auto_create_vendor_schedules_insert | INSERT             | market_vendors           | EXECUTE FUNCTION auto_create_vendor_schedules_insert() |
| set_markets_updated_at                      | UPDATE             | markets                  | EXECUTE FUNCTION update_updated_at_column()            |
| order_items_updated_at                      | UPDATE             | order_items              | EXECUTE FUNCTION update_updated_at_column()            |
| trigger_set_order_item_expiration           | UPDATE             | order_items              | EXECUTE FUNCTION set_order_item_expiration()           |
| trigger_set_order_item_expiration           | INSERT             | order_items              | EXECUTE FUNCTION set_order_item_expiration()           |
| trigger_update_vendor_rating_stats          | UPDATE             | order_ratings            | EXECUTE FUNCTION update_vendor_rating_stats()          |
| trigger_update_vendor_rating_stats          | INSERT             | order_ratings            | EXECUTE FUNCTION update_vendor_rating_stats()          |
| trigger_update_vendor_rating_stats          | DELETE             | order_ratings            | EXECUTE FUNCTION update_vendor_rating_stats()          |
| orders_updated_at                           | UPDATE             | orders                   | EXECUTE FUNCTION update_updated_at_column()            |
| referral_credit_on_sale_trigger             | UPDATE             | orders                   | EXECUTE FUNCTION award_referral_credit_on_first_sale() |
| vendor_activity_order_trigger               | INSERT             | orders                   | EXECUTE FUNCTION update_vendor_activity_on_order()     |
| update_organizations_updated_at             | UPDATE             | organizations            | EXECUTE FUNCTION update_updated_at_column()            |
| payments_updated_at                         | UPDATE             | payments                 | EXECUTE FUNCTION update_updated_at_column()            |
| update_shopper_feedback_updated_at          | UPDATE             | shopper_feedback         | EXECUTE FUNCTION update_updated_at_column()            |
| notify_new_transaction                      | INSERT             | transactions             | EXECUTE FUNCTION notify_transaction_status_change()    |
| notify_transaction_status                   | UPDATE             | transactions             | EXECUTE FUNCTION notify_transaction_status_change()    |
| update_transactions_updated_at              | UPDATE             | transactions             | EXECUTE FUNCTION update_updated_at_column()            |
| update_user_profiles_updated_at             | UPDATE             | user_profiles            | EXECUTE FUNCTION update_updated_at_column()            |
| trigger_update_vendor_fee_balance           | INSERT             | vendor_fee_ledger        | EXECUTE FUNCTION update_vendor_fee_balance()           |
| trigger_update_vendor_fee_balance           | DELETE             | vendor_fee_ledger        | EXECUTE FUNCTION update_vendor_fee_balance()           |
| trigger_update_vendor_fee_balance           | UPDATE             | vendor_fee_ledger        | EXECUTE FUNCTION update_vendor_fee_balance()           |
| update_vendor_feedback_updated_at           | UPDATE             | vendor_feedback          | EXECUTE FUNCTION update_updated_at_column()            |
| update_vms_updated_at                       | UPDATE             | vendor_market_schedules  | EXECUTE FUNCTION update_updated_at_column()            |
| vendor_payouts_updated_at                   | UPDATE             | vendor_payouts           | EXECUTE FUNCTION update_updated_at_column()            |
| track_vendor_status                         | UPDATE             | vendor_profiles          | EXECUTE FUNCTION track_vendor_status_change()          |
| trg_vlc_vendor_change                       | INSERT             | vendor_profiles          | EXECUTE FUNCTION trg_refresh_vendor_location()         |
| trg_vlc_vendor_change                       | UPDATE             | vendor_profiles          | EXECUTE FUNCTION trg_refresh_vendor_location()         |
| trg_vlc_vendor_change                       | DELETE             | vendor_profiles          | EXECUTE FUNCTION trg_refresh_vendor_location()         |
| update_vendor_profiles_updated_at           | UPDATE             | vendor_profiles          | EXECUTE FUNCTION update_updated_at_column()            |
| vendor_referral_code_trigger                | INSERT             | vendor_profiles          | EXECUTE FUNCTION trigger_generate_referral_code()      |
| sync_vendor_verification                    | UPDATE             | vendor_verifications     | EXECUTE FUNCTION sync_verification_status()            |
| update_vendor_verifications_updated_at      | UPDATE             | vendor_verifications     | EXECUTE FUNCTION update_updated_at_column()            |
| update_verticals_updated_at                 | UPDATE             | verticals                | EXECUTE FUNCTION update_updated_at_column()            |



-- ALL VIEWS AS OF 02/04/2026



| view_name                          |
| ---------------------------------- |
| active_markets                     |
| geography_columns                  |
| geometry_columns                   |
| market_vendor_counts               |
| v_error_frequency                  |
| v_failed_approaches                |
| v_platform_admin_escalated_reports |
| v_verified_solutions               |
| v_vertical_admin_pending_reports   |
| vendor_referral_summary            |



---

## Key Helper Functions

These are SECURITY DEFINER functions used by RLS policies and triggers.

### Admin Role Functions (20260203_002)

| Function | Returns | Description |
|----------|---------|-------------|
| `is_platform_admin()` | BOOLEAN | Returns true if current user has `role = 'admin'` OR `'admin' = ANY(roles)` in user_profiles |
| `is_vertical_admin(p_vertical_id TEXT)` | BOOLEAN | Returns true if current user is in `vertical_admins` table for the specified vertical |
| `is_admin_for_vertical(p_vertical_id TEXT)` | BOOLEAN | Returns true if user is platform admin OR vertical admin for the specified vertical |
| `is_any_admin()` | BOOLEAN | Returns true if user is any type of admin (platform or any vertical) |
| `get_user_admin_verticals()` | TABLE(vertical_id, is_platform_admin, is_vertical_admin) | Returns list of verticals the current user can administer |

### Vertical Admin Helper Functions (20260203_003)

| Function | Returns | Description |
|----------|---------|-------------|
| `can_admin_market(p_market_id UUID)` | BOOLEAN | Returns true if user can admin the market's vertical |
| `can_admin_order(p_order_id UUID)` | BOOLEAN | Returns true if user can admin the order's vertical |
| `can_admin_vendor(p_vendor_profile_id UUID)` | BOOLEAN | Returns true if user can admin the vendor's vertical |

### ZIP Code Lookup Functions (20260204_001)

| Function | Returns | Description |
|----------|---------|-------------|
| `get_zip_coordinates(zip_code VARCHAR(5))` | TABLE(latitude, longitude, city, state) | Returns coordinates and location info for a ZIP code |
| `get_nearby_zip_codes(user_lat, user_lng, limit_count)` | TABLE(zip, city, state, distance_miles) | Finds nearby ZIP codes using Haversine formula |
| `get_region_zip_codes(region VARCHAR(20))` | TABLE(zip, city, state, latitude, longitude) | Returns all ZIP codes in a partner territory region |

### Premium Window Trigger Functions

| Function | Trigger On | Description |
|----------|------------|-------------|
| `set_listing_premium_window()` | listings INSERT/UPDATE | Sets `premium_window_ends_at` when listing is published or restocked |
| `set_market_box_premium_window()` | market_box_offerings INSERT/UPDATE | Sets `premium_window_ends_at` when offering is activated or capacity increased. **Note:** Uses `active` column (not `is_active`) - fixed in 20260203_004 |

---

## Known Issues & Fixes

| Issue | Fix Migration | Notes |
|-------|---------------|-------|
| `set_market_box_premium_window()` referenced `is_active` instead of `active` | 20260203_004 | Caused "record 'new' has no field 'is_active'" error on market box creation |
| `is_platform_admin()` only checked `roles` array, not `role` column | 20260203_002 | Caused admins with `role = 'admin'` to not be recognized |

---

## Application Behavior (Not in Schema)

### Inventory Management (added 2026-02-06)

**Location:** `src/app/api/checkout/success/route.ts`

When payment succeeds:
1. `listings.quantity` is decremented by purchased amount
2. If `quantity = null`, no decrement (unlimited stock)
3. Decrement floors at 0 (never negative)
4. Idempotent: only runs when payment record is first created

**Low Stock Threshold:** 5 items

### Notification Types (stored in `notifications.type`)

| Type | Trigger | Message |
|------|---------|---------|
| `inventory_out_of_stock` | `listings.quantity` hits 0 after purchase | "X is now out of stock. Update your listing to add more inventory." |
| `inventory_low_stock` | `listings.quantity` drops below 5 (and was above 5 before) | "X has only N left in stock." |
| `pickup_issue_reported` | Buyer reports issue with order item | "A buyer reported an issue with their order: ..." |
| `pickup_confirmation_needed` | Buyer acknowledges receipt, vendor has 30s to fulfill | "Buyer acknowledged receipt. Please tap Fulfill within 30 seconds." |

### Pricing (in `src/lib/pricing.ts`)

| Fee | Amount | Applied To |
|-----|--------|------------|
| Buyer % fee | 6.5% | Item prices (display & Stripe) |
| Buyer flat fee | $0.15 | Order total (once per order) |
| Vendor % fee | 6.5% | Deducted from vendor payout |
| Vendor flat fee | $0.15 | Deducted from vendor payout |
| Minimum order | $10.00 | Before fees |

**Functions:**
- `calculateItemDisplayPrice(baseCents)` → price with 6.5% (for item display)
- `calculateBuyerPrice(subtotalCents)` → total with 6.5% + $0.15 (for order totals)
- `calculateOrderPricing(items)` → full breakdown for checkout