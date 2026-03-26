-- Migration 101: Additional event form fields for refined product type analysis
--
-- Adds per-meal budget alternative, competing food context, ticketed event flag,
-- and estimated dwell time. These support event-type-aware viability scoring.
-- See: event_system_deep_dive.md Part 13.5

-- Per-meal budget (alternative to total_food_budget_cents — organizer enters one or the other)
ALTER TABLE public.catering_requests ADD COLUMN IF NOT EXISTS per_meal_budget_cents INTEGER;

-- Competing food options at venue (affects buyer rate estimation for Products B & C)
ALTER TABLE public.catering_requests ADD COLUMN IF NOT EXISTS competing_food_options TEXT;

-- Ticketed event flag (ticketed events score higher — access to attendee inbox, known count)
ALTER TABLE public.catering_requests ADD COLUMN IF NOT EXISTS is_ticketed BOOLEAN DEFAULT false;

-- Estimated dwell time in hours (how long attendees stay — affects purchase likelihood)
ALTER TABLE public.catering_requests ADD COLUMN IF NOT EXISTS estimated_dwell_hours NUMERIC;

NOTIFY pgrst, 'reload schema';
