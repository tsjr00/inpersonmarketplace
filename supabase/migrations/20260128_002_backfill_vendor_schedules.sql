-- Migration: Backfill Vendor Market Schedules
-- Purpose: Populate vendor_market_schedules for existing vendor-market relationships
-- Default behavior: Vendors attend ALL active schedules at their markets

-- ============================================================================
-- BACKFILL EXISTING DATA
-- ============================================================================

-- For each approved vendor-market relationship, create entries for ALL active schedules
-- This ensures existing vendors continue to show at all days until they specify otherwise
INSERT INTO vendor_market_schedules (vendor_profile_id, market_id, schedule_id, is_active)
SELECT DISTINCT
  mv.vendor_profile_id,
  mv.market_id,
  ms.id as schedule_id,
  true as is_active
FROM market_vendors mv
JOIN market_schedules ms ON ms.market_id = mv.market_id
WHERE mv.approved = true
  AND ms.active = true
ON CONFLICT (vendor_profile_id, schedule_id) DO NOTHING;

-- ============================================================================
-- TRIGGER: Auto-create schedule entries when vendor is approved
-- ============================================================================

-- When a vendor is approved for a market, auto-create entries for all active schedules
CREATE OR REPLACE FUNCTION auto_create_vendor_schedules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger when vendor is newly approved
  IF NEW.approved = true AND (OLD.approved = false OR OLD.approved IS NULL) THEN
    INSERT INTO vendor_market_schedules (vendor_profile_id, market_id, schedule_id, is_active)
    SELECT
      NEW.vendor_profile_id,
      NEW.market_id,
      ms.id,
      true
    FROM market_schedules ms
    WHERE ms.market_id = NEW.market_id
      AND ms.active = true
    ON CONFLICT (vendor_profile_id, schedule_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_create_vendor_schedules ON market_vendors;
CREATE TRIGGER trigger_auto_create_vendor_schedules
  AFTER UPDATE ON market_vendors
  FOR EACH ROW
  WHEN (NEW.approved IS DISTINCT FROM OLD.approved)
  EXECUTE FUNCTION auto_create_vendor_schedules();

-- Also handle INSERT case (when vendor is approved on creation)
CREATE OR REPLACE FUNCTION auto_create_vendor_schedules_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.approved = true THEN
    INSERT INTO vendor_market_schedules (vendor_profile_id, market_id, schedule_id, is_active)
    SELECT
      NEW.vendor_profile_id,
      NEW.market_id,
      ms.id,
      true
    FROM market_schedules ms
    WHERE ms.market_id = NEW.market_id
      AND ms.active = true
    ON CONFLICT (vendor_profile_id, schedule_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_create_vendor_schedules_insert ON market_vendors;
CREATE TRIGGER trigger_auto_create_vendor_schedules_insert
  AFTER INSERT ON market_vendors
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_vendor_schedules_insert();

-- ============================================================================
-- TRIGGER: Auto-add new schedules to existing vendors
-- ============================================================================

-- When a new schedule is added to a market, auto-create entries for all approved vendors
CREATE OR REPLACE FUNCTION auto_add_schedule_to_vendors()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger for active schedules
  IF NEW.active = true THEN
    INSERT INTO vendor_market_schedules (vendor_profile_id, market_id, schedule_id, is_active)
    SELECT
      mv.vendor_profile_id,
      mv.market_id,
      NEW.id,
      true
    FROM market_vendors mv
    WHERE mv.market_id = NEW.market_id
      AND mv.approved = true
    ON CONFLICT (vendor_profile_id, schedule_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_add_schedule_to_vendors ON market_schedules;
CREATE TRIGGER trigger_auto_add_schedule_to_vendors
  AFTER INSERT ON market_schedules
  FOR EACH ROW
  EXECUTE FUNCTION auto_add_schedule_to_vendors();

-- Also handle when schedule is reactivated
DROP TRIGGER IF EXISTS trigger_auto_add_schedule_to_vendors_update ON market_schedules;
CREATE TRIGGER trigger_auto_add_schedule_to_vendors_update
  AFTER UPDATE ON market_schedules
  FOR EACH ROW
  WHEN (NEW.active = true AND OLD.active = false)
  EXECUTE FUNCTION auto_add_schedule_to_vendors();
