-- ============================================================================
-- Migration 178: neutralize FM verbiage in 7 UNIVERSAL opt-in statements
-- ============================================================================
-- Second wording pass (user-approved 2026-07-04, from FT staging testing).
-- Mig 176 reworded the 5 "booth" universals; these 7 still carried FM-flavored
-- nouns ("market staff", "the market", "at my booth", "market session",
-- "not produced by me"). Neutralize so they read for markets AND parks. IDs
-- unchanged (internal keys); statement text only. DATA-ONLY (no DDL).
--
-- Vendor acceptances snapshot text → already-accepted agreements unaffected;
-- only the menu shown to new signers changes. Forward copy-only (to revert,
-- re-apply mig 136 strings).
--
-- NOTE (vendor-sales-tax): neutralized to vendor-responsibility ONLY. The
-- "platform collects & remits sales tax on my behalf" language the user wants
-- is DEFERRED until the sales-tax module actually ships (currently backlog) —
-- claiming it now would be false. Tracked in the sales-tax readiness doc.
-- ============================================================================
-- Dependencies: mig 136 (rows), mig 175 (vertical_id), mig 176 (prior rewording).
-- ROLLBACK: re-apply the mig 136 original statement strings for these 7 ids.
-- ============================================================================

UPDATE market_optin_statement_catalog
SET statement = 'I will display prices clearly on every item or on signage at my space, and I will honor the displayed price for any sale during the day.'
WHERE id = 'accurate-pricing';

UPDATE market_optin_statement_catalog
SET statement = 'I will treat staff, fellow vendors, and customers with respect. I will not engage in confrontational behavior, disparage other vendors, or undercut neighboring vendors'' pricing during the day.'
WHERE id = 'professional-conduct';

UPDATE market_optin_statement_catalog
SET statement = 'I agree to indemnify and hold harmless the operator and the venue from any claim, damage, or liability arising from the products I sell or my conduct on site.'
WHERE id = 'indemnification';

UPDATE market_optin_statement_catalog
SET statement = 'I maintain a current general liability insurance policy with coverage of at least {coverage_amount}, and I will provide a Certificate of Insurance naming the operator as additional insured on request.'
WHERE id = 'liability-insurance';

UPDATE market_optin_statement_catalog
SET statement = 'I understand that I am responsible for my own equipment, inventory, and personal property on site, and that the operator is not liable for damage, theft, or loss.'
WHERE id = 'vendor-risk';

UPDATE market_optin_statement_catalog
SET statement = 'I will not sell or display any items prohibited at this location, including alcohol, tobacco, firearms, or recalled or unsafe products. I understand that listing or selling prohibited items may result in immediate removal and forfeiture of fees paid.'
WHERE id = 'prohibited-items';

UPDATE market_optin_statement_catalog
SET statement = 'I am responsible for collecting and remitting any applicable sales tax on items I sell, and I will provide the operator with my sales tax permit number on request.'
WHERE id = 'vendor-sales-tax';

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION: none of these 7 should contain "booth", "market staff",
-- "at my booth", or "market session":
-- SELECT id, statement FROM market_optin_statement_catalog
--   WHERE id IN ('accurate-pricing','professional-conduct','indemnification',
--     'liability-insurance','vendor-risk','prohibited-items','vendor-sales-tax');
-- ============================================================================
