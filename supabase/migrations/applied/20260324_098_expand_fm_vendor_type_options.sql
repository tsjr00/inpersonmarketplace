-- Migration 098: Expand FM vendor_type options to match listing categories
-- The vendor signup form shows vendor_type options from verticals.config.vendor_fields.
-- Adding all FM listing categories so vendors can accurately identify their product type
-- at signup, which enables tax guidance on the success page.

UPDATE verticals
SET config = jsonb_set(
  config,
  '{vendor_fields}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN field->>'key' = 'vendor_type' THEN
          jsonb_set(
            field,
            '{options}',
            '["Produce", "Meat & Poultry", "Dairy & Eggs", "Baked Goods", "Pantry", "Prepared Foods", "Plants & Flowers", "Health & Wellness", "Art & Decor", "Home & Functional", "Other"]'::jsonb
          )
        ELSE field
      END
    )
    FROM jsonb_array_elements(config->'vendor_fields') AS field
  )
)
WHERE vertical_id = 'farmers_market';
