-- ============================================================================
-- Migration 181: opt-in statement content pass (user-approved 2026-07-06)
-- ============================================================================
-- Third wording pass, from FT staging testing. DATA-ONLY (no DDL).
--
--   D1  professional-conduct — DROP the "undercut neighboring vendors' pricing"
--       clause. We don't dictate how vendors price against each other. Keep the
--       respect + no-confrontation + no-disparagement wording.
--
--   D2a prohibited-items — reframe as SALES/DISPLAY only (not possession). Drop
--       the explicit "alcohol, tobacco, firearms" enumeration (it read as a
--       possession/carry restriction and is irrelevant for food trucks). Now
--       keyed off what a vendor is legally permitted to SELL at the location,
--       plus recalled/unsafe products. Applies to EVERY vertical (universal).
--
--   D2b lawful-conduct — NEW universal statement: vendors conduct their business
--       lawfully per the city/county/state where the market/park operates.
--       Selectable in the manager's agreement-statements picker like any other
--       (NOT auto-applied / not mandatory). category='compliance', universal.
--
-- Vendor acceptances snapshot statement text at signup → already-accepted
-- agreements are unaffected; only the menu shown to new signers changes.
-- ============================================================================
-- Dependencies: mig 136 (rows), mig 175 (vertical_id column), mig 176/178
--   (prior rewording of these ids).
-- ROLLBACK:
--   UPDATE ... re-apply the mig 178 strings for professional-conduct + prohibited-items;
--   DELETE FROM market_optin_statement_catalog WHERE id = 'lawful-conduct';
-- ============================================================================

-- D1 — professional-conduct: drop the undercut-pricing clause.
UPDATE market_optin_statement_catalog
SET statement = 'I will treat staff, fellow vendors, and customers with respect. I will not engage in confrontational behavior or disparage other vendors during the day.'
WHERE id = 'professional-conduct';

-- D2a — prohibited-items: sales/display only, no possession, no firearms call-out.
UPDATE market_optin_statement_catalog
SET statement = 'I will not sell or display any items I am not legally permitted to sell at this location, including recalled or unsafe products. I understand that offering prohibited items for sale may result in immediate removal and forfeiture of fees paid.'
WHERE id = 'prohibited-items';

-- D2b — lawful-conduct: NEW universal (vertical_id NULL), selectable in the picker.
INSERT INTO market_optin_statement_catalog (id, category, statement, placeholders, vertical_id, sort_order)
VALUES
  ('lawful-conduct', 'compliance',
   'I will conduct my business lawfully and in compliance with all applicable city, county, and state laws and regulations while operating at this location.',
   '{}', NULL, 160)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION:
--   SELECT id, statement FROM market_optin_statement_catalog
--     WHERE id IN ('professional-conduct','prohibited-items','lawful-conduct');
--   -- professional-conduct must NOT contain "undercut"
--   -- prohibited-items must NOT contain "firearms"
--   -- lawful-conduct present, vertical_id IS NULL
-- ============================================================================
