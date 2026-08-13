-- ############################################################################
-- ## ⛔ POSTMORTEM — THIS MIGRATION CAUSED A PRODUCTION INCIDENT.            ##
-- ## Added 2026-08-12. Do not copy this pattern. Read before reusing any of  ##
-- ## it. Repaired by 20260812_224_restore_ft_declared_schedules.sql.         ##
-- ############################################################################
--
-- WHAT IT BROKE
--   Ran on Staging 2026-07-25 and Prod 2026-07-31. One statement deactivated 9
--   rows across 4 locations on Prod and 7 across 3 on Staging. Consequences,
--   unnoticed for ~2 weeks: food-truck locations disappeared from buyer search
--   entirely (lib/markets/visible-markets.ts requires an active row); trucks
--   dropped off "where are trucks today" (api/trucks/where-today filters
--   is_active); and at private-pickup spots each truck's own stated hours
--   silently reverted to the location default (get_available_pickup_dates
--   reads COALESCE(vms.vendor_start_time, ms.start_time)). Found only when the
--   owner reported that a ZIP + 25-mile search returned almost nothing.
--
-- THE FALSE ASSUMPTION
--   The WHERE clause below encodes: "a food-truck schedule row with no paid
--   booking behind it is a phantom." That is false, and false for most of the
--   platform:
--
--   * Trucks sell at parks this platform does NOT manage, and never had to be
--     managed to sell. At an unmanaged location there is no spot to buy, so a
--     paid park_spot_booking can NEVER exist — every legitimately declared
--     schedule there matched this migration's definition of "phantom". Not an
--     edge case: the whole category.
--   * vendor_market_schedules is a vendor DECLARATION (the days/times a truck
--     saves in api/vendor/markets/[id]/schedules), not an attendance or
--     check-in record. There is no check-in concept in this schema. The
--     "attendance" wording in older comments is a misnomer and is what made
--     this deletion feel safe. No-shows are handled downstream by order
--     confirmation, auto-expire, and uncaptured payment intent.
--   * The filter is vertical_id='food_trucks' with NO market_type filter, so
--     it also hit private_pickup locations — a truck's OWN spot, which has no
--     park model at all. 2 of the 9 Prod rows were private-pickup.
--
--   The booking-driven model assumed here is real, but ONLY at parks with a
--   manager account. Applied platform-wide, it destroyed vendor-entered data.
--
-- IT WAS WARNED ABOUT, THE SAME DAY
--   Migration 210's closing note said this cleanup "requires distinguishing
--   them from booking-created rows — deferred to a data-hygiene pass." This
--   migration shipped hours later using booking-presence as that distinction,
--   which is exactly the conflation 210 flagged. The warning was written and
--   then walked past.
--
-- WHY NO WHERE CLAUSE COULD HAVE SAVED IT
--   There is no created_by / source column on vendor_market_schedules, so no
--   query can separate a trigger-fabricated row from one a vendor saved by
--   hand. Bulk deactivation of this table therefore cannot be made safe by
--   being cleverer. If rows must go, ask the vendors to re-save, or add
--   provenance to the table first.
--
-- THE ONE THING IT DID RIGHT
--   It was a single set-based UPDATE with `updated_at = now()`, so every row
--   it touched carries one identical timestamp. That fingerprint is the only
--   reason the damage could be identified exactly and reversed. Its own header
--   claims "ROLLBACK: none" — that was wrong; mig 224 rolled it back precisely.
--
-- BEFORE WRITING ANYTHING LIKE THIS AGAIN, see the "DO NOT REOPEN THIS DOOR"
-- checklist at the end of 20260812_224_restore_ft_declared_schedules.sql.
--
-- ############################################################################
--
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
