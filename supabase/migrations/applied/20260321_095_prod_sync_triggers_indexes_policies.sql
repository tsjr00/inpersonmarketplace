-- =============================================================================
-- Migration 095: Production Sync — Triggers, Indexes, Tables, Columns, Policies
-- =============================================================================
-- Created: 2026-03-21 (Session 62)
-- Author: Claude Code
-- Purpose: Bring Production in line with Staging before Stripe live mode activation
--
-- Based on full schema comparison (Pre-live DB comparison.txt):
-- - ~58 triggers missing from Prod
-- - ~30 indexes missing from Prod (including unique constraints)
-- - 2 tables missing from Prod
-- - 3 columns missing from Prod
-- - 2 enum values missing from Prod
-- - RLS policy mismatches on vendor_profiles, vendor_verifications, verticals
--
-- All trigger FUNCTIONS already exist on Prod (functions matched).
-- This migration only creates the triggers that attach them to tables.
--
-- IMPORTANT: Run on PRODUCTION only. Staging already has all of these.
-- Uses IF NOT EXISTS / DROP IF EXISTS for idempotency — safe to run on Staging too.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: Missing Tables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

CREATE TABLE IF NOT EXISTS public.public_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_id TEXT NOT NULL REFERENCES verticals(vertical_id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'purchase', 'new_vendor', 'sold_out', 'new_listing'
  )),
  city TEXT,
  item_name TEXT,
  vendor_display_name TEXT,
  item_category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: Missing Columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.market_box_pickups
  ADD COLUMN IF NOT EXISTS buyer_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vendor_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_window_expires_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: Missing Enum Values
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE payout_status ADD VALUE IF NOT EXISTS 'skipped_dev';
ALTER TYPE payout_status ADD VALUE IF NOT EXISTS 'pending_stripe_setup';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: Missing Triggers — updated_at auto-set
-- All use update_updated_at_column() which already exists on Prod.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS set_cart_items_updated_at ON cart_items;
CREATE TRIGGER set_cart_items_updated_at
  BEFORE UPDATE ON cart_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_carts_updated_at ON carts;
CREATE TRIGGER set_carts_updated_at
  BEFORE UPDATE ON carts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS error_reports_updated_at ON error_reports;
CREATE TRIGGER error_reports_updated_at
  BEFORE UPDATE ON error_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS error_resolutions_updated_at ON error_resolutions;
CREATE TRIGGER error_resolutions_updated_at
  BEFORE UPDATE ON error_resolutions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_fulfillments_updated_at ON fulfillments;
CREATE TRIGGER update_fulfillments_updated_at
  BEFORE UPDATE ON fulfillments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_listings_updated_at ON listings;
CREATE TRIGGER update_listings_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_markets_updated_at ON markets;
CREATE TRIGGER set_markets_updated_at
  BEFORE UPDATE ON markets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS order_items_updated_at ON order_items;
CREATE TRIGGER order_items_updated_at
  BEFORE UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS payments_updated_at ON payments;
CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_shopper_feedback_updated_at ON shopper_feedback;
CREATE TRIGGER update_shopper_feedback_updated_at
  BEFORE UPDATE ON shopper_feedback
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_transactions_updated_at ON transactions;
CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_vendor_feedback_updated_at ON vendor_feedback;
CREATE TRIGGER update_vendor_feedback_updated_at
  BEFORE UPDATE ON vendor_feedback
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_vms_updated_at ON vendor_market_schedules;
CREATE TRIGGER update_vms_updated_at
  BEFORE UPDATE ON vendor_market_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS vendor_payouts_updated_at ON vendor_payouts;
CREATE TRIGGER vendor_payouts_updated_at
  BEFORE UPDATE ON vendor_payouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_vendor_profiles_updated_at ON vendor_profiles;
CREATE TRIGGER update_vendor_profiles_updated_at
  BEFORE UPDATE ON vendor_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_vendor_verifications_updated_at ON vendor_verifications;
