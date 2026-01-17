-- Migration: Markets Foundation Tables
-- Phase: Phase-K-1-Markets-Foundation
-- Created: 2026-01-14
-- Purpose: Create tables for markets functionality supporting traditional farmers markets
--          and private pickup locations

-- ============================================================================
-- MARKETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS markets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vertical_id TEXT NOT NULL REFERENCES verticals(vertical_id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('traditional', 'private_pickup')),
    description TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE markets IS 'Farmers markets and private pickup locations';
COMMENT ON COLUMN markets.type IS 'traditional = fixed schedule markets, private_pickup = flexible timing';
COMMENT ON COLUMN markets.vertical_id IS 'References verticals(vertical_id)';

-- ============================================================================
-- MARKET SCHEDULES TABLE (for traditional markets)
-- ============================================================================

CREATE TABLE IF NOT EXISTS market_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE market_schedules IS 'Operating schedules for traditional markets';
COMMENT ON COLUMN market_schedules.day_of_week IS '0=Sunday, 1=Monday, ..., 6=Saturday';

-- ============================================================================
-- MARKET VENDORS TABLE (junction table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS market_vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
    approved BOOLEAN DEFAULT false,
    booth_number TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(market_id, vendor_profile_id)
);

COMMENT ON TABLE market_vendors IS 'Vendor participation in markets';
COMMENT ON COLUMN market_vendors.approved IS 'Admin must approve vendor for market';
COMMENT ON COLUMN market_vendors.booth_number IS 'Assigned booth/stall number';

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_markets_vertical ON markets(vertical_id);
CREATE INDEX IF NOT EXISTS idx_markets_active ON markets(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_markets_type ON markets(type);
CREATE INDEX IF NOT EXISTS idx_markets_city ON markets(city);

CREATE INDEX IF NOT EXISTS idx_market_schedules_market ON market_schedules(market_id);
CREATE INDEX IF NOT EXISTS idx_market_schedules_day ON market_schedules(day_of_week);

CREATE INDEX IF NOT EXISTS idx_market_vendors_market ON market_vendors(market_id);
CREATE INDEX IF NOT EXISTS idx_market_vendors_vendor ON market_vendors(vendor_profile_id);
CREATE INDEX IF NOT EXISTS idx_market_vendors_approved ON market_vendors(approved) WHERE approved = true;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_vendors ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Markets RLS Policies
-- -----------------------------------------------------------------------------

-- Public can view active markets
CREATE POLICY "Markets viewable by all"
    ON markets FOR SELECT
    USING (active = true);

-- Admins can manage all markets
CREATE POLICY "Markets manageable by admins"
    ON markets FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid()
            AND (role = 'admin' OR 'admin' = ANY(roles))
        )
    );

-- -----------------------------------------------------------------------------
-- Market Schedules RLS Policies
-- -----------------------------------------------------------------------------

-- Public can view schedules for active markets
CREATE POLICY "Schedules viewable with active market"
    ON market_schedules FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM markets
            WHERE id = market_id AND active = true
        )
    );

-- Admins can manage schedules
CREATE POLICY "Schedules manageable by admins"
    ON market_schedules FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid()
            AND (role = 'admin' OR 'admin' = ANY(roles))
        )
    );

-- -----------------------------------------------------------------------------
-- Market Vendors RLS Policies
-- -----------------------------------------------------------------------------

-- Vendors can view their own market associations
CREATE POLICY "Vendors view their markets"
    ON market_vendors FOR SELECT
    USING (
        vendor_profile_id IN (
            SELECT id FROM vendor_profiles
            WHERE user_id = (SELECT id FROM user_profiles WHERE user_id = auth.uid())
        )
    );

-- Vendors can apply to markets (insert only, unapproved)
CREATE POLICY "Vendors can apply to markets"
    ON market_vendors FOR INSERT
    WITH CHECK (
        approved = false
        AND vendor_profile_id IN (
            SELECT id FROM vendor_profiles
            WHERE user_id = (SELECT id FROM user_profiles WHERE user_id = auth.uid())
        )
    );

-- Admins can view all market vendors
CREATE POLICY "Admins view all market vendors"
    ON market_vendors FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid()
            AND (role = 'admin' OR 'admin' = ANY(roles))
        )
    );

-- Admins can manage all market vendors
CREATE POLICY "Admins manage market vendors"
    ON market_vendors FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = auth.uid()
            AND (role = 'admin' OR 'admin' = ANY(roles))
        )
    );

