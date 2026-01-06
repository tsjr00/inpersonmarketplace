-- Migration: Remove permit_years from fireworks vendor_fields
-- Created: 2026-01-04
-- Purpose: Remove unnecessary permit year checkboxes from signup form

-- Update fireworks config to remove permit_years from vendor_fields
UPDATE verticals
SET config = jsonb_set(
  config,
  '{vendor_fields}',
  (
    SELECT jsonb_agg(field)
    FROM jsonb_array_elements(config->'vendor_fields') AS field
    WHERE field->>'key' != 'permit_years'
  )
),
updated_at = NOW()
WHERE vertical_id = 'fireworks';

-- Verify the update
DO $$
DECLARE
  field_count INTEGER;
BEGIN
  SELECT jsonb_array_length(config->'vendor_fields') INTO field_count
  FROM verticals WHERE vertical_id = 'fireworks';

  RAISE NOTICE 'Fireworks vendor_fields count after update: %', field_count;
END $$;