CREATE TRIGGER update_vendor_verifications_updated_at
  BEFORE UPDATE ON vendor_verifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_verticals_updated_at ON verticals;
CREATE TRIGGER update_verticals_updated_at
  BEFORE UPDATE ON verticals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: Missing Triggers — Business Logic
-- ─────────────────────────────────────────────────────────────────────────────

-- Premium window triggers
DROP TRIGGER IF EXISTS trigger_listing_premium_window ON listings;
CREATE TRIGGER trigger_listing_premium_window
  BEFORE INSERT OR UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION set_listing_premium_window();

DROP TRIGGER IF EXISTS trigger_market_box_premium_window ON market_box_offerings;
CREATE TRIGGER trigger_market_box_premium_window
  BEFORE INSERT OR UPDATE ON market_box_offerings
  FOR EACH ROW EXECUTE FUNCTION set_market_box_premium_window();

-- Tier limit enforcement
DROP TRIGGER IF EXISTS enforce_listing_limit_trigger ON listings;
CREATE TRIGGER enforce_listing_limit_trigger
  BEFORE INSERT OR UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION enforce_listing_tier_limit();

-- Vendor activity tracking
DROP TRIGGER IF EXISTS vendor_activity_listing_trigger ON listings;
CREATE TRIGGER vendor_activity_listing_trigger
  AFTER INSERT OR UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION update_vendor_activity_on_listing();

DROP TRIGGER IF EXISTS vendor_activity_order_trigger ON orders;
CREATE TRIGGER vendor_activity_order_trigger
  AFTER INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION update_vendor_activity_on_order();

-- Vendor location cache
DROP TRIGGER IF EXISTS trg_vlc_vendor_change ON vendor_profiles;
CREATE TRIGGER trg_vlc_vendor_change
  AFTER INSERT OR UPDATE OR DELETE ON vendor_profiles
  FOR EACH ROW EXECUTE FUNCTION trg_refresh_vendor_location();

DROP TRIGGER IF EXISTS trg_vlc_listing_change ON listings;
CREATE TRIGGER trg_vlc_listing_change
  AFTER INSERT OR UPDATE OR DELETE ON listings
  FOR EACH ROW EXECUTE FUNCTION trg_refresh_vendor_location();

DROP TRIGGER IF EXISTS trg_vlc_listing_market_change ON listing_markets;
CREATE TRIGGER trg_vlc_listing_market_change
  AFTER INSERT OR DELETE ON listing_markets
  FOR EACH ROW EXECUTE FUNCTION trg_refresh_vendor_location();

DROP TRIGGER IF EXISTS trg_vlc_market_coords_change ON markets;
CREATE TRIGGER trg_vlc_market_coords_change
  AFTER UPDATE ON markets
  FOR EACH ROW EXECUTE FUNCTION trg_refresh_vendor_location();

DROP TRIGGER IF EXISTS trg_vlc_market_status_change ON markets;
CREATE TRIGGER trg_vlc_market_status_change
  AFTER UPDATE ON markets
  FOR EACH ROW EXECUTE FUNCTION trg_refresh_vendor_location();

-- Market schedule auto-creation
DROP TRIGGER IF EXISTS trigger_auto_add_schedule_to_vendors ON market_schedules;
CREATE TRIGGER trigger_auto_add_schedule_to_vendors
  AFTER INSERT ON market_schedules
  FOR EACH ROW EXECUTE FUNCTION auto_add_schedule_to_vendors();

DROP TRIGGER IF EXISTS trigger_auto_add_schedule_to_vendors_update ON market_schedules;
CREATE TRIGGER trigger_auto_add_schedule_to_vendors_update
  AFTER UPDATE ON market_schedules
  FOR EACH ROW
  WHEN (NEW.active = true AND OLD.active = false)
  EXECUTE FUNCTION auto_add_schedule_to_vendors();