-- Public can view approved vendors for active markets
CREATE POLICY "Public view approved market vendors"
    ON market_vendors FOR SELECT
    USING (
        approved = true
        AND EXISTS (
            SELECT 1 FROM markets
            WHERE id = market_id AND active = true
        )
    );

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

-- Markets trigger
DROP TRIGGER IF EXISTS update_markets_updated_at ON markets;
CREATE TRIGGER update_markets_updated_at
    BEFORE UPDATE ON markets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Market vendors trigger
DROP TRIGGER IF EXISTS update_market_vendors_updated_at ON market_vendors;
CREATE TRIGGER update_market_vendors_updated_at
    BEFORE UPDATE ON market_vendors
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
-- Migration: Add market_id to listings
-- Phase: Phase-K-1-Markets-Foundation
-- Created: 2026-01-14
-- Purpose: Add optional market association to listings for pre-sales feature

-- ============================================================================
-- ADD MARKET_ID COLUMN TO LISTINGS
-- ============================================================================

-- Add optional market association
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS market_id UUID REFERENCES markets(id) ON DELETE SET NULL;

COMMENT ON COLUMN listings.market_id IS 'Optional association to a market for pre-sales';

-- ============================================================================
-- INDEX
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_listings_market ON listings(market_id) WHERE market_id IS NOT NULL;
-- Migration: Add active boolean column to markets table
-- Date: 2026-01-15
-- Phase: O
-- Purpose: Fix platform admin markets management - code expects active boolean column

-- Add active column (defaults to true for existing markets)
ALTER TABLE markets
ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- Add comment
COMMENT ON COLUMN markets.active IS 'Whether market is currently active/visible to vendors and buyers';

-- Create index for filtering
CREATE INDEX IF NOT EXISTS idx_markets_active ON markets(active);

-- Update any markets with status='inactive' to have active=false
UPDATE markets
SET active = false
WHERE status = 'inactive';

-- Migration complete
-- Migration: Add contact_email column to markets table
-- Date: 2026-01-15
-- Phase: P
-- Purpose: Fix market creation/edit - code expects contact_email column

-- Add contact_email column
ALTER TABLE markets
ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- Add comment
COMMENT ON COLUMN markets.contact_email IS 'Primary contact email for market inquiries';

-- Migration applied successfully
-- Migration: Add profile_image_url to vendor_profiles
-- Date: 2026-01-15
-- Phase: P
-- Purpose: Enable vendor profile image/logo uploads

-- Add profile_image_url column
ALTER TABLE vendor_profiles
ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

-- Add comment
COMMENT ON COLUMN vendor_profiles.profile_image_url IS 'URL to vendor profile image/logo';

-- Migration applied successfully
-- Migration: Add profile fields to vendor_profiles
-- Date: 2026-01-15
-- Phase: P
-- Purpose: Enable vendor descriptions and social links

-- Add description field (both tiers)
ALTER TABLE vendor_profiles
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add social links (premium only, enforced in app)
ALTER TABLE vendor_profiles
ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}'::jsonb;

-- Example social_links structure:
-- {
--   "facebook": "https://facebook.com/...",
--   "instagram": "https://instagram.com/...",
--   "website": "https://..."
-- }

-- Add comments
COMMENT ON COLUMN vendor_profiles.description IS 'Vendor description/about section (both tiers)';
COMMENT ON COLUMN vendor_profiles.social_links IS 'Social media links (premium tier only)';

-- Migration applied successfully
-- Add verticals column to user_profiles
-- This tracks which verticals a buyer has signed up with
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS verticals TEXT[] DEFAULT '{}';

-- Add index for querying by vertical
CREATE INDEX IF NOT EXISTS idx_user_profiles_verticals ON user_profiles USING GIN (verticals);

-- Comment for documentation
COMMENT ON COLUMN user_profiles.verticals IS 'Array of vertical IDs the user has signed up with (e.g., farmers_market, fireworks)';

-- Migrate existing users: associate all current users with farmers_market
-- since that is the currently active vertical
UPDATE user_profiles
SET verticals = ARRAY['farmers_market']
WHERE verticals IS NULL OR verticals = '{}';

