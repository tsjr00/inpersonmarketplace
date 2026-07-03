-- ============================================================================
-- Migration 175: opt-in catalog vertical tag + FT park agreement statements (P5)
-- ============================================================================
-- Adds a vertical scope to the opt-in statement catalog (mig 136) so
-- vertical-specific agreement statements don't cross-pollinate:
--   - vertical_id NULL  => universal (the existing 15 stay visible to ALL) ;
--   - vertical_id 'food_trucks' => only offered to FT park operators.
-- The catalog + selections routes filter by (vertical_id IS NULL OR = market's
-- vertical). Existing categories are reused (no CHECK change).
--
-- Then seeds 16 FT park agreement statements (design + user review:
-- apps/web/.claude/ft_p5_agreement_statements.md) — HB 2844 / DSHS compliance,
-- fire/food safety, and general food-truck-park conduct/quality. Managers pick
-- a la carte; {placeholders} are filled per-market at selection time.
--
-- ADDITIVE, idempotent (ON CONFLICT DO NOTHING). No money path.
-- ============================================================================
-- ROLLBACK (single transaction):
--   BEGIN;
--     DELETE FROM market_optin_statement_catalog WHERE vertical_id = 'food_trucks';
--     ALTER TABLE market_optin_statement_catalog DROP COLUMN IF EXISTS vertical_id;
--     NOTIFY pgrst, 'reload schema';
--   COMMIT;
--   Note: DELETE only removes the FT seed rows; a market that selected one keeps
--   its market_optin_selections FK... which would break. Only roll back before
--   any FT market has made selections. Vendor acceptances snapshot the text, so
--   already-accepted agreements are unaffected regardless.
--
-- Dependencies: mig 136 (market_optin_statement_catalog).
-- ============================================================================

-- 1. Vertical scope (NULL = universal; keeps the existing 15 visible to all).
ALTER TABLE market_optin_statement_catalog
  ADD COLUMN IF NOT EXISTS vertical_id TEXT NULL;

COMMENT ON COLUMN market_optin_statement_catalog.vertical_id IS
  'Vertical scope for the statement. NULL = universal (offered to every market). A slug (e.g. food_trucks) restricts it to that vertical. Catalog/selections routes filter by (vertical_id IS NULL OR vertical_id = market.vertical_id).';

CREATE INDEX IF NOT EXISTS idx_optin_catalog_vertical
  ON market_optin_statement_catalog(vertical_id)
  WHERE vertical_id IS NOT NULL;

-- 2. Seed the FT park agreement statements (vertical_id = 'food_trucks').
INSERT INTO market_optin_statement_catalog (id, category, statement, placeholders, vertical_id, sort_order)
VALUES
  -- Compliance — HB 2844 / DSHS + fire/food safety
  ('ft-dshs-license', 'compliance',
   'I hold a current Texas DSHS Mobile Food Vendor license for my unit as required by Chapter 437B, and I will keep it valid the entire time I operate at this park.',
   '{}', 'food_trucks', 200),
  ('ft-license-display', 'compliance',
   'I will display my current DSHS license and inspection certificate on my unit where customers and inspectors can see them while I operate at this park.',
   '{}', 'food_trucks', 210),
  ('ft-license-lapse-notice', 'compliance',
   'I will notify the park operator immediately if my DSHS license or any required inspection is suspended, revoked, expired, or otherwise lapses.',
   '{}', 'food_trucks', 220),
  ('ft-propane-inspection', 'compliance',
   'I maintain a current LP-gas/propane system inspection for my unit and will provide proof on request. My propane tanks, lines, and connections meet applicable fire-code (NFPA 58) requirements.',
   '{}', 'food_trucks', 230),
  ('ft-fire-suppression', 'compliance',
   'I keep a current, properly rated fire extinguisher accessible on my unit at all times, and — if I cook with grease or open flame — a working, inspected automatic fire-suppression system.',
   '{}', 'food_trucks', 240),
  ('ft-food-certifications', 'compliance',
   'I hold current food manager and food handler certifications for my staff as required for my classification, and I will provide copies on request.',
   '{}', 'food_trucks', 250),
  ('ft-commissary', 'compliance',
   'I operate from an approved commissary or central preparation facility where required, and I will provide its information to the park operator on request.',
   '{}', 'food_trucks', 260),
  ('ft-location-list-consent', 'compliance',
   'I authorize the park operator to include this location, and the dates I am scheduled here, in my required operating-location list and any location reporting to state authorities.',
   '{}', 'food_trucks', 270),
  -- Conduct — park atmosphere / safety / good-neighbor
  ('ft-generator-quiet', 'conduct',
   'If I run a generator, it will be a reasonably quiet unit positioned away from customers and neighboring trucks, and I will shut it down by {generator_curfew_time} or when the park closes.',
   ARRAY['generator_curfew_time'], 'food_trucks', 280),
  ('ft-power-draw', 'conduct',
   'If I connect to park-provided power, I will not exceed {max_amps} amps at my spot, and I will use proper outdoor-rated cords and connections.',
   ARRAY['max_amps'], 'food_trucks', 290),
  ('ft-grease-wastewater', 'conduct',
   'I will contain and dispose of all grease, gray water, and wastewater off-site. I will not pour, drain, or dump any liquids, grease, or waste onto the ground, into storm drains, or into park facilities.',
   '{}', 'food_trucks', 300),
  ('ft-cleanup', 'conduct',
   'I will keep my spot and the area around it clean during service and leave it clean at the end of the day, removing all trash, packaging, and food waste I generate.',
   '{}', 'food_trucks', 310),
  ('ft-checkin', 'conduct',
   'I will check in through the platform each day I operate at this park so my attendance and location are recorded.',
   '{}', 'food_trucks', 320),
  ('ft-spot-fit', 'conduct',
   'My unit, including hitch, awnings, and service window, fits within my assigned spot. I will set up only in my assigned spot and will not block drive lanes, walkways, or neighboring trucks.',
   '{}', 'food_trucks', 330),
  -- Product / quality
  ('ft-menu-consistency', 'product_quality',
   'I will serve the menu and food type I represented to the park operator, and I will let the operator know before I make a significant change to what I sell.',
   '{}', 'food_trucks', 340),
  -- Insurance
  ('ft-auto-insurance', 'insurance',
   'I maintain current commercial auto/vehicle insurance for my unit as required to legally operate it on public roads.',
   '{}', 'food_trucks', 350)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION (run after apply):
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='market_optin_statement_catalog' AND column_name='vertical_id'; -- 1
-- SELECT count(*) FROM market_optin_statement_catalog WHERE vertical_id='food_trucks'; -- 16
-- SELECT count(*) FROM market_optin_statement_catalog WHERE vertical_id IS NULL;       -- 15
-- ============================================================================
