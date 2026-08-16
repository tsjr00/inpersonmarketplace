-- ============================================================================
-- Migration 231: Event background-check disclosure (owner, 2026-08-15)
-- ADDITIVE ONLY — 2 nullable columns on catering_requests. Paste-and-go class.
--
-- Prompted by event-organizer feedback: schools, churches, and daycares often
-- require vendor background checks. The organizer declares it in their event
-- profile (dashboard secondary questionnaire); vendors see it on the
-- invitation BEFORE deciding — whether to go through a check, and whether to
-- pay for one, is their call to make with the facts in hand.
--
-- Pre-check (optional):
--   SELECT count(*) FROM information_schema.columns
--   WHERE table_name='catering_requests' AND column_name LIKE 'background_check%';
--   -- expect 0 before, 2 after
-- ============================================================================

ALTER TABLE public.catering_requests
  ADD COLUMN IF NOT EXISTS background_check_required BOOLEAN,
  ADD COLUMN IF NOT EXISTS background_check_details TEXT;

COMMENT ON COLUMN public.catering_requests.background_check_required IS
  'Organizer requires vendor background checks at this event (owner 2026-08-15). NULL = not answered; shown to vendors on the invitation before they decide.';
COMMENT ON COLUMN public.catering_requests.background_check_details IS
  'Organizer''s description of the background-check process, including any cost/fee the vendor would pay.';

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK:
--   ALTER TABLE public.catering_requests
--     DROP COLUMN IF EXISTS background_check_required,
--     DROP COLUMN IF EXISTS background_check_details;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================================