-- Update the user profile creation trigger to include the vertical from signup
CREATE OR REPLACE FUNCTION create_profile_for_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  signup_vertical TEXT;
BEGIN
  -- Get the preferred_vertical from user metadata (set during signup)
  signup_vertical := NEW.raw_user_meta_data->>'preferred_vertical';

  INSERT INTO public.user_profiles (
    user_id,
    email,
    display_name,
    verticals,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE
      WHEN signup_vertical IS NOT NULL AND signup_vertical != ''
      THEN ARRAY[signup_vertical]
      ELSE ARRAY['farmers_market']  -- Default to farmers_market
    END,
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$;
-- Add buyer tier system to user_profiles
-- Tracks premium membership status for buyers

-- Add tier column (free or premium)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS buyer_tier TEXT DEFAULT 'free';

-- Add subscription tracking
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS buyer_tier_expires_at TIMESTAMPTZ;

-- Add Stripe subscription ID for future integration
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Add index for querying by tier
CREATE INDEX IF NOT EXISTS idx_user_profiles_buyer_tier ON user_profiles(buyer_tier);

-- Add check constraint for valid tiers
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS valid_buyer_tier;
ALTER TABLE user_profiles ADD CONSTRAINT valid_buyer_tier
  CHECK (buyer_tier IN ('free', 'premium'));

-- Comments for documentation
COMMENT ON COLUMN user_profiles.buyer_tier IS 'Buyer membership tier: free or premium ($9.99/mo)';
COMMENT ON COLUMN user_profiles.buyer_tier_expires_at IS 'When premium membership expires (null for free tier)';
COMMENT ON COLUMN user_profiles.stripe_subscription_id IS 'Stripe subscription ID for premium membership';

-- Set all existing users to free tier
UPDATE user_profiles
SET buyer_tier = 'free'
WHERE buyer_tier IS NULL;

-- Create a couple test premium buyers for testing
-- (Update these to actual test user IDs after checking the data)
UPDATE user_profiles
SET buyer_tier = 'premium',
    buyer_tier_expires_at = NOW() + INTERVAL '1 year'
WHERE display_name ILIKE '%test%'
  AND NOT EXISTS (
    SELECT 1 FROM vendor_profiles vp WHERE vp.user_id = user_profiles.user_id
  )
LIMIT 2;
-- ============================================================================
-- Migration: Buyer Pickup Confirmation
-- Created: 2026-01-16
-- Purpose: Add buyer confirmation field to order_items for two-way handoff
-- ============================================================================

-- Add buyer confirmation timestamp to order_items
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS buyer_confirmed_at TIMESTAMPTZ;

COMMENT ON COLUMN order_items.buyer_confirmed_at IS 'When buyer confirmed they received the item';

-- Create index for querying confirmed items
CREATE INDEX IF NOT EXISTS idx_order_items_buyer_confirmed
  ON order_items(buyer_confirmed_at)
  WHERE buyer_confirmed_at IS NOT NULL;

-- Add RLS policy for buyers to update their own order items (for confirmation)
DROP POLICY IF EXISTS order_items_buyer_update ON order_items;
CREATE POLICY order_items_buyer_update ON order_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id AND o.buyer_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id AND o.buyer_user_id = auth.uid()
    )
  );

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- ============================================================================
-- Migration: Order Cancellation Support
-- Created: 2026-01-16
-- Purpose: Add cancellation tracking to order_items for partial refunds/cancellations
-- ============================================================================

-- Add cancellation fields to order_items
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT CHECK (cancelled_by IN ('buyer', 'vendor', 'system')),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS refund_amount_cents INTEGER;

COMMENT ON COLUMN order_items.cancelled_at IS 'When the item was cancelled';
COMMENT ON COLUMN order_items.cancelled_by IS 'Who cancelled: buyer, vendor, or system';
COMMENT ON COLUMN order_items.cancellation_reason IS 'Reason for cancellation';
COMMENT ON COLUMN order_items.refund_amount_cents IS 'Amount refunded for this item (may differ from subtotal if partial)';

-- Create index for querying cancelled items
CREATE INDEX IF NOT EXISTS idx_order_items_cancelled
  ON order_items(cancelled_at)
  WHERE cancelled_at IS NOT NULL;

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- ============================================================================
-- Migration: Order Expiration Support
-- Created: 2026-01-16
-- Purpose: Add expiration tracking to order_items based on pickup date
-- ============================================================================

-- Add pickup_date field to order_items (set at checkout based on market schedule)
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS pickup_date DATE;

COMMENT ON COLUMN order_items.pickup_date IS 'Expected pickup date at market';

-- Add market_id field to order_items if not exists (for pickup location)
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS market_id UUID REFERENCES markets(id);

COMMENT ON COLUMN order_items.market_id IS 'Market where item will be picked up';

