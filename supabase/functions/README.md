# PostgreSQL Functions Reference

**Last Updated:** 2026-02-20
**Total Functions:** 57

This is a reference directory documenting the current/final version of all database functions. PostgreSQL only keeps the latest definition, but migration history is hard to parse — this file provides a single place to look up any function.

> **Note:** The "Latest Migration" column shows which migration file contains the current definition. Functions may have been created or rewritten in earlier migrations, but the listed file is the authoritative version.

---

## Quick Lookup

| Function | Type | Purpose |
|----------|------|---------|
| `atomic_complete_order_if_ready` | RPC | Complete order if all items confirmed |
| `atomic_decrement_inventory` | RPC | Race-safe inventory decrement |
| `auto_add_schedule_to_vendors` | Trigger | Auto-create vendor schedule entries on new schedule |
| `auto_create_vendor_schedules` | Trigger | Auto-create schedules when vendor approved |
| `auto_create_vendor_schedules_insert` | Trigger | Same as above, INSERT variant |
| `auto_create_vendor_verification` | Trigger | Create verification row for new vendor |
| `award_referral_credit_on_first_sale` | Trigger | Award referral credit on first completed order |
| `build_pickup_snapshot` | RPC | Freeze pickup details at checkout |
| `calculate_order_item_expiration` | RPC | Calculate expiration timestamp |
| `can_access_pickup` | RLS Helper | Check pickup access (buyer or vendor) |
| `can_access_subscription` | RLS Helper | Check subscription access |
| `can_admin_market` | RLS Helper | Check market admin access |
| `can_admin_order` | RLS Helper | Check order admin access |
| `can_admin_vendor` | RLS Helper | Check vendor admin access |
| `can_delete_schedule` | RPC | Check if schedule can be deleted |
| `can_vendor_publish` | RPC | Check vendor onboarding gates |
| `check_subscription_completion` | Trigger | Auto-complete subscriptions |
| `cleanup_cart_items_invalid_schedules` | RPC | Remove stale cart items |
| `create_market_box_pickups` | Trigger | Create pickup rows for new subscription |
| `create_profile_for_user` | Trigger | Create user_profiles on signup |
| `enforce_listing_tier_limit` | Trigger | Enforce max published listings per tier |
| `generate_vendor_referral_code` | RPC | Generate unique referral code |
| `get_analytics_overview` | RPC | Transaction metrics summary |
| `get_available_pickup_dates` | RPC | Upcoming pickup dates with cutoff status |
| `get_cart_summary` | RPC | Cart totals (items, cents, vendors) |
| `get_listing_fields` | RPC | Vertical listing field config |
| `get_listing_market_availability` | RPC | Market availability for a listing |
| `get_listing_open_markets` | RPC | Markets where listing is available |
| `get_market_cutoff` | RPC | Next order cutoff for a market |
| `get_markets_within_radius` | RPC | Nearby markets via PostGIS |
| `get_nearby_zip_codes` | RPC | Nearest ZIP codes via Haversine |
| `get_next_market_datetime` | RPC | Next occurrence of a market day |
| `get_or_create_cart` | RPC | Get or create cart for user+vertical |
| `get_region_zip_codes` | RPC | ZIP codes for a region |
| `get_schedule_active_order_count` | RPC | Active orders for a schedule |
| `get_top_vendors` | RPC | Top vendors by revenue |
| `get_user_admin_verticals` | RPC | Verticals user can administer |
| `get_user_vendor_ids` | RPC | Vendor IDs owned by current user |
| `get_vendor_next_pickup_date` | RPC | Next pickup for vendor at market |
| `get_vendor_revenue_trends` | RPC | Revenue trends by period |
| `get_vendors_within_radius` | RPC | Nearby vendors via PostGIS |
| `get_vertical_config` | RPC | Full vertical config JSONB |
| `get_vendor_fields` | RPC | Vertical vendor field config |
| `get_zip_coordinates` | RPC | Lat/lng for a ZIP code |
| `handle_market_schedule_deactivation` | Trigger | Cascade schedule deactivation |
| `handle_new_user` | Trigger | Original user profile trigger (superseded) |
| `has_role` | RLS Helper | Check if user has a role |
| `increment_vendor_cancelled` | RPC | Atomic cancellation counter |
| `increment_vendor_confirmed` | RPC | Atomic confirmation counter |
| `is_admin` | RLS Helper | Check admin role |
| `is_admin_for_vertical` | RLS Helper | Check vertical admin access |
| `is_any_admin` | RLS Helper | Check any admin access |
| `is_listing_accepting_orders` | RPC | Check if listing accepts orders |
| `is_order_buyer` | RLS Helper | Check if user is order buyer |
| `is_platform_admin` | RLS Helper | Check platform admin status |
| `is_vertical_admin` | RLS Helper | Check vertical admin status |
| `is_verifier` | RLS Helper | Check verifier role |
| `notify_transaction_status_change` | Trigger | Notify on transaction status change |
| `refresh_all_vendor_locations` | RPC | Rebuild entire location cache |
| `refresh_vendor_location` | RPC | Refresh single vendor location |
| `scan_vendor_activity` | RPC | Flag inactive vendors |
| `set_ft_default_tier` | Trigger | Default food truck vendors to free tier |
| `set_listing_premium_window` | Trigger | Set premium window on publish |
| `set_market_box_premium_window` | Trigger | Set premium window on activation |
| `set_order_item_expiration` | Trigger | Auto-set order item expiration |
| `soft_delete` | Trigger | Soft delete vendor profiles |
| `subscribe_to_market_box_if_capacity` | RPC | Capacity-safe box subscription |
| `sync_verification_status` | Trigger | Propagate verification status |
| `track_vendor_status_change` | Trigger | Audit log for vendor status |
| `trigger_cleanup_cart_on_schedule_change` | Trigger | Clean cart on schedule change |
| `trigger_generate_referral_code` | Trigger | Auto-generate referral code |
| `trg_refresh_vendor_location` | Trigger | Refresh location cache on changes |
| `update_updated_at_column` | Trigger | Generic updated_at setter |
| `update_vendor_activity_on_listing` | Trigger | Track vendor listing activity |
| `update_vendor_activity_on_order` | Trigger | Track vendor order activity |
| `update_vendor_fee_balance` | Trigger | Recalculate vendor fee balance |
| `update_vendor_last_login` | Trigger | Track vendor login |
| `update_vendor_rating_stats` | Trigger | Recalculate vendor ratings |
| `user_buyer_order_ids` | RLS Helper | Buyer's order IDs (SECURITY DEFINER) |
| `user_is_subscription_buyer` | RLS Helper | Check subscription buyer |
| `user_is_subscription_vendor` | RLS Helper | Check subscription vendor |
| `user_owns_vendor` | RLS Helper | Check vendor ownership |
| `user_vendor_order_ids` | RLS Helper | Vendor's order IDs (SECURITY DEFINER) |
| `user_vendor_profile_ids` | RLS Helper | Vendor profile IDs (SECURITY DEFINER) |
| `validate_cart_item_market` | RPC | Validate listing-market combo |
| `validate_cart_item_schedule` | RPC | Validate schedule-date combo |
| `vendor_has_active_schedules` | RPC | Check vendor has active schedules |
| `vendor_skip_week` | RPC | Skip a market box pickup week |
| `update_error_reports_updated_at` | Trigger | Error reports updated_at |
| `update_error_resolutions_updated_at` | Trigger | Error resolutions updated_at |

