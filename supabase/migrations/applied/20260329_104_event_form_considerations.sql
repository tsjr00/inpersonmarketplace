-- Migration 104: Event form consideration fields
-- Adds structured fields for event planning considerations.
-- These are searchable columns (not JSONB) for analytics and matching.

-- Children present at event
ALTER TABLE catering_requests
  ADD COLUMN IF NOT EXISTS children_present BOOLEAN NOT NULL DEFAULT false;

-- Themed event flag + description
ALTER TABLE catering_requests
  ADD COLUMN IF NOT EXISTS is_themed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE catering_requests
  ADD COLUMN IF NOT EXISTS theme_description TEXT;

-- Competing vendors — boolean + detail (replaces text-only competing_food_options)
ALTER TABLE catering_requests
  ADD COLUMN IF NOT EXISTS has_competing_vendors BOOLEAN NOT NULL DEFAULT false;

-- Estimated spend per attendee (cents, optional)
ALTER TABLE catering_requests
  ADD COLUMN IF NOT EXISTS estimated_spend_per_attendee_cents INTEGER;

-- Preferred vendor categories (array of category names for matching)
ALTER TABLE catering_requests
  ADD COLUMN IF NOT EXISTS preferred_vendor_categories TEXT[];

-- Notify PostgREST of schema change
NOTIFY pgrst, 'reload schema';
