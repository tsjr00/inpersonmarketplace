-- Migration 137: Enable RLS on Market Manager v1 tables
--
-- Closes the security gap flagged by the Supabase advisor when migrations
-- 134/135/136 created tables without RLS. The application design intent
-- was always "service_role-only access" — the manager API routes use
-- createServiceClient() which bypasses RLS — but without RLS enabled,
-- anon and authenticated keys could query these tables directly via the
-- Supabase REST API, bypassing the application's isMarketManager() auth
-- check entirely.
--
-- Default-deny model: enable RLS, add NO policies. Result:
--   • service_role (manager API routes) → bypasses RLS, full access
--   • anon / authenticated keys → blocked from all reads/writes
--
-- This matches the design exactly. If/when Phase B introduces direct
-- client-side queries (e.g., co-branded vendor signup needing to read
-- selected statements without going through an API route), specific
-- policies can be added in a follow-up migration. For now there is no
-- such caller.
--
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY is idempotent — running it on
-- a table that already has RLS enabled is a no-op, no error.
--
-- Rollback: ALTER TABLE ... DISABLE ROW LEVEL SECURITY for each table.
-- Reverting puts the tables back into the warning-flagged state. Don't.

ALTER TABLE market_booth_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_booth_placeholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_optin_statement_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_optin_selections ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE market_booth_inventory IS
  'Per-market booth size tiers. Manager sets count + weekly_price_cents per size during onboarding. Booth assignment to vendors lives on market_vendors.booth_number. RLS enabled with no policies — service_role-only via the manager API routes.';

COMMENT ON TABLE market_booth_placeholders IS
  'Manager-tracked booth occupancy for vendors not on the platform. No vendor identity captured — just booth_number + optional size tier link. RLS enabled with no policies — service_role-only via the manager API routes.';

COMMENT ON TABLE market_optin_statement_catalog IS
  'Curated list of opt-in vendor agreement statements. Managers select from this catalog during market onboarding. v1 starter set: 15 statements seeded by migration 136. RLS enabled with no policies — read-only catalog served via the manager API.';

COMMENT ON TABLE market_optin_selections IS
  'Per-market opt-in statement selections. Manager picks which statements apply to their market and fills in any placeholder values. RLS enabled with no policies — service_role-only via the manager API routes.';

NOTIFY pgrst, 'reload schema';
