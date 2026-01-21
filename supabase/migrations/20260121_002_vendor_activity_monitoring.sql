-- Migration: Vendor Activity Monitoring System
-- Created: 2026-01-21
-- Description: Track vendor activity and flag inactive vendors for admin review

-- ============================================================================
-- 1. Add activity tracking columns to vendor_profiles
-- ============================================================================

-- Track when vendor was last active (login, order, listing update)
ALTER TABLE vendor_profiles
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- Track last login specifically
ALTER TABLE vendor_profiles
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Track when first listing was created (for onboarding tracking)
ALTER TABLE vendor_profiles
ADD COLUMN IF NOT EXISTS first_listing_at TIMESTAMPTZ;

-- ============================================================================
-- 2. Create activity monitoring settings table (per-vertical)
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendor_activity_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vertical_id TEXT NOT NULL UNIQUE,

  -- Enable/disable monitoring
  monitoring_enabled BOOLEAN NOT NULL DEFAULT TRUE,

  -- Thresholds (in days)
  days_no_login_threshold INTEGER NOT NULL DEFAULT 90,
  days_no_orders_threshold INTEGER NOT NULL DEFAULT 120,
  days_no_listing_activity_threshold INTEGER NOT NULL DEFAULT 180,
  days_incomplete_onboarding_threshold INTEGER NOT NULL DEFAULT 30,

  -- Which checks to run
  check_no_login BOOLEAN NOT NULL DEFAULT TRUE,
  check_no_orders BOOLEAN NOT NULL DEFAULT TRUE,
  check_no_listing_activity BOOLEAN NOT NULL DEFAULT TRUE,
  check_no_published_listings BOOLEAN NOT NULL DEFAULT TRUE,
  check_incomplete_onboarding BOOLEAN NOT NULL DEFAULT TRUE,

  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. Create vendor activity flags table
-- ============================================================================

CREATE TYPE vendor_flag_reason AS ENUM (
  'no_recent_login',
  'no_recent_orders',
  'no_recent_listing_activity',
  'no_published_listings',
  'incomplete_onboarding'
);

CREATE TYPE vendor_flag_status AS ENUM (
  'pending',      -- Needs admin review
  'dismissed',    -- Admin reviewed, vendor is fine
  'actioned',     -- Admin took action (suspended, etc.)
  'resolved'      -- Vendor became active again
);

CREATE TABLE IF NOT EXISTS vendor_activity_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  vertical_id TEXT NOT NULL,

  -- Flag details
  reason vendor_flag_reason NOT NULL,
  status vendor_flag_status NOT NULL DEFAULT 'pending',

  -- Context data
  details JSONB DEFAULT '{}',  -- e.g., { "days_since_login": 95, "threshold": 90 }

  -- Resolution
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT,
  action_taken TEXT,  -- 'dismissed', 'suspended', 'status_changed', etc.

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partial unique index for pending flags
DROP INDEX IF EXISTS idx_vendor_flags_pending_unique;
CREATE UNIQUE INDEX idx_vendor_flags_pending_unique
  ON vendor_activity_flags(vendor_profile_id, reason)
  WHERE status = 'pending';

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_vendor_flags_vertical
  ON vendor_activity_flags(vertical_id);

CREATE INDEX IF NOT EXISTS idx_vendor_flags_status
  ON vendor_activity_flags(status);

CREATE INDEX IF NOT EXISTS idx_vendor_flags_created
  ON vendor_activity_flags(created_at);

CREATE INDEX IF NOT EXISTS idx_vendor_flags_vendor
  ON vendor_activity_flags(vendor_profile_id);

-- ============================================================================
-- 4. Create activity scan log table
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendor_activity_scan_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vertical_id TEXT,  -- NULL for all verticals

  -- Scan results
  vendors_scanned INTEGER NOT NULL DEFAULT 0,
  new_flags_created INTEGER NOT NULL DEFAULT 0,
  flags_auto_resolved INTEGER NOT NULL DEFAULT 0,

  -- Breakdown by reason
  flags_by_reason JSONB DEFAULT '{}',

  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Status
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT
);

-- ============================================================================
-- 5. Function to update last_active_at on various activities
-- ============================================================================

-- Update on login (called from auth hook or API)
CREATE OR REPLACE FUNCTION update_vendor_last_login()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE vendor_profiles
  SET last_login_at = NOW(),
      last_active_at = NOW()
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update on listing activity
CREATE OR REPLACE FUNCTION update_vendor_activity_on_listing()
RETURNS TRIGGER AS $$
BEGIN
  -- Update last_active_at
  UPDATE vendor_profiles
  SET last_active_at = NOW(),
      first_listing_at = COALESCE(first_listing_at, NOW())
  WHERE id = NEW.vendor_profile_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for listing activity