DROP TRIGGER IF EXISTS trigger_market_schedule_deactivation ON market_schedules;
CREATE TRIGGER trigger_market_schedule_deactivation
  AFTER UPDATE ON market_schedules
  FOR EACH ROW
  WHEN (NEW.active IS DISTINCT FROM OLD.active)
  EXECUTE FUNCTION handle_market_schedule_deactivation();

DROP TRIGGER IF EXISTS trigger_cart_cleanup_on_schedule_change ON market_schedules;
CREATE TRIGGER trigger_cart_cleanup_on_schedule_change
  AFTER UPDATE OR DELETE ON market_schedules
  FOR EACH ROW EXECUTE FUNCTION trigger_cleanup_cart_on_schedule_change();

-- Vendor schedule auto-creation from market_vendors
DROP TRIGGER IF EXISTS trigger_auto_create_vendor_schedules ON market_vendors;
CREATE TRIGGER trigger_auto_create_vendor_schedules
  AFTER UPDATE ON market_vendors
  FOR EACH ROW
  WHEN (NEW.approved IS DISTINCT FROM OLD.approved)
  EXECUTE FUNCTION auto_create_vendor_schedules();

DROP TRIGGER IF EXISTS trigger_auto_create_vendor_schedules_insert ON market_vendors;
CREATE TRIGGER trigger_auto_create_vendor_schedules_insert
  AFTER INSERT ON market_vendors
  FOR EACH ROW EXECUTE FUNCTION auto_create_vendor_schedules_insert();

-- Market box subscription/pickup triggers
DROP TRIGGER IF EXISTS trigger_create_market_box_pickups ON market_box_subscriptions;
CREATE TRIGGER trigger_create_market_box_pickups
  AFTER INSERT ON market_box_subscriptions
  FOR EACH ROW EXECUTE FUNCTION create_market_box_pickups();

DROP TRIGGER IF EXISTS trigger_check_subscription_completion ON market_box_pickups;
CREATE TRIGGER trigger_check_subscription_completion
  AFTER UPDATE ON market_box_pickups
  FOR EACH ROW EXECUTE FUNCTION check_subscription_completion();

-- Order item expiration
DROP TRIGGER IF EXISTS trigger_set_order_item_expiration ON order_items;
CREATE TRIGGER trigger_set_order_item_expiration
  BEFORE INSERT OR UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION set_order_item_expiration();

-- Order auto-cancel when all items cancelled
DROP TRIGGER IF EXISTS trg_auto_cancel_order ON order_items;
CREATE TRIGGER trg_auto_cancel_order
  AFTER UPDATE ON order_items
  FOR EACH ROW
  WHEN (NEW.cancelled_at IS NOT NULL AND OLD.cancelled_at IS NULL)
  EXECUTE FUNCTION auto_cancel_order_if_all_items_cancelled();

-- Vendor rating stats
DROP TRIGGER IF EXISTS trigger_update_vendor_rating_stats ON order_ratings;
CREATE TRIGGER trigger_update_vendor_rating_stats
  AFTER INSERT OR UPDATE OR DELETE ON order_ratings
  FOR EACH ROW EXECUTE FUNCTION update_vendor_rating_stats();

-- Referral credit on first sale
DROP TRIGGER IF EXISTS referral_credit_on_sale_trigger ON orders;
CREATE TRIGGER referral_credit_on_sale_trigger
  AFTER UPDATE ON orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed')
  EXECUTE FUNCTION award_referral_credit_on_first_sale();

-- Vendor status tracking
DROP TRIGGER IF EXISTS track_vendor_status ON vendor_profiles;
CREATE TRIGGER track_vendor_status
  AFTER UPDATE ON vendor_profiles
  FOR EACH ROW EXECUTE FUNCTION track_vendor_status_change();

-- Vendor referral code generation
DROP TRIGGER IF EXISTS vendor_referral_code_trigger ON vendor_profiles;
CREATE TRIGGER vendor_referral_code_trigger
  BEFORE INSERT ON vendor_profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_generate_referral_code();