-- Add expiration field to order_items
-- expires_at is calculated as pickup_date minus a buffer (default 18 hours)
-- This gives vendors until the evening before market day to confirm
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

COMMENT ON COLUMN order_items.expires_at IS 'When this item expires if not confirmed. Calculated from pickup_date minus buffer hours.';

-- Create index for querying items that need expiration
CREATE INDEX IF NOT EXISTS idx_order_items_expires_at
  ON order_items(expires_at)
  WHERE expires_at IS NOT NULL
    AND status = 'pending'
    AND cancelled_at IS NULL;

-- Function to calculate expiration from pickup date
-- Default: 18 hours before pickup (e.g., if pickup is Saturday 8am, expires Friday 2pm)
CREATE OR REPLACE FUNCTION calculate_order_item_expiration(
  p_pickup_date DATE,
  p_buffer_hours INTEGER DEFAULT 18
) RETURNS TIMESTAMPTZ AS $$
BEGIN
  IF p_pickup_date IS NULL THEN
    -- No pickup date, expire 7 days from now as fallback
    RETURN NOW() + INTERVAL '7 days';
  END IF;

  -- Assume pickup is at start of day (8am), subtract buffer hours
  RETURN (p_pickup_date + TIME '08:00:00') - (p_buffer_hours || ' hours')::INTERVAL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger to auto-set expires_at when order_item is created or pickup_date changes
CREATE OR REPLACE FUNCTION set_order_item_expiration()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set expiration if not already set and item is in initial state
  IF NEW.expires_at IS NULL AND NEW.status = 'pending' THEN
    NEW.expires_at := calculate_order_item_expiration(NEW.pickup_date);
  END IF;

  -- If pickup_date changed, recalculate expiration (unless already confirmed)
  IF TG_OP = 'UPDATE'
     AND OLD.pickup_date IS DISTINCT FROM NEW.pickup_date
     AND NEW.status = 'pending' THEN
    NEW.expires_at := calculate_order_item_expiration(NEW.pickup_date);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_set_order_item_expiration ON order_items;
CREATE TRIGGER trigger_set_order_item_expiration
  BEFORE INSERT OR UPDATE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION set_order_item_expiration();