---

## Detailed Reference

### Atomic Operations

**`atomic_complete_order_if_ready(p_order_id UUID)`**
- **Migration:** `applied/20260210_011_atomic_complete_order.sql`
- Atomically updates order status to `completed` only if ALL non-cancelled items have both buyer and vendor confirmations.

**`atomic_decrement_inventory(p_listing_id UUID, p_quantity INTEGER)`**
- **Migration:** `applied/20260206_001_atomic_inventory_decrement.sql`
- Single UPDATE that decrements inventory (floor 0) to prevent double-decrement race conditions at checkout.

**`increment_vendor_cancelled(p_vendor_id UUID)`**
- **Migration:** `applied/20260209_006_vendor_cancellation_tracking.sql`
- Atomically increments `orders_cancelled_after_confirm_count` on vendor_profiles.

**`increment_vendor_confirmed(p_vendor_id UUID)`**
- **Migration:** `applied/20260209_006_vendor_cancellation_tracking.sql`
- Atomically increments `orders_confirmed_count` on vendor_profiles.

### Availability & Scheduling

**`get_available_pickup_dates(p_listing_id UUID)`**
- **Migration:** `20260221_040_event_availability_function.sql`
- Returns upcoming pickup dates (next 8 days) with cutoff status. Vertical-aware: FM uses 7-day window with advance cutoff; FT parks use today-only until truck closes; FT events use 7-day window with 24h default cutoff.