-- Default vendor tier
DROP TRIGGER IF EXISTS set_default_vendor_tier_trigger ON vendor_profiles;
CREATE TRIGGER set_default_vendor_tier_trigger
  BEFORE INSERT ON vendor_profiles
  FOR EACH ROW EXECUTE FUNCTION set_default_vendor_tier();

-- Vendor verification sync
DROP TRIGGER IF EXISTS sync_vendor_verification ON vendor_verifications;
CREATE TRIGGER sync_vendor_verification
  AFTER UPDATE ON vendor_verifications
  FOR EACH ROW EXECUTE FUNCTION sync_verification_status();

-- Vendor fee balance
DROP TRIGGER IF EXISTS trigger_update_vendor_fee_balance ON vendor_fee_ledger;
CREATE TRIGGER trigger_update_vendor_fee_balance
  AFTER INSERT OR UPDATE OR DELETE ON vendor_fee_ledger
  FOR EACH ROW EXECUTE FUNCTION update_vendor_fee_balance();

-- Transaction notifications
DROP TRIGGER IF EXISTS notify_new_transaction ON transactions;
CREATE TRIGGER notify_new_transaction
  AFTER INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION notify_transaction_status_change();

DROP TRIGGER IF EXISTS notify_transaction_status ON transactions;
CREATE TRIGGER notify_transaction_status
  AFTER UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION notify_transaction_status_change();

-- Schedule conflict check
DROP TRIGGER IF EXISTS trg_check_vendor_schedule_conflict ON vendor_market_schedules;
CREATE TRIGGER trg_check_vendor_schedule_conflict
  BEFORE INSERT OR UPDATE ON vendor_market_schedules
  FOR EACH ROW EXECUTE FUNCTION check_vendor_schedule_conflict();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: Missing Indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- Unique constraints (data integrity)
CREATE UNIQUE INDEX IF NOT EXISTS fulfillments_transaction_id_key
  ON fulfillments(transaction_id);

CREATE UNIQUE INDEX IF NOT EXISTS listing_markets_listing_id_market_id_key
  ON listing_markets(listing_id, market_id);

CREATE UNIQUE INDEX IF NOT EXISTS market_vendors_market_id_vendor_profile_id_key
  ON market_vendors(market_id, vendor_profile_id);

CREATE UNIQUE INDEX IF NOT EXISTS order_ratings_order_id_vendor_profile_id_key
  ON order_ratings(order_id, vendor_profile_id);

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_key
  ON orders(order_number);

CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_payment_intent_id_key
  ON payments(stripe_payment_intent_id);

CREATE UNIQUE INDEX IF NOT EXISTS vendor_activity_settings_vertical_id_key
  ON vendor_activity_settings(vertical_id);

CREATE UNIQUE INDEX IF NOT EXISTS vendor_fee_balance_vendor_profile_id_key
  ON vendor_fee_balance(vendor_profile_id);

CREATE UNIQUE INDEX IF NOT EXISTS vendor_profiles_referral_code_key
  ON vendor_profiles(referral_code);

CREATE UNIQUE INDEX IF NOT EXISTS vendor_referral_credits_referrer_vendor_id_referred_vendor__key
  ON vendor_referral_credits(referrer_vendor_id, referred_vendor_id);

CREATE UNIQUE INDEX IF NOT EXISTS vendor_payouts_stripe_transfer_id_key
  ON vendor_payouts(stripe_transfer_id);

CREATE UNIQUE INDEX IF NOT EXISTS vertical_admins_user_id_vertical_id_key
  ON vertical_admins(user_id, vertical_id);

-- Vendor profile unique constraint (skip if already exists)
DO $$ BEGIN
  ALTER TABLE vendor_profiles ADD CONSTRAINT unique_user_vertical UNIQUE (user_id, vertical_id);