-- Update existing order_items that don't have expiration set
UPDATE order_items
SET expires_at = calculate_order_item_expiration(pickup_date)
WHERE expires_at IS NULL
  AND status = 'pending'
  AND cancelled_at IS NULL;

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- ============================================================================
-- Migration: Monthly Market Box Foundation
-- Created: 2026-01-16
-- Purpose: Add market box subscription tables and tracking
-- Note: listing_type enum already exists with 'presale', 'flash', 'market_box'
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. Market Box Offerings (Vendor's box product definition)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_box_offerings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  vertical_id TEXT NOT NULL REFERENCES verticals(vertical_id) ON DELETE RESTRICT,

  -- Product info
  name TEXT NOT NULL,
  description TEXT,
  image_urls TEXT[] DEFAULT '{}',

  -- Pricing (total for 4 weeks, set by vendor)
  price_cents INTEGER NOT NULL,

  -- Pickup location & schedule (fixed for all 4 weeks)
  pickup_market_id UUID NOT NULL REFERENCES markets(id) ON DELETE RESTRICT,
  pickup_day_of_week INTEGER NOT NULL CHECK (pickup_day_of_week BETWEEN 0 AND 6),
  pickup_start_time TIME NOT NULL,
  pickup_end_time TIME NOT NULL,

  -- Capacity (null = use tier default: standard=2, premium=unlimited)
  max_subscribers INTEGER,

  -- Status
  active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE market_box_offerings IS 'Vendor market box product definitions (4-week subscription bundles)';
COMMENT ON COLUMN market_box_offerings.price_cents IS 'Total price for all 4 weeks (vendor sets this directly)';
COMMENT ON COLUMN market_box_offerings.pickup_day_of_week IS 'Day of week for pickup: 0=Sunday, 1=Monday, ..., 6=Saturday';
COMMENT ON COLUMN market_box_offerings.max_subscribers IS 'Max concurrent subscribers. NULL = use tier default (standard=2, premium=unlimited)';

CREATE INDEX IF NOT EXISTS idx_market_box_offerings_vendor ON market_box_offerings(vendor_profile_id);
CREATE INDEX IF NOT EXISTS idx_market_box_offerings_vertical ON market_box_offerings(vertical_id);
CREATE INDEX IF NOT EXISTS idx_market_box_offerings_active ON market_box_offerings(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_market_box_offerings_market ON market_box_offerings(pickup_market_id);

-- -----------------------------------------------------------------------------
-- 2. Market Box Subscriptions (Buyer's 4-week purchase)
-- -----------------------------------------------------------------------------
CREATE TYPE market_box_subscription_status AS ENUM (
  'active',
  'completed',
  'cancelled'
);

CREATE TABLE IF NOT EXISTS market_box_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offering_id UUID NOT NULL REFERENCES market_box_offerings(id) ON DELETE RESTRICT,
  buyer_user_id UUID NOT NULL REFERENCES user_profiles(user_id) ON DELETE RESTRICT,

  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  total_paid_cents INTEGER NOT NULL,
  start_date DATE NOT NULL,

  status market_box_subscription_status DEFAULT 'active',
  weeks_completed INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

COMMENT ON TABLE market_box_subscriptions IS 'Buyer 4-week market box purchases';
COMMENT ON COLUMN market_box_subscriptions.start_date IS 'Date of first pickup (subsequent pickups are weekly from this date)';
COMMENT ON COLUMN market_box_subscriptions.weeks_completed IS 'Number of weeks completed (0-4)';

CREATE INDEX IF NOT EXISTS idx_market_box_subs_offering ON market_box_subscriptions(offering_id);
CREATE INDEX IF NOT EXISTS idx_market_box_subs_buyer ON market_box_subscriptions(buyer_user_id);
CREATE INDEX IF NOT EXISTS idx_market_box_subs_status ON market_box_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_market_box_subs_active ON market_box_subscriptions(offering_id, status) WHERE status = 'active';

-- -----------------------------------------------------------------------------
-- 3. Market Box Pickups (Weekly pickup tracking)
-- -----------------------------------------------------------------------------
CREATE TYPE market_box_pickup_status AS ENUM (
  'scheduled',
  'ready',
  'picked_up',
  'missed',
  'rescheduled'
);

CREATE TABLE IF NOT EXISTS market_box_pickups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID NOT NULL REFERENCES market_box_subscriptions(id) ON DELETE CASCADE,

  week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 4),
  scheduled_date DATE NOT NULL,

  status market_box_pickup_status DEFAULT 'scheduled',

  ready_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  missed_at TIMESTAMPTZ,
  rescheduled_to DATE,

  vendor_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(subscription_id, week_number)
);

COMMENT ON TABLE market_box_pickups IS 'Individual weekly pickups within a market box subscription';
COMMENT ON COLUMN market_box_pickups.week_number IS 'Week 1-4 of the subscription';
COMMENT ON COLUMN market_box_pickups.rescheduled_to IS 'If vendor allows reschedule after miss, new pickup date';

CREATE INDEX IF NOT EXISTS idx_market_box_pickups_sub ON market_box_pickups(subscription_id);
CREATE INDEX IF NOT EXISTS idx_market_box_pickups_date ON market_box_pickups(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_market_box_pickups_status ON market_box_pickups(status);
CREATE INDEX IF NOT EXISTS idx_market_box_pickups_upcoming ON market_box_pickups(scheduled_date, status) WHERE status IN ('scheduled', 'ready');

-- -----------------------------------------------------------------------------
-- 4. RLS Policies
-- -----------------------------------------------------------------------------
ALTER TABLE market_box_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_box_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_box_pickups ENABLE ROW LEVEL SECURITY;

-- Market Box Offerings: Public read, vendor manage own
CREATE POLICY market_box_offerings_select ON market_box_offerings
  FOR SELECT USING (true);

CREATE POLICY market_box_offerings_insert ON market_box_offerings
  FOR INSERT WITH CHECK (
    vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY market_box_offerings_update ON market_box_offerings
  FOR UPDATE USING (
    vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY market_box_offerings_delete ON market_box_offerings
  FOR DELETE USING (
    vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid())
  );

-- Market Box Subscriptions: Buyer sees own, vendor sees their offering's subs
CREATE POLICY market_box_subs_buyer_select ON market_box_subscriptions
  FOR SELECT USING (buyer_user_id = auth.uid());

CREATE POLICY market_box_subs_vendor_select ON market_box_subscriptions
  FOR SELECT USING (
    offering_id IN (
      SELECT id FROM market_box_offerings
      WHERE vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY market_box_subs_insert ON market_box_subscriptions
  FOR INSERT WITH CHECK (buyer_user_id = auth.uid());

-- Market Box Pickups: Buyer sees own, vendor manages their subs' pickups
CREATE POLICY market_box_pickups_buyer_select ON market_box_pickups
  FOR SELECT USING (
    subscription_id IN (SELECT id FROM market_box_subscriptions WHERE buyer_user_id = auth.uid())
  );

CREATE POLICY market_box_pickups_vendor_select ON market_box_pickups
  FOR SELECT USING (
    subscription_id IN (
      SELECT ms.id FROM market_box_subscriptions ms
      JOIN market_box_offerings mbo ON ms.offering_id = mbo.id
      WHERE mbo.vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY market_box_pickups_vendor_update ON market_box_pickups
  FOR UPDATE USING (
    subscription_id IN (
      SELECT ms.id FROM market_box_subscriptions ms
      JOIN market_box_offerings mbo ON ms.offering_id = mbo.id
      WHERE mbo.vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- 5. Trigger to create 4 pickup records when subscription is created
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_market_box_pickups()
RETURNS TRIGGER AS $$
DECLARE
  pickup_date DATE;
BEGIN
  FOR i IN 1..4 LOOP
    pickup_date := NEW.start_date + ((i - 1) * 7);
    INSERT INTO market_box_pickups (subscription_id, week_number, scheduled_date, status)
    VALUES (NEW.id, i, pickup_date, 'scheduled');
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_market_box_pickups ON market_box_subscriptions;
CREATE TRIGGER trigger_create_market_box_pickups
  AFTER INSERT ON market_box_subscriptions
  FOR EACH ROW EXECUTE FUNCTION create_market_box_pickups();

-- -----------------------------------------------------------------------------
-- 6. Trigger to update subscription status when all pickups complete
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_subscription_completion()
RETURNS TRIGGER AS $$
DECLARE
  completed_count INTEGER;
BEGIN
  IF NEW.status IN ('picked_up', 'missed') AND OLD.status != NEW.status THEN
    SELECT COUNT(*) INTO completed_count
    FROM market_box_pickups
    WHERE subscription_id = NEW.subscription_id
      AND status IN ('picked_up', 'missed', 'rescheduled');

    IF completed_count >= 4 THEN
      UPDATE market_box_subscriptions
      SET status = 'completed', weeks_completed = 4, completed_at = NOW(), updated_at = NOW()
      WHERE id = NEW.subscription_id;
    ELSE
      UPDATE market_box_subscriptions
      SET weeks_completed = completed_count, updated_at = NOW()
      WHERE id = NEW.subscription_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_subscription_completion ON market_box_pickups;
CREATE TRIGGER trigger_check_subscription_completion
  AFTER UPDATE ON market_box_pickups
  FOR EACH ROW EXECUTE FUNCTION check_subscription_completion();

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Migration: Add home_market_id to vendor_profiles
-- Purpose: Track the designated "home market" for standard tier vendors
-- Standard vendors are limited to 1 traditional market (their home market)

-- Add the home_market_id column (nullable - will be set when vendor first selects a market)
ALTER TABLE vendor_profiles
ADD COLUMN IF NOT EXISTS home_market_id UUID REFERENCES markets(id) ON DELETE SET NULL;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_home_market_id ON vendor_profiles(home_market_id);

-- Add comment for documentation
COMMENT ON COLUMN vendor_profiles.home_market_id IS 'The designated home market for standard tier vendors. Standard vendors can only have listings/boxes at this market. Premium vendors can use multiple markets.';

-- Auto-populate home_market_id for existing vendors based on their first market usage
-- This finds the first traditional market each vendor is using and sets it as their home market
UPDATE vendor_profiles vp
SET home_market_id = (
  SELECT COALESCE(
    -- First try to get from listings (via listing_markets junction table)
    (
      SELECT lm.market_id
      FROM listings l
      JOIN listing_markets lm ON l.id = lm.listing_id
      JOIN markets m ON lm.market_id = m.id
      WHERE l.vendor_profile_id = vp.id
        AND m.market_type != 'private_pickup'
        AND l.status = 'published'
      ORDER BY l.created_at ASC
      LIMIT 1
    ),
    -- Then try from market boxes
    (
      SELECT mbo.pickup_market_id
      FROM market_box_offerings mbo
      JOIN markets m ON mbo.pickup_market_id = m.id
      WHERE mbo.vendor_profile_id = vp.id
        AND m.market_type != 'private_pickup'
        AND mbo.active = true
      ORDER BY mbo.created_at ASC
      LIMIT 1
    )
  )
)
WHERE vp.home_market_id IS NULL
  AND vp.tier = 'standard';