**`is_listing_accepting_orders(p_listing_id UUID)`**
- **Migration:** `20260205_002_pickup_scheduling_functions.sql`
- Returns true if listing has at least one schedule/date still accepting orders.

**`get_listing_market_availability(p_listing_id UUID)`**
- **Migration:** `20260203_001_security_fixes.sql`
- Returns JSONB array of market availability objects with `is_accepting`, `cutoff_at`, `next_market_at`.

**`get_listing_open_markets(p_listing_id UUID)`**
- **Migration:** `20260124_007_cart_item_market_selection.sql`
- Returns markets where listing is available with `is_accepting` status.

**`get_market_cutoff(p_market_id UUID)`**
- **Migration:** `20260203_001_security_fixes.sql`
- Returns earliest upcoming order cutoff timestamp for a market.

**`get_next_market_datetime(p_day_of_week INTEGER, p_start_time TIME, p_timezone TEXT)`**
- **Migration:** `20260203_001_security_fixes.sql`
- Returns next UTC timestamp for a recurring market day/time.

**`get_vendor_next_pickup_date(p_vendor_profile_id UUID, p_market_id UUID, p_from_date DATE)`**
- **Migration:** `20260128_001_vendor_market_schedules.sql`
- Returns earliest upcoming pickup date for vendor at market.

### Cart & Checkout

**`get_or_create_cart(p_user_id UUID, p_vertical_id TEXT)`**
- **Migration:** `applied/20260213_023_fix_get_or_create_cart_vertical_type.sql`
- Returns cart UUID, creating one if needed.

**`get_cart_summary(p_cart_id UUID)`**
- **Migration:** `applied/20260211_001_cart_items_market_box_support.sql`
- Returns `total_items`, `total_cents`, `vendor_count`.

**`validate_cart_item_market(p_listing_id UUID, p_market_id UUID)`**
- **Migration:** `20260124_007_cart_item_market_selection.sql`
- Validates listing-market combination.

**`validate_cart_item_schedule(p_listing_id UUID, p_schedule_id UUID, p_pickup_date DATE)`**
- **Migration:** `20260205_002_pickup_scheduling_functions.sql`
- Validates schedule/date and checks cutoff.

**`build_pickup_snapshot(p_schedule_id UUID, p_pickup_date DATE)`**
- **Migration:** `20260205_002_pickup_scheduling_functions.sql`
- Creates frozen JSONB of pickup location/time details.

**`subscribe_to_market_box_if_capacity(p_offering_id, p_buyer_user_id, ...)`**
- **Migration:** `applied/20260213_018_atomic_market_box_subscribe.sql`
- Capacity-safe market box subscription with row locking.

### Geolocation

**`get_markets_within_radius(user_lat, user_lng, radius_meters, ...)`**
- **Migration:** `20260117_004_add_postgis_radius_function.sql`
- PostGIS-based nearby markets search.

**`get_vendors_within_radius(user_lat, user_lng, radius_meters, ...)`**
- **Migration:** `20260117_004_add_postgis_radius_function.sql`
- PostGIS-based nearby vendors search.

**`refresh_vendor_location(p_vendor_id UUID)`**
- **Migration:** `20260124_005_vendor_location_cache.sql`
- Refreshes vendor_location_cache for one vendor.

**`refresh_all_vendor_locations()`**
- **Migration:** `20260124_005_vendor_location_cache.sql`
- Rebuilds entire vendor_location_cache.

**`get_zip_coordinates(zip_code VARCHAR(5))`**
- **Migration:** `20260204_001_zip_codes_table.sql`
- Returns lat/lng/city/state for a ZIP.