EXCEPTION WHEN duplicate_table THEN NULL;
         WHEN duplicate_object THEN NULL;
END $$;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, read_at, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_items_status_expires
  ON order_items(status, expires_at)
  WHERE status = 'pending' AND cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_vendor_status_created
  ON order_items(vendor_profile_id, status, created_at DESC)
  WHERE cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_pickup_date_market
  ON order_items(pickup_date, market_id, status)
  WHERE status != 'cancelled' AND pickup_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_vertical_created
  ON orders(vertical_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_box_pickups_sub_date_status
  ON market_box_pickups(subscription_id, scheduled_date, status)
  WHERE status IN ('scheduled', 'ready');

CREATE INDEX IF NOT EXISTS idx_listings_vertical_created
  ON listings(vertical_id, deleted_at, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_markets_submitted_by_vendor_id
  ON markets(submitted_by_vendor_id);

CREATE INDEX IF NOT EXISTS idx_transactions_vertical_id
  ON transactions(vertical_id);

CREATE INDEX IF NOT EXISTS idx_user_profiles_deleted_at
  ON user_profiles(deleted_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON push_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_public_activity_recent
  ON public_activity_events(vertical_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7: RLS Policies — Missing tables
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_select ON push_subscriptions;
CREATE POLICY push_subscriptions_select ON push_subscriptions
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS push_subscriptions_insert ON push_subscriptions;
CREATE POLICY push_subscriptions_insert ON push_subscriptions
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS push_subscriptions_delete ON push_subscriptions;
CREATE POLICY push_subscriptions_delete ON push_subscriptions
  FOR DELETE USING (user_id = (SELECT auth.uid()));

ALTER TABLE public_activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_activity_events_public_read ON public_activity_events;
CREATE POLICY public_activity_events_public_read ON public_activity_events
  FOR SELECT USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 8: RLS Policy Fixes — Admin access mismatches
-- ─────────────────────────────────────────────────────────────────────────────

-- vendor_profiles SELECT: add admin access
DROP POLICY IF EXISTS vendor_profiles_select ON vendor_profiles;
CREATE POLICY vendor_profiles_select ON vendor_profiles
  FOR SELECT USING (
    ((status = 'approved'::vendor_status) AND (deleted_at IS NULL))
    OR (user_id = (SELECT auth.uid()))
    OR (SELECT is_platform_admin())
    OR is_admin_for_vertical(vertical_id)
  );

-- vendor_profiles UPDATE: add admin access
DROP POLICY IF EXISTS vendor_profiles_update ON vendor_profiles;
CREATE POLICY vendor_profiles_update ON vendor_profiles
  FOR UPDATE USING (
    (user_id = (SELECT auth.uid()))
    OR (SELECT is_platform_admin())
    OR is_admin_for_vertical(vertical_id)
  );

-- vendor_verifications SELECT: add admin access
DROP POLICY IF EXISTS vendor_verifications_select ON vendor_verifications;
CREATE POLICY vendor_verifications_select ON vendor_verifications
  FOR SELECT USING (
    (vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = (SELECT auth.uid())))
    OR (SELECT is_platform_admin())
    OR can_admin_vendor(vendor_profile_id)
  );

-- verticals: add admin write policies
DROP POLICY IF EXISTS verticals_admin_insert ON verticals;
CREATE POLICY verticals_admin_insert ON verticals
  FOR INSERT WITH CHECK ((SELECT is_platform_admin()));

DROP POLICY IF EXISTS verticals_admin_update ON verticals;
CREATE POLICY verticals_admin_update ON verticals
  FOR UPDATE USING ((SELECT is_platform_admin()));

DROP POLICY IF EXISTS verticals_admin_delete ON verticals;
CREATE POLICY verticals_admin_delete ON verticals
  FOR DELETE USING ((SELECT is_platform_admin()));

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 9: Reload PostgREST schema cache
-- ─────────────────────────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