DROP TRIGGER IF EXISTS vendor_activity_listing_trigger ON listings;
CREATE TRIGGER vendor_activity_listing_trigger
  AFTER INSERT OR UPDATE ON listings
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_activity_on_listing();

-- Update on order received
CREATE OR REPLACE FUNCTION update_vendor_activity_on_order()
RETURNS TRIGGER AS $$
BEGIN
  -- Update last_active_at for vendors in this order
  UPDATE vendor_profiles
  SET last_active_at = NOW()
  WHERE id IN (
    SELECT DISTINCT vendor_profile_id
    FROM order_items
    WHERE order_id = NEW.id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for order activity
DROP TRIGGER IF EXISTS vendor_activity_order_trigger ON orders;
CREATE TRIGGER vendor_activity_order_trigger
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_activity_on_order();

-- ============================================================================
-- 6. Function to run the activity scan (called by cron job)
-- ============================================================================

CREATE OR REPLACE FUNCTION scan_vendor_activity(p_vertical_id TEXT DEFAULT NULL)
RETURNS TABLE (
  scan_id UUID,
  vendors_scanned INTEGER,
  new_flags INTEGER,
  auto_resolved INTEGER
) AS $$
DECLARE
  v_scan_id UUID;
  v_settings RECORD;
  v_vendor RECORD;
  v_vendors_scanned INTEGER := 0;
  v_new_flags INTEGER := 0;
  v_auto_resolved INTEGER := 0;
  v_flags_by_reason JSONB := '{}';
  v_days_since_login INTEGER;
  v_days_since_order INTEGER;
  v_days_since_listing INTEGER;
  v_days_since_approval INTEGER;
  v_published_count INTEGER;
  v_last_order_date TIMESTAMPTZ;
  v_last_listing_date TIMESTAMPTZ;
  v_start_time TIMESTAMPTZ := NOW();
BEGIN
  -- Create scan log entry
  INSERT INTO vendor_activity_scan_log (vertical_id, status)
  VALUES (p_vertical_id, 'running')
  RETURNING id INTO v_scan_id;

  -- Get settings (use defaults if not configured)
  SELECT
    COALESCE(vas.monitoring_enabled, TRUE) AS monitoring_enabled,
    COALESCE(vas.days_no_login_threshold, 90) AS days_no_login_threshold,
    COALESCE(vas.days_no_orders_threshold, 120) AS days_no_orders_threshold,
    COALESCE(vas.days_no_listing_activity_threshold, 180) AS days_no_listing_activity_threshold,
    COALESCE(vas.days_incomplete_onboarding_threshold, 30) AS days_incomplete_onboarding_threshold,
    COALESCE(vas.check_no_login, TRUE) AS check_no_login,
    COALESCE(vas.check_no_orders, TRUE) AS check_no_orders,
    COALESCE(vas.check_no_listing_activity, TRUE) AS check_no_listing_activity,
    COALESCE(vas.check_no_published_listings, TRUE) AS check_no_published_listings,
    COALESCE(vas.check_incomplete_onboarding, TRUE) AS check_incomplete_onboarding
  INTO v_settings
  FROM (SELECT 1) dummy
  LEFT JOIN vendor_activity_settings vas ON vas.vertical_id = COALESCE(p_vertical_id, vas.vertical_id)
  LIMIT 1;

  -- If monitoring disabled, exit early
  IF NOT v_settings.monitoring_enabled THEN
    UPDATE vendor_activity_scan_log
    SET status = 'completed',
        completed_at = NOW(),
        duration_ms = EXTRACT(MILLISECONDS FROM NOW() - v_start_time)::INTEGER
    WHERE id = v_scan_id;

    RETURN QUERY SELECT v_scan_id, 0, 0, 0;
    RETURN;
  END IF;

  -- First, auto-resolve flags for vendors that are now active
  UPDATE vendor_activity_flags vaf
  SET status = 'resolved',
      resolved_at = NOW(),
      resolution_notes = 'Auto-resolved: vendor became active'
  WHERE vaf.status = 'pending'
    AND (p_vertical_id IS NULL OR vaf.vertical_id = p_vertical_id)
    AND EXISTS (
      SELECT 1 FROM vendor_profiles vp
      WHERE vp.id = vaf.vendor_profile_id
        AND vp.last_active_at > NOW() - INTERVAL '7 days'
    );

  GET DIAGNOSTICS v_auto_resolved = ROW_COUNT;

  -- Scan approved vendors
  FOR v_vendor IN
    SELECT
      vp.id,
      vp.vertical_id,
      vp.status,
      vp.last_login_at,
      vp.last_active_at,
      vp.first_listing_at,
      vp.approved_at,
      vp.created_at
    FROM vendor_profiles vp
    WHERE vp.status = 'approved'
      AND (p_vertical_id IS NULL OR vp.vertical_id = p_vertical_id)
  LOOP
    v_vendors_scanned := v_vendors_scanned + 1;

    -- Calculate days since activities
    v_days_since_login := COALESCE(
      EXTRACT(DAY FROM NOW() - v_vendor.last_login_at)::INTEGER,
      EXTRACT(DAY FROM NOW() - v_vendor.created_at)::INTEGER
    );

    -- Get last order date for this vendor
    SELECT MAX(o.created_at) INTO v_last_order_date
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE oi.vendor_profile_id = v_vendor.id
      AND o.status NOT IN ('cancelled', 'refunded');

    v_days_since_order := CASE
      WHEN v_last_order_date IS NULL THEN 9999
      ELSE EXTRACT(DAY FROM NOW() - v_last_order_date)::INTEGER
    END;

    -- Get last listing update date
    SELECT MAX(GREATEST(created_at, updated_at)) INTO v_last_listing_date
    FROM listings
    WHERE vendor_profile_id = v_vendor.id
      AND deleted_at IS NULL;

    v_days_since_listing := CASE
      WHEN v_last_listing_date IS NULL THEN 9999
      ELSE EXTRACT(DAY FROM NOW() - v_last_listing_date)::INTEGER
    END;

    -- Get published listings count
    SELECT COUNT(*) INTO v_published_count
    FROM listings
    WHERE vendor_profile_id = v_vendor.id
      AND status = 'published'
      AND deleted_at IS NULL;

    -- Days since approval
    v_days_since_approval := COALESCE(
      EXTRACT(DAY FROM NOW() - v_vendor.approved_at)::INTEGER,
      EXTRACT(DAY FROM NOW() - v_vendor.created_at)::INTEGER
    );

    -- Check: No recent login
    IF v_settings.check_no_login AND v_days_since_login > v_settings.days_no_login_threshold THEN
      INSERT INTO vendor_activity_flags (vendor_profile_id, vertical_id, reason, details)
      VALUES (
        v_vendor.id,
        v_vendor.vertical_id,
        'no_recent_login',
        jsonb_build_object(
          'days_since_login', v_days_since_login,
          'threshold', v_settings.days_no_login_threshold,
          'last_login_at', v_vendor.last_login_at
        )
      )
      ON CONFLICT (vendor_profile_id, reason) WHERE status = 'pending' DO NOTHING;

      IF FOUND THEN
        v_new_flags := v_new_flags + 1;
        v_flags_by_reason := v_flags_by_reason || jsonb_build_object('no_recent_login', COALESCE((v_flags_by_reason->>'no_recent_login')::INTEGER, 0) + 1);
      END IF;
    END IF;

    -- Check: No recent orders
    IF v_settings.check_no_orders AND v_days_since_order > v_settings.days_no_orders_threshold THEN
      INSERT INTO vendor_activity_flags (vendor_profile_id, vertical_id, reason, details)
      VALUES (
        v_vendor.id,
        v_vendor.vertical_id,
        'no_recent_orders',
        jsonb_build_object(
          'days_since_order', v_days_since_order,
          'threshold', v_settings.days_no_orders_threshold,
          'last_order_at', v_last_order_date
        )
      )
      ON CONFLICT (vendor_profile_id, reason) WHERE status = 'pending' DO NOTHING;

      IF FOUND THEN
        v_new_flags := v_new_flags + 1;
        v_flags_by_reason := v_flags_by_reason || jsonb_build_object('no_recent_orders', COALESCE((v_flags_by_reason->>'no_recent_orders')::INTEGER, 0) + 1);
      END IF;
    END IF;

    -- Check: No recent listing activity
    IF v_settings.check_no_listing_activity AND v_days_since_listing > v_settings.days_no_listing_activity_threshold THEN
      INSERT INTO vendor_activity_flags (vendor_profile_id, vertical_id, reason, details)
      VALUES (
        v_vendor.id,
        v_vendor.vertical_id,
        'no_recent_listing_activity',
        jsonb_build_object(
          'days_since_listing', v_days_since_listing,
          'threshold', v_settings.days_no_listing_activity_threshold,
          'last_listing_at', v_last_listing_date
        )
      )
      ON CONFLICT (vendor_profile_id, reason) WHERE status = 'pending' DO NOTHING;

      IF FOUND THEN
        v_new_flags := v_new_flags + 1;
        v_flags_by_reason := v_flags_by_reason || jsonb_build_object('no_recent_listing_activity', COALESCE((v_flags_by_reason->>'no_recent_listing_activity')::INTEGER, 0) + 1);
      END IF;
    END IF;

    -- Check: No published listings (only if they've had time to create some)
    IF v_settings.check_no_published_listings
       AND v_published_count = 0
       AND v_days_since_approval > 14 THEN
      INSERT INTO vendor_activity_flags (vendor_profile_id, vertical_id, reason, details)
      VALUES (
        v_vendor.id,
        v_vendor.vertical_id,
        'no_published_listings',
        jsonb_build_object(
          'published_count', v_published_count,
          'days_since_approval', v_days_since_approval
        )
      )
      ON CONFLICT (vendor_profile_id, reason) WHERE status = 'pending' DO NOTHING;

      IF FOUND THEN
        v_new_flags := v_new_flags + 1;
        v_flags_by_reason := v_flags_by_reason || jsonb_build_object('no_published_listings', COALESCE((v_flags_by_reason->>'no_published_listings')::INTEGER, 0) + 1);
      END IF;
    END IF;

    -- Check: Incomplete onboarding (approved but never created a listing)
    IF v_settings.check_incomplete_onboarding
       AND v_vendor.first_listing_at IS NULL
       AND v_days_since_approval > v_settings.days_incomplete_onboarding_threshold THEN
      INSERT INTO vendor_activity_flags (vendor_profile_id, vertical_id, reason, details)
      VALUES (
        v_vendor.id,
        v_vendor.vertical_id,
        'incomplete_onboarding',
        jsonb_build_object(
          'days_since_approval', v_days_since_approval,
          'threshold', v_settings.days_incomplete_onboarding_threshold,
          'approved_at', v_vendor.approved_at
        )
      )
      ON CONFLICT (vendor_profile_id, reason) WHERE status = 'pending' DO NOTHING;

      IF FOUND THEN
        v_new_flags := v_new_flags + 1;
        v_flags_by_reason := v_flags_by_reason || jsonb_build_object('incomplete_onboarding', COALESCE((v_flags_by_reason->>'incomplete_onboarding')::INTEGER, 0) + 1);
      END IF;
    END IF;

  END LOOP;

  -- Update scan log
  UPDATE vendor_activity_scan_log
  SET status = 'completed',
      completed_at = NOW(),
      duration_ms = EXTRACT(MILLISECONDS FROM NOW() - v_start_time)::INTEGER,
      vendors_scanned = v_vendors_scanned,
      new_flags_created = v_new_flags,
      flags_auto_resolved = v_auto_resolved,
      flags_by_reason = v_flags_by_reason
  WHERE id = v_scan_id;

  RETURN QUERY SELECT v_scan_id, v_vendors_scanned, v_new_flags, v_auto_resolved;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. RLS Policies
-- ============================================================================

ALTER TABLE vendor_activity_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_activity_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_activity_scan_log ENABLE ROW LEVEL SECURITY;

-- Admins can view and manage flags
CREATE POLICY "Admins can manage activity flags"
  ON vendor_activity_flags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid()
      AND 'admin' = ANY(roles)
    )
  );

