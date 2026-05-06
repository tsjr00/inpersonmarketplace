-- Migration 129: Make catering_requests.address optional
--
-- Per Session 75 design (event_data_gathering_plan.md): address is an
-- OPTIONAL Stage 1 field — recommended but not required during initial
-- intake. Becomes mandatory at Stage 2 for the event to advance to
-- 'approved' status (admin gate enforced in admin/events/[id]/route.ts:113-122).
--
-- Original migration 070 created `address` as NOT NULL, predating the
-- Stage 1 / Stage 2 split. This drops the constraint so the new form's
-- "address blank → submit succeeds → fill in later" path works without
-- the 23502 NOT-NULL violation that was blocking the first staging test
-- (2026-05-01).
--
-- Schema-only change. No data backfill — existing rows already have
-- non-null `address` values. Reversal requires backfilling any future
-- null rows first:
--   ALTER TABLE catering_requests ALTER COLUMN address SET NOT NULL;
--
-- RLS: existing catering_requests policies apply unchanged.

ALTER TABLE catering_requests ALTER COLUMN address DROP NOT NULL;

-- Reload PostgREST schema cache so the new constraint state is visible
-- to API queries immediately.
NOTIFY pgrst, 'reload schema';