**`get_nearby_zip_codes(user_lat, user_lng, limit_count)`**
- **Migration:** `20260204_001_zip_codes_table.sql`
- Nearest ZIP codes via Haversine formula.

**`get_region_zip_codes(region VARCHAR(20))`**
- **Migration:** `20260204_001_zip_codes_table.sql`
- ZIP codes for a named region.

### Analytics

**`get_analytics_overview(p_start_date DATE, p_end_date DATE, p_vertical_id TEXT)`**
- **Migration:** `applied/20260212_016_analytics_functions.sql`
- Transaction metrics summary (revenue, orders, avg value).

**`get_top_vendors(p_start_date DATE, p_end_date DATE, p_vertical_id TEXT, p_limit INTEGER)`**
- **Migration:** `applied/20260212_016_analytics_functions.sql`
- Top vendors by revenue.

**`get_vendor_revenue_trends(p_vendor_id UUID, p_start_date, p_end_date, p_period TEXT)`**
- **Migration:** `applied/20260212_016_analytics_functions.sql`
- Revenue/order trends by day/week/month.

### Admin & Authorization (RLS Helpers)

All marked SECURITY DEFINER with `SET search_path = public`.

**`is_platform_admin()`** — `20260203_002_fix_admin_helper_functions.sql`
**`is_admin()`** — `20260103_002_rls_policies.sql` (superseded by is_platform_admin)
**`is_vertical_admin(p_vertical_id TEXT)`** — `20260203_002_fix_admin_helper_functions.sql`
**`is_admin_for_vertical(p_vertical_id TEXT)`** — `20260203_002_fix_admin_helper_functions.sql`
**`is_any_admin()`** — `20260203_002_fix_admin_helper_functions.sql`
**`has_role(check_role user_role)`** — `20260103_002_rls_policies.sql`
**`is_verifier()`** — `20260103_002_rls_policies.sql`
**`can_admin_market(p_market_id UUID)`** — `20260203_003_add_vertical_admin_rls_support.sql`
**`can_admin_order(p_order_id UUID)`** — `20260203_003_add_vertical_admin_rls_support.sql`
**`can_admin_vendor(p_vendor_profile_id UUID)`** — `20260203_003_add_vertical_admin_rls_support.sql`
**`get_user_admin_verticals()`** — `20260203_002_fix_admin_helper_functions.sql`
**`user_vendor_profile_ids()`** — `20260130_007_comprehensive_rls_cleanup.sql`
**`user_buyer_order_ids()`** — `20260130_011_fix_orders_rls_recursion.sql`
**`user_vendor_order_ids()`** — `20260130_011_fix_orders_rls_recursion.sql`
**`is_order_buyer(order_uuid UUID)`** — `20260130_011_fix_orders_rls_recursion.sql`
**`user_owns_vendor(vendor_id UUID)`** — `20260103_003_functions_triggers.sql`
**`get_user_vendor_ids()`** — `20260103_002_rls_policies.sql` (older, see user_vendor_profile_ids)
**`can_access_pickup(p_subscription_id UUID)`** — `20260130_005_fix_all_rls_recursion.sql`
**`can_access_subscription(sub_id UUID)`** — `20260130_007_comprehensive_rls_cleanup.sql`
**`user_is_subscription_buyer(sub_id UUID)`** — `20260130_003_fix_market_box_rls_recursion.sql`
**`user_is_subscription_vendor(sub_id UUID)`** — `20260130_003_fix_market_box_rls_recursion.sql`
**`can_vendor_publish(p_vendor_profile_id UUID, p_category TEXT)`** — `applied/20260210_012_vendor_onboarding.sql`

### Vendor Lifecycle Triggers