-- Vertical admins can view flags for their vertical
CREATE POLICY "Vertical admins can view their flags"
  ON vendor_activity_flags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vertical_admins va
      WHERE va.user_id = auth.uid()
      AND va.vertical_id::TEXT = vendor_activity_flags.vertical_id
    )
  );

-- Admins can manage settings
CREATE POLICY "Admins can manage activity settings"
  ON vendor_activity_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid()
      AND 'admin' = ANY(roles)
    )
  );

-- Admins can view scan logs
CREATE POLICY "Admins can view scan logs"
  ON vendor_activity_scan_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid()
      AND 'admin' = ANY(roles)
    )
  );

-- ============================================================================
-- 8. Insert default settings for existing verticals
-- ============================================================================

INSERT INTO vendor_activity_settings (vertical_id)
SELECT id FROM verticals
ON CONFLICT (vertical_id) DO NOTHING;

-- ============================================================================
-- 9. Comments
-- ============================================================================

COMMENT ON TABLE vendor_activity_flags IS
  'Tracks vendors flagged for inactivity. Admins review and take action.';

COMMENT ON TABLE vendor_activity_settings IS
  'Per-vertical configuration for activity monitoring thresholds.';

COMMENT ON TABLE vendor_activity_scan_log IS
  'Audit log of activity scan runs for monitoring and debugging.';

COMMENT ON FUNCTION scan_vendor_activity IS
  'Main function to scan vendors for inactivity. Called by nightly cron job.';
