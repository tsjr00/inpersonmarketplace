-- Migration 113: Hybrid event support + access code verification
--
-- Adds:
-- 1. access_code on catering_requests — short code for company-paid verification
--    (attendees enter this to prove they're authorized for company-paid ordering)
-- 2. company_max_per_attendee_cents — dollar cap per person for hybrid events
--    (one item up to this amount is company-paid, everything else is attendee-paid)

BEGIN;

-- Access code: 8-char uppercase alphanumeric, generated on event approval
-- Nullable — only set for company_paid and hybrid events
ALTER TABLE public.catering_requests
  ADD COLUMN IF NOT EXISTS access_code TEXT;

-- Unique index so codes don't collide across events
CREATE UNIQUE INDEX IF NOT EXISTS idx_catering_requests_access_code
  ON public.catering_requests (access_code)
  WHERE access_code IS NOT NULL;

-- Dollar cap per attendee for hybrid events
-- NULL = no cap (pure company_paid covers everything)
-- e.g., 1500 = $15.00 per person
ALTER TABLE public.catering_requests
  ADD COLUMN IF NOT EXISTS company_max_per_attendee_cents INTEGER;

-- Constraint: cap must be positive when set
ALTER TABLE public.catering_requests
  ADD CONSTRAINT ck_company_max_per_attendee_positive
  CHECK (company_max_per_attendee_cents IS NULL OR company_max_per_attendee_cents > 0);

COMMENT ON COLUMN public.catering_requests.access_code IS 'Short code attendees enter to verify company-paid authorization. Generated on approval for company_paid and hybrid events.';
COMMENT ON COLUMN public.catering_requests.company_max_per_attendee_cents IS 'Max company-paid amount per attendee for hybrid events. Items at or below this are company-paid; above are attendee-paid. NULL = no cap.';

NOTIFY pgrst, 'reload schema';

COMMIT;