**`create_profile_for_user()`** — `20260201_003_fix_user_profile_trigger.sql` — Creates user_profiles on signup
**`handle_new_user()`** — `20260103_003_functions_triggers.sql` — Original (superseded by above)
**`auto_create_vendor_verification()`** — `applied/20260210_012_vendor_onboarding.sql` — Creates verification row on new vendor
**`sync_verification_status()`** — `applied/20260213_021_grandfather_vendor_verifications.sql` — Propagates verification approval to vendor status
**`track_vendor_status_change()`** — `20260103_003_functions_triggers.sql` — Audit log for status changes
**`set_ft_default_tier()`** — `20260218_033_add_free_ft_tier.sql` — Default FT vendors to free tier
**`enforce_listing_tier_limit()`** — `20260220_038_fix_listing_tier_trigger_status.sql` — Max published listings per tier
**`set_listing_premium_window()`** — `applied/20260217_026_vertical_premium_triggers.sql` — Premium window on first publish
**`set_market_box_premium_window()`** — `applied/20260217_026_vertical_premium_triggers.sql` — Premium window on activation
**`scan_vendor_activity(p_vertical_id TEXT)`** — `20260131_001_fix_security_definer_search_path.sql` — Flag inactive vendors
**`update_vendor_activity_on_listing()`** — `20260131_001_fix_security_definer_search_path.sql` — Track listing activity
**`update_vendor_activity_on_order()`** — `20260131_001_fix_security_definer_search_path.sql` — Track order activity
**`update_vendor_last_login()`** — `20260131_001_fix_security_definer_search_path.sql` — Track vendor login
**`update_vendor_rating_stats()`** — `20260123_002_order_ratings.sql` — Recalculate ratings
**`update_vendor_fee_balance()`** — `20260131_003_vendor_payment_methods.sql` — Recalculate fee balance

### Schedule & Market Triggers

**`auto_add_schedule_to_vendors()`** — `20260128_002_backfill_vendor_schedules.sql`
**`auto_create_vendor_schedules()`** — `20260128_002_backfill_vendor_schedules.sql`
**`auto_create_vendor_schedules_insert()`** — `20260128_002_backfill_vendor_schedules.sql`
**`handle_market_schedule_deactivation()`** — `20260128_001_vendor_market_schedules.sql`
**`trigger_cleanup_cart_on_schedule_change()`** — `20260205_002_pickup_scheduling_functions.sql`
**`cleanup_cart_items_invalid_schedules()`** — `20260205_002_pickup_scheduling_functions.sql`
**`can_delete_schedule(p_schedule_id UUID)`** — `20260205_002_pickup_scheduling_functions.sql`
**`get_schedule_active_order_count(p_schedule_id UUID)`** — `20260205_002_pickup_scheduling_functions.sql`
**`vendor_has_active_schedules(p_vendor_profile_id UUID, p_market_id UUID)`** — `20260128_001_vendor_market_schedules.sql`
**`trg_refresh_vendor_location()`** — `20260203_005_fix_market_coordinate_cache_trigger.sql`

### Order Lifecycle

**`calculate_order_item_expiration(p_pickup_date DATE, p_buffer_hours INTEGER)`** — `20260116_005_order_expiration.sql`
**`set_order_item_expiration()`** — `20260116_005_order_expiration.sql`
**`notify_transaction_status_change()`** — `20260103_003_functions_triggers.sql`

### Market Box Subscriptions

**`create_market_box_pickups()`** — `20260130_001_fix_market_box_pickups_rls.sql`
**`check_subscription_completion()`** — `20260123_001_market_box_multi_term.sql`
**`vendor_skip_week(p_pickup_id UUID, p_reason TEXT)`** — `20260123_001_market_box_multi_term.sql`

### Referrals

**`generate_vendor_referral_code(vendor_id UUID)`** — `20260121_001_vendor_referral_system.sql`
**`trigger_generate_referral_code()`** — `20260121_001_vendor_referral_system.sql`
**`award_referral_credit_on_first_sale()`** — `20260121_001_vendor_referral_system.sql`

### Vertical Config

**`get_vertical_config(v_id TEXT)`** — `20260103_003_functions_triggers.sql`
**`get_vendor_fields(v_id TEXT)`** — `20260103_003_functions_triggers.sql`
**`get_listing_fields(v_id TEXT)`** — `20260103_003_functions_triggers.sql`

### Utility

**`update_updated_at_column()`** — `20260103_003_functions_triggers.sql` — Generic updated_at trigger
**`soft_delete()`** — `20260103_003_functions_triggers.sql` — Soft delete (defined, not always attached)
**`update_error_reports_updated_at()`** — `20260126_015_error_reports_table.sql`
**`update_error_resolutions_updated_at()`** — `20260126_012_error_resolutions_table.sql`
