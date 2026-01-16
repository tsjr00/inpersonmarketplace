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
