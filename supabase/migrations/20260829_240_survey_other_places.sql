-- Migration 240: buyer weekly survey — "other places you'd like to see on the
-- app" free text (owner 2026-08-29, survey cadence redesign).
--
-- Class: ADDITIVE, idempotent, safe to paste on Dev/Staging/Prod in any order.
-- Pairs with mig 239 in the same push; order between them does not matter.
--
-- The weekly buyer digest (lib/surveys/weekly.ts) asks, alongside the ratings
-- for each place they bought from, whether there are other markets / parks /
-- trucks they wish were on the app. Stored on the survey row that carried the
-- answer; read by admin reporting later (no consumer yet beyond storage).

ALTER TABLE public.market_surveys
  ADD COLUMN IF NOT EXISTS other_places_request TEXT NULL;

COMMENT ON COLUMN public.market_surveys.other_places_request IS
  'Buyer free text: other places they would like to see on the app (weekly survey, mig 240).';

NOTIFY pgrst, 'reload schema';

-- Verify (expected: 1 row)
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'market_surveys' AND column_name = 'other_places_request';

-- ROLLBACK
-- ALTER TABLE public.market_surveys DROP COLUMN IF EXISTS other_places_request;
