-- Migration 100: Add structured fields to catering_requests for event viability scoring
--
-- Context: The event request form previously collected budget as free text (budget_notes).
-- Path A of the event system strengthening plan (Session 63+) requires structured data
-- to auto-calculate viability scores and help admin evaluate event requests.
--
-- All columns are nullable — existing requests are unaffected.
-- See: apps/web/.claude/event_system_deep_dive.md Part 12 for full plan.

-- Event type classification (determines which evaluation criteria apply)
-- Values: corporate_lunch, team_building, grand_opening, festival, private_party, other
ALTER TABLE public.catering_requests ADD COLUMN IF NOT EXISTS event_type TEXT;

-- Payment model (determines budget relevance and checkout flow)
-- Values: company_paid, attendee_paid, hybrid
ALTER TABLE public.catering_requests ADD COLUMN IF NOT EXISTS payment_model TEXT;

-- Structured budget (replaces free-text budget_notes for company_paid/hybrid events)
-- Stored in cents for consistency with all other financial fields
ALTER TABLE public.catering_requests ADD COLUMN IF NOT EXISTS total_food_budget_cents INTEGER;

-- Expected meal count (distinct from headcount — not every guest buys food)
-- For company_paid: typically = headcount
-- For attendee_paid: typically 40-70% of headcount
-- For crowd events: may be 10-30% of foot traffic
ALTER TABLE public.catering_requests ADD COLUMN IF NOT EXISTS expected_meal_count INTEGER;

-- Menu planning flags (help vendors decide what to prepare)
ALTER TABLE public.catering_requests ADD COLUMN IF NOT EXISTS beverages_provided BOOLEAN DEFAULT false;
ALTER TABLE public.catering_requests ADD COLUMN IF NOT EXISTS dessert_provided BOOLEAN DEFAULT false;

-- Recurring event tracking (increases scoring weight — repeat business)
ALTER TABLE public.catering_requests ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;
-- Values: weekly, biweekly, monthly, quarterly (only meaningful when is_recurring=true)
ALTER TABLE public.catering_requests ADD COLUMN IF NOT EXISTS recurring_frequency TEXT;

-- Notify PostgREST of schema change
NOTIFY pgrst, 'reload schema';
