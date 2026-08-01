-- Migration 210: don't auto-create vendor schedules on approval for FT parks
--
-- Tester finding 2026-07-25: a park operator could not approve a truck — the
-- Approve click failed with "Schedule conflict … Hub City …", a PHANTOM conflict.
--
-- Chain: approving a truck flips market_vendors.approved → fires
-- trigger_auto_create_vendor_schedules → auto_create_vendor_schedules()
-- (mig 20260128_002) which INSERTs an ACTIVE vendor_market_schedules row for
-- EVERY active day of the PARK (not the days the truck booked). For a park that
-- runs Mon/Tue/Thu/Fri/Sat, approving a truck that only booked Mon/Tue also
-- fabricates Thu/Fri/Sat schedules. Those invented rows then trip
-- check_vendor_schedule_conflict (mig 066) against the truck's REAL bookings at
-- other parks (e.g. a Saturday at Hub City), and the whole approval rolls back.
--
-- For food-truck PARKS this all-park-day auto-create is simply wrong: a truck's
-- selling schedule is created PER BOOKED DAY by the payment webhook
-- (lib/stripe/webhooks.ts handleParkSpotCheckoutComplete), and approval is
-- vetting, not scheduling. So skip the auto-create entirely for FT-park markets.
-- Farmers-market booth markets are UNCHANGED (approval still auto-creates their
-- schedule — the booth model this function was built for).
--
-- Function-replace only (bodies VERBATIM from mig 002 + a single FT skip guard);
-- the existing triggers keep pointing at these functions, so nothing else changes.
-- No table/column change.
--
-- NOTE (separate follow-up, not this migration): FT trucks approved BEFORE this
-- fix may carry phantom all-park-day vendor_market_schedules rows from prior
-- approvals. Cleaning those requires distinguishing them from booking-created
-- rows — deferred to a data-hygiene pass. This migration stops NEW phantoms and
-- unblocks approval.

CREATE OR REPLACE FUNCTION auto_create_vendor_schedules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger when vendor is newly approved
  IF NEW.approved = true AND (OLD.approved = false OR OLD.approved IS NULL) THEN
    -- Skip food-truck parks: their schedules are booking-driven (per booked day
    -- via the payment webhook), not all-park-day on approval. Auto-creating here
    -- fabricates unbooked days and trips the cross-park conflict trigger.
    IF EXISTS (SELECT 1 FROM markets WHERE id = NEW.market_id AND vertical_id = 'food_trucks') THEN
      RETURN NEW;
    END IF;
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

CREATE OR REPLACE FUNCTION auto_create_vendor_schedules_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.approved = true THEN
    -- Same FT-park skip as the UPDATE variant (see above).
    IF EXISTS (SELECT 1 FROM markets WHERE id = NEW.market_id AND vertical_id = 'food_trucks') THEN
      RETURN NEW;
    END IF;
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

NOTIFY pgrst, 'reload schema';

-- ROLLBACK: re-apply the mig 20260128_002 bodies (without the FT skip).
