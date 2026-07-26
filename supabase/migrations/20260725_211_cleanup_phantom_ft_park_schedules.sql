-- Migration 211: deactivate phantom FT-park vendor schedules
--
-- Tester finding 2026-07-25 (follow-up to mig 210). Before mig 210,
-- auto_create_vendor_schedules() stamped an ACTIVE vendor_market_schedules row
-- for EVERY active day of a park when a truck was approved — not the days the
-- truck booked. FT trucks approved before mig 210 therefore carry phantom
-- schedule rows that falsely advertise them as selling on days they never
-- booked (buyers could place pickup orders for a no-show day).
--
-- mig 210 stopped NEW phantoms. This migration cleans EXISTING ones: it
-- DEACTIVATES (is_active=false — not delete, preserves the row) every active
-- FT-park schedule for a (truck, park, weekday) that has:
--   - no paid/completed park_spot_booking on that weekday, AND
--   - no active/requested park_standing_reservation on that weekday.
-- Those are exactly the rows the old approval auto-create fabricated. A truck
-- with a real booking (any date on that weekday) or an active standing hold is
-- left untouched. Deactivation fires the existing cart-cleanup trigger
-- (harmless — no legitimate carts exist on a day the truck never sold).
--
-- Set-based + env-agnostic (no hardcoded ids): only ever touches genuine
-- phantoms on whatever environment it runs. DATA-ONLY (no schema change).
-- Runs AFTER mig 210 so the trigger fix is already in place and no new phantoms
-- appear during cleanup.
--
-- Diagnostic (run before/after to confirm; after = expect 0 rows): the SELECT
-- with the same WHERE, in apps/web/.claude/current_task.md notes / session log.

UPDATE vendor_market_schedules vms
SET is_active = false,
    updated_at = now()
FROM market_schedules ms, markets m
WHERE ms.id = vms.schedule_id
  AND m.id  = vms.market_id
  AND vms.is_active = true
  AND m.vertical_id = 'food_trucks'
  AND NOT EXISTS (
    SELECT 1 FROM park_spot_bookings b
    WHERE b.vendor_profile_id = vms.vendor_profile_id
      AND b.market_id         = vms.market_id
      AND b.status IN ('paid','completed')
      AND EXTRACT(DOW FROM b.booking_date) = ms.day_of_week
  )
  AND NOT EXISTS (
    SELECT 1 FROM park_standing_reservations sr
    WHERE sr.vendor_profile_id = vms.vendor_profile_id
      AND sr.market_id         = vms.market_id
      AND sr.status IN ('requested','active')
      AND sr.day_of_week       = ms.day_of_week
  );

-- Verification (expect 0 after): re-run the phantom diagnostic SELECT.
--
-- ROLLBACK: none (data cleanup). The deactivated rows are phantom — reactivating
-- them would re-introduce false availability. If a specific row was
-- mis-deactivated, re-book that day (the webhook reactivates it) or set
-- is_active=true on that vms id manually.
