-- Migration: Vendor Market Schedules
-- Purpose: Track which specific schedules vendors attend at each market
-- This enables accurate pickup date calculation for orders

-- ============================================================================
-- VENDOR_MARKET_SCHEDULES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendor_market_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_profile_id UUID NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  schedule_id UUID NOT NULL REFERENCES market_schedules(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Vendor can only have one entry per schedule
  UNIQUE(vendor_profile_id, schedule_id)
);

COMMENT ON TABLE vendor_market_schedules IS 'Tracks which specific schedules vendors attend at each market';
COMMENT ON COLUMN vendor_market_schedules.is_active IS 'False when vendor stops attending this schedule';

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_vms_vendor ON vendor_market_schedules(vendor_profile_id);
CREATE INDEX IF NOT EXISTS idx_vms_market ON vendor_market_schedules(market_id);
CREATE INDEX IF NOT EXISTS idx_vms_schedule ON vendor_market_schedules(schedule_id);
CREATE INDEX IF NOT EXISTS idx_vms_active ON vendor_market_schedules(is_active) WHERE is_active = true;

-- Composite index for common lookup pattern
CREATE INDEX IF NOT EXISTS idx_vms_vendor_market_active
  ON vendor_market_schedules(vendor_profile_id, market_id)
  WHERE is_active = true;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE vendor_market_schedules ENABLE ROW LEVEL SECURITY;

-- Vendors can manage their own schedule affiliations
CREATE POLICY "vms_vendor_select" ON vendor_market_schedules
  FOR SELECT USING (
    vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "vms_vendor_insert" ON vendor_market_schedules
  FOR INSERT WITH CHECK (
    vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "vms_vendor_update" ON vendor_market_schedules
  FOR UPDATE USING (
    vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "vms_vendor_delete" ON vendor_market_schedules
  FOR DELETE USING (
    vendor_profile_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid())
  );

-- Public can see active vendor schedules (needed for pickup date calculation)
CREATE POLICY "vms_public_select" ON vendor_market_schedules
  FOR SELECT USING (is_active = true);

-- Admins have full access
CREATE POLICY "vms_admin_all" ON vendor_market_schedules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid()
      AND 'admin' = ANY(roles)
    )
  );

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

DROP TRIGGER IF EXISTS update_vms_updated_at ON vendor_market_schedules;
CREATE TRIGGER update_vms_updated_at
  BEFORE UPDATE ON vendor_market_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PICKUP DATE CALCULATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_vendor_next_pickup_date(
  p_vendor_profile_id UUID,
  p_market_id UUID,
  p_from_date DATE DEFAULT CURRENT_DATE
) RETURNS DATE
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule RECORD;
  v_next_date DATE;
  v_earliest DATE := NULL;
  v_days_ahead INT;
  v_today_dow INT;
BEGIN
  -- Get current day of week (0=Sunday, 6=Saturday)
  v_today_dow := EXTRACT(DOW FROM p_from_date)::INT;

  -- Loop through vendor's active schedules at this market
  FOR v_schedule IN
    SELECT ms.day_of_week, ms.start_time
    FROM vendor_market_schedules vms
    JOIN market_schedules ms ON ms.id = vms.schedule_id
    WHERE vms.vendor_profile_id = p_vendor_profile_id
      AND vms.market_id = p_market_id
      AND vms.is_active = true
      AND ms.active = true
    ORDER BY ms.day_of_week
  LOOP
    -- Calculate days until this schedule
    v_days_ahead := (v_schedule.day_of_week - v_today_dow + 7) % 7;

    -- If today is the schedule day, use next week (can't pick up same day)
    IF v_days_ahead = 0 THEN
      v_days_ahead := 7;
    END IF;

    v_next_date := p_from_date + v_days_ahead;

    -- Track earliest date
    IF v_earliest IS NULL OR v_next_date < v_earliest THEN
      v_earliest := v_next_date;
    END IF;
  END LOOP;

  RETURN v_earliest;
END;
$$;

COMMENT ON FUNCTION get_vendor_next_pickup_date IS 'Calculates the next pickup date for a vendor at a market based on their schedule attendance';

-- ============================================================================
-- TRIGGER: CASCADE SCHEDULE DEACTIVATION
-- ============================================================================

-- When a market_schedule is deactivated, deactivate related vendor entries
CREATE OR REPLACE FUNCTION handle_market_schedule_deactivation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.active = false AND OLD.active = true THEN
    UPDATE vendor_market_schedules
    SET is_active = false, updated_at = NOW()
    WHERE schedule_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_market_schedule_deactivation ON market_schedules;
CREATE TRIGGER trigger_market_schedule_deactivation
  AFTER UPDATE ON market_schedules
  FOR EACH ROW
  WHEN (NEW.active IS DISTINCT FROM OLD.active)
  EXECUTE FUNCTION handle_market_schedule_deactivation();

-- ============================================================================
-- HELPER FUNCTION: Check if vendor has any active schedules at market
-- ============================================================================

CREATE OR REPLACE FUNCTION vendor_has_active_schedules(
  p_vendor_profile_id UUID,
  p_market_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM vendor_market_schedules vms
    JOIN market_schedules ms ON ms.id = vms.schedule_id
    WHERE vms.vendor_profile_id = p_vendor_profile_id
      AND vms.market_id = p_market_id
      AND vms.is_active = true
      AND ms.active = true
  );
END;
$$;

COMMENT ON FUNCTION vendor_has_active_schedules IS 'Returns true if vendor has at least one active schedule at the market';
