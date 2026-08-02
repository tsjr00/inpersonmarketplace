-- ============================================================================
-- Migration 215: re-verify tax jurisdictions when a market's address changes
-- Date: 2026-08-01
-- ============================================================================
-- WHY
--
-- mig 214 stores a market's Texas taxing jurisdictions, resolved from its street
-- address. Nothing tied the two together: edit the address afterwards and the
-- stored jurisdictions silently keep describing the OLD location while still
-- carrying a "verified" timestamp. That is worse than having no data — it is
-- confidently wrong tax data, and it would be invisible until an audit.
--
-- Real triggers for this: a market relocates, an admin corrects a typo'd
-- address, or someone temporarily repoints a market while testing.
--
-- FIX: a BEFORE UPDATE trigger clears `tax_jurisdiction_verified_at` whenever
-- any address component changes. The jurisdictions themselves are DELIBERATELY
-- KEPT — they are a useful starting point for re-resolution, and silently
-- discarding an admin's work would be its own failure. Clearing only the stamp
-- makes the admin UI surface "address changed — re-verify" while preserving
-- what was there.
--
-- Trigger, not route-level validation, so it catches EVERY write path (admin
-- UI, /api/markets PATCH, manager edits, future routes, manual SQL) rather than
-- the one path we remembered to guard. Same pattern as mig 202's
-- clear_email_suppression_on_change.
--
-- Historical order rows are unaffected — they snapshot their own rates at sale
-- time (mig 214) and must never be retroactively changed.
--
-- ADDITIVE / NON-DESTRUCTIVE: no columns, no data change, one trigger.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION clear_tax_jurisdiction_verification_on_address_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- IS DISTINCT FROM so NULL→value and value→NULL both count as a change.
  IF NEW.address IS DISTINCT FROM OLD.address
     OR NEW.city  IS DISTINCT FROM OLD.city
     OR NEW.state IS DISTINCT FROM OLD.state
     OR NEW.zip   IS DISTINCT FROM OLD.zip
  THEN
    -- Only the stamp is cleared. tax_jurisdictions is preserved so the admin
    -- can compare/adjust rather than start from nothing.
    NEW.tax_jurisdiction_verified_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION clear_tax_jurisdiction_verification_on_address_change IS
  'Clears markets.tax_jurisdiction_verified_at when any address component changes, so stored tax jurisdictions can never silently describe a stale address (mig 215). Keeps tax_jurisdictions itself — the admin re-verifies rather than re-entering.';

DROP TRIGGER IF EXISTS trg_clear_tax_jurisdiction_verification ON public.markets;
CREATE TRIGGER trg_clear_tax_jurisdiction_verification
  BEFORE UPDATE OF address, city, state, zip ON public.markets
  FOR EACH ROW
  EXECUTE FUNCTION clear_tax_jurisdiction_verification_on_address_change();

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- VERIFICATION (run after applying)
-- ============================================================================
-- SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'public.markets'::regclass
--     AND tgname = 'trg_clear_tax_jurisdiction_verification';   -- expect 1 row
--
-- Functional check on a test market:
--   UPDATE markets SET tax_jurisdiction_verified_at = now() WHERE id = '<test>';
--   UPDATE markets SET city = city || ' X'            WHERE id = '<test>';
--   SELECT tax_jurisdiction_verified_at, tax_jurisdictions
--     FROM markets WHERE id = '<test>';
--   -- expect: verified_at NULL, tax_jurisdictions UNCHANGED. Then revert the city.
--
-- Non-address edits must NOT clear the stamp:
--   UPDATE markets SET tax_jurisdiction_verified_at = now() WHERE id = '<test>';
--   UPDATE markets SET name = name WHERE id = '<test>';
--   -- expect: verified_at still set (trigger is scoped to the 4 address columns).
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP TRIGGER IF EXISTS trg_clear_tax_jurisdiction_verification ON public.markets;
-- DROP FUNCTION IF EXISTS clear_tax_jurisdiction_verification_on_address_change();
-- NOTIFY pgrst, 'reload schema';
