-- Migration 128: Add event_setting column to catering_requests
--
-- Purpose: Capture Indoor/Outdoor/Either as structured data, separate from
--   the setup_instructions free-text column. The form at
--   EventRequestForm.tsx:446-471 was overwriting setup_instructions with
--   the enum value, conflating two different concepts.
--
-- After this ships:
--   - event_setting holds the structured indoor/outdoor/either enum
--   - setup_instructions returns to its original purpose: free-text setup notes
--     (power, water, vendor parking, load-in instructions)
--   - Vendor matching at viability.ts can use event_setting directly
--     instead of inferring from event_type
--
-- Backfill: not done. Rows where setup_instructions IN ('indoor','outdoor','either')
--   from the old form behavior remain as-is until the form is updated. Optional
--   future cleanup:
--     UPDATE catering_requests
--     SET event_setting = setup_instructions, setup_instructions = NULL
--     WHERE setup_instructions IN ('indoor','outdoor','either');
--   Defer this until form code ships and we can verify no false matches.
--
-- RLS: existing catering_requests policies apply to all columns; no change.
--
-- Reversal:
--   ALTER TABLE catering_requests DROP CONSTRAINT IF EXISTS catering_requests_event_setting_check;
--   ALTER TABLE catering_requests DROP COLUMN IF EXISTS event_setting;
--   NOTIFY pgrst, 'reload schema';

ALTER TABLE catering_requests
  ADD COLUMN event_setting TEXT NULL;

ALTER TABLE catering_requests
  ADD CONSTRAINT catering_requests_event_setting_check
  CHECK (
    event_setting IS NULL
    OR event_setting = ANY (ARRAY['indoor'::text, 'outdoor'::text, 'either'::text])
  );

-- Reload PostgREST schema cache so the new column is queryable immediately
NOTIFY pgrst, 'reload schema';
