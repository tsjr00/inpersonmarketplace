-- ============================================================================
-- Migration 176: opt-in statement catalog — vertical cleanup + FM statement set
-- ============================================================================
-- One coherent curation pass on market_optin_statement_catalog (P5 follow-up,
-- 2026-07-03, from staging testing). DATA-ONLY (no DDL). Three parts:
--
--   (A) RE-TAG 2 FM-specific "universal" statements off NULL → 'farmers_market'
--       (producer-only, local-sourcing) so they stop showing to FT park
--       operators via the mig-175 vertical filter.
--
--   (B) NEUTRALIZE vertical-specific wording in 5 UNIVERSAL statements so they
--       read cleanly for markets AND parks ("booth" → "space", plus FM staff/
--       session phrasing). IDs unchanged (internal keys); only text changes.
--
--   (C) SEED 8 FM-specific statements ('farmers_market') — the "P5-for-FM"
--       counterpart (provenance / label-truth / cottage food / scales /
--       perishables / sampling). ON CONFLICT DO NOTHING.
--
-- Vendor acceptances (vendor_market_agreement_acceptances) snapshot the rendered
-- text at acceptance time, so ALREADY-ACCEPTED agreements are unaffected by (A)/
-- (B)/(C) — only the menu shown to new signers changes.
--
-- ⚠️ DELIBERATELY EXCLUDED (user, 2026-07-03): SNAP / EBT / WIC / nutrition-
-- redemption statements. The platform does NOT handle token redemption; no
-- statement may imply otherwise.
--
-- Resulting scopes: 13 universal (NULL) · 10 farmers_market (2 re-tagged + 8 new)
-- · 16 food_trucks. FM manager sees 23, FT operator sees 29.
--
-- Note: quoted claim terms use ASCII double-quotes inside the text on purpose
-- (keeps the single-quoted SQL literals clean).
-- ============================================================================
-- Dependencies: mig 136 (catalog + the original 15 rows), mig 175 (vertical_id).
-- ============================================================================

-- (A) Re-tag FM-flavored statements ------------------------------------------
UPDATE market_optin_statement_catalog
SET vertical_id = 'farmers_market'
WHERE id IN ('producer-only', 'local-sourcing');

-- (B) Vertical-neutral wording on 5 universals --------------------------------
UPDATE market_optin_statement_catalog
SET statement = 'I will have my space fully set up by {setup_complete_time} and will not begin tearing down before {teardown_earliest_time}, regardless of sales activity or weather.'
WHERE id = 'setup-teardown';

UPDATE market_optin_statement_catalog
SET statement = 'I will set up only in the space assigned to me by staff. I will not occupy adjacent spaces or expand beyond my assigned footprint without prior approval.'
WHERE id = 'booth-assignment';

UPDATE market_optin_statement_catalog
SET statement = 'I understand space fees are non-refundable, except when the operator cancels the date. Cancellations by the vendor with at least {notice_days} days'' notice may be eligible for a credit toward a future booking, at the operator''s discretion.'
WHERE id = 'booth-fee-nonrefundable';

UPDATE market_optin_statement_catalog
SET statement = 'If I fail to arrive without prior cancellation, my space fee is forfeit and I may be denied future reservations until the situation is resolved with staff.'
WHERE id = 'no-show-forfeiture';

UPDATE market_optin_statement_catalog
SET statement = 'I follow all applicable food safety guidelines for my product type, including temperature control, hand-washing, sample-handling, and cross-contamination prevention. I will keep food safety equipment (gloves, sanitizer, thermometers) available at my space.'
WHERE id = 'food-safety';

-- (C) Seed FM-specific statements --------------------------------------------
INSERT INTO market_optin_statement_catalog (id, category, statement, placeholders, vertical_id, sort_order)
VALUES
  ('fm-label-truth', 'product_quality',
   'Any claim I make about my products — such as "organic," "no-spray," "pasture-raised," "grass-fed," or "non-GMO" — is truthful, and where a certification is required to make that claim, I hold it and will provide proof on request.',
   '{}', 'farmers_market', 400),
  ('fm-value-added-own', 'product_quality',
   'Any value-added or prepared products I sell are made primarily from ingredients I grew or raised, except where I note otherwise on the item.',
   '{}', 'farmers_market', 410),
  ('fm-resale-disclosure', 'product_quality',
   'I will clearly disclose, at my booth and to staff, any item I did not grow, raise, or make myself — and I understand some markets prohibit resale entirely.',
   '{}', 'farmers_market', 420),
  ('fm-cottage-food', 'compliance',
   'If I sell cottage or home-kitchen foods, I comply with my state''s cottage food law, including required labeling — my name and address, product name, ingredients, allergens, and a "made in a home kitchen that is not inspected by a health authority" notice where required.',
   '{}', 'farmers_market', 430),
  ('fm-organic-cert', 'compliance',
   'If I represent any product as "certified organic," I hold a current organic certification and will provide a copy on request.',
   '{}', 'farmers_market', 440),
  ('fm-certified-scales', 'compliance',
   'Any product I sell by weight is weighed on a scale that is legal-for-trade and certified as required by my state''s weights-and-measures rules.',
   '{}', 'farmers_market', 450),
  ('fm-perishable-handling', 'compliance',
   'Perishable products I sell — such as eggs, dairy, or meat — are kept, stored, and transported at safe temperatures and under any license my product type requires.',
   '{}', 'farmers_market', 460),
  ('fm-sampling', 'compliance',
   'If I offer samples, I follow safe sampling practices (hand-washing or gloves, clean utensils, and protected samples) and hold any sampling permit required in my area.',
   '{}', 'farmers_market', 470)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK (data):
--   -- (C) remove the FM seed
--   DELETE FROM market_optin_statement_catalog WHERE id LIKE 'fm-%';
--   -- (A) un-tag
--   UPDATE market_optin_statement_catalog SET vertical_id = NULL
--     WHERE id IN ('producer-only','local-sourcing');
--   -- (B) wording is forward copy-only; re-apply mig 136 strings to revert.
--   NOTIFY pgrst, 'reload schema';
-- ============================================================================
-- VERIFICATION (run after apply):
-- SELECT vertical_id, count(*) FROM market_optin_statement_catalog GROUP BY vertical_id;
--   -- expect: NULL=13, farmers_market=10, food_trucks=16
-- SELECT id, statement FROM market_optin_statement_catalog
--   WHERE id IN ('setup-teardown','booth-assignment','booth-fee-nonrefundable',
--                'no-show-forfeiture','food-safety'); -- reworded, no "booth"
-- ============================================================================
