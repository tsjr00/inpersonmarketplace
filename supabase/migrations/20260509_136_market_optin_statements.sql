-- Migration 136: Market opt-in vendor agreement statements
--
-- Two new tables backing the opt-in agreement system from market_manager_v2_plan
-- Section H + market_manager_optin_statements_v1.md (15 starter statements):
--
-- 1. market_optin_statement_catalog — curated list of opt-in statements that
--    a manager can choose from when configuring their market. Statements have
--    {placeholders} for manager-supplied values (e.g., {distance_miles}).
--
-- 2. market_optin_selections — which statements a particular market has
--    selected, plus the placeholder values the manager filled in.
--
-- Vendor acceptance records (snapshot at signup time) live in a separate table
-- introduced in Phase B alongside the co-branded vendor signup flow. Phase A
-- is just "manager picks statements and fills placeholders."
--
-- Seed data: 15 starter statements across 5 categories
-- (product_quality, conduct, insurance, fees, compliance), copied verbatim from
-- apps/web/.claude/market_manager_optin_statements_v1.md. The seed uses
-- INSERT ... ON CONFLICT DO NOTHING so re-running is safe.
--
-- RLS: not enabled — route-layer auth (isMarketManager helper) handles access.
-- The catalog is conceptually public (vendor signup needs to read it eventually)
-- but for v1 only the manager-side surfaces query it; broaden when Phase B
-- ships co-branded vendor onboarding.

-- Catalog of available statements ----------------------------------------------
CREATE TABLE IF NOT EXISTS market_optin_statement_catalog (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN (
    'product_quality', 'conduct', 'insurance', 'fees', 'compliance'
  )),
  statement TEXT NOT NULL,
  placeholders TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE market_optin_statement_catalog IS
  'Curated list of opt-in vendor agreement statements. Managers select from this catalog during market onboarding. v1 starter set: 15 statements seeded by migration 136.';

COMMENT ON COLUMN market_optin_statement_catalog.placeholders IS
  'Names of the {placeholder} tokens inside the statement that the manager fills in (e.g., {distance_miles}). Empty array if statement has no placeholders. Application substitutes at vendor-signup render time.';

-- Per-market selections --------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_optin_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  statement_id TEXT NOT NULL REFERENCES market_optin_statement_catalog(id) ON DELETE CASCADE,
  placeholder_values JSONB NOT NULL DEFAULT '{}',
  selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (market_id, statement_id)
);

COMMENT ON TABLE market_optin_selections IS
  'Per-market opt-in statement selections. Manager picks which statements apply to their market and fills in any placeholder values. Vendor acceptances (post-signup snapshots) live in a separate table that ships with Phase B.';

CREATE INDEX IF NOT EXISTS idx_market_optin_selections_market
  ON market_optin_selections(market_id);

-- Seed: 15 starter statements (from market_manager_optin_statements_v1.md) -----
-- ON CONFLICT DO NOTHING ensures re-running this migration is idempotent.
INSERT INTO market_optin_statement_catalog (id, category, statement, placeholders, sort_order)
VALUES
  ('producer-only', 'product_quality',
   'I produce, grow, or hand-craft all items I sell at this market. I do not resell items produced by others.',
   '{}', 10),
  ('local-sourcing', 'product_quality',
   'All raw ingredients or materials I use are sourced within {distance_miles} miles of this market, except where specifically noted on the item.',
   ARRAY['distance_miles'], 20),
  ('accurate-pricing', 'product_quality',
   'I will display prices clearly on every item or signage at my booth, and I will honor the displayed price for any sale during the market session.',
   '{}', 30),
  ('setup-teardown', 'conduct',
   'I will have my booth fully set up by {setup_complete_time} and will not begin tearing down before {teardown_earliest_time}, regardless of sales activity or weather.',
   ARRAY['setup_complete_time', 'teardown_earliest_time'], 40),
  ('booth-assignment', 'conduct',
   'I will set up only in the booth space assigned to me by market staff. I will not occupy adjacent spaces or expand beyond my assigned footprint without prior approval.',
   '{}', 50),
  ('professional-conduct', 'conduct',
   'I will treat market staff, fellow vendors, and shoppers with respect. I will not engage in confrontational behavior, disparage other vendors, or attempt to undercut neighboring vendors'' pricing during the market session.',
   '{}', 60),
  ('liability-insurance', 'insurance',
   'I maintain a current general liability insurance policy with coverage of at least {coverage_amount}, and I will provide a Certificate of Insurance naming this market as additional insured upon request.',
   ARRAY['coverage_amount'], 70),
  ('vendor-risk', 'insurance',
   'I understand that I am responsible for my own equipment, inventory, and personal property at the market, and that the market is not liable for damage, theft, or loss.',
   '{}', 80),
  ('indemnification', 'insurance',
   'I agree to indemnify and hold harmless the market and its operators from any claim, damage, or liability arising from the products I sell or my conduct at the market.',
   '{}', 90),
  ('booth-fee-nonrefundable', 'fees',
   'I understand booth fees are non-refundable, except in the case of market cancellation by market management. Cancellations by the vendor with at least {notice_days} days'' notice may be eligible for a credit toward a future market session at the manager''s discretion.',
   ARRAY['notice_days'], 100),
  ('no-show-forfeiture', 'fees',
   'If I fail to arrive at the market without prior cancellation, my booth fee is forfeit and I may be denied future booth reservations until the situation is resolved with market staff.',
   '{}', 110),
  ('vendor-sales-tax', 'fees',
   'I am responsible for collecting and remitting any applicable sales tax on items I sell at this market, and I will provide market staff with my sales tax permit number upon request.',
   '{}', 120),
  ('health-permits', 'compliance',
   'I hold all health department permits required for the products I sell at this market, and I will provide copies upon request. I will notify the market manager immediately if any required permit is suspended, revoked, or lapsed.',
   '{}', 130),
  ('food-safety', 'compliance',
   'I follow all applicable food safety guidelines for my product type, including temperature control, hand-washing, sample-handling, and cross-contamination prevention. I will keep food safety equipment (gloves, sanitizer, thermometers) available at my booth.',
   '{}', 140),
  ('prohibited-items', 'compliance',
   'I will not sell or display any items prohibited at this market, including alcohol, tobacco products, firearms, recalled or unsafe products, or items not produced by me. I understand that listing or selling prohibited items may result in immediate removal from the market and forfeiture of fees paid.',
   '{}', 150)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
