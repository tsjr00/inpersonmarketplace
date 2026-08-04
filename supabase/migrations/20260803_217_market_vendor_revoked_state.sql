-- ============================================================================
-- Migration 217: Distinguish "revoked by the manager" from "never reviewed"
-- Date: 2026-08-03
-- ============================================================================
-- WHY
--
-- A manager revoked a vendor and the vendor immediately reappeared in the
-- dashboard's "pending your approval" list, reading as a bug.
--
-- It isn't a data bug — it's one boolean carrying two different meanings.
-- `market_vendors.approved` is the only approval state that exists, and
-- manager-dashboard-stats.ts counts `approved = false` as "pending your
-- approval". A vendor who was never reviewed and a vendor the manager
-- deliberately removed are therefore indistinguishable, so the dashboard invites
-- the manager to re-approve someone they just took off the market.
--
-- WHY NOT REUSE response_status
--
-- `market_vendors.response_status` ('invited'/'accepted'/'declined', mig 070) is
-- the VENDOR's answer to an event invitation. This is the MANAGER's decision
-- about the vendor. Opposite directions; overloading it would create the same
-- two-meanings-one-column problem this migration exists to fix.
--
-- WHY NOT REPLACE `approved` WITH A STATUS ENUM
--
-- `approved` is load-bearing across queries, RLS and dashboard stats. Swapping it
-- for a status column is a wide, risky refactor for no functional gain. Adding a
-- revocation timestamp alongside it is additive and reversible.
--
-- RESULTING STATES
--   approved = true                            → active at this market
--   approved = false AND revoked_at IS NULL     → pending (never reviewed)
--   approved = false AND revoked_at IS NOT NULL → revoked (reinstatable)
--
-- Re-approving CLEARS revoked_at, so a reinstated vendor is not permanently
-- marked. The manager keeps the option to reinstate at any time — the vendor row
-- is never deleted (schema-intent: this is a soft state, not a removal).
--
-- INERT ON ARRIVAL: both columns are nullable with no backfill. Every existing
-- row reads as it does today — approved, or pending. Nothing is retroactively
-- reclassified as revoked, because we cannot know which past rows were.
-- ============================================================================

BEGIN;

ALTER TABLE public.market_vendors
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.market_vendors.revoked_at IS
  'Set when a manager revokes a previously-approved vendor at this market. NULL + approved=false means never reviewed (pending); NOT NULL + approved=false means deliberately removed and excluded from the "pending your approval" count. Re-approving clears this back to NULL (mig 217).';
COMMENT ON COLUMN public.market_vendors.revoked_by IS
  'The manager/admin user who revoked. Audit only — cleared on re-approval alongside revoked_at (mig 217).';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- VERIFICATION (run after applying)
-- ============================================================================
-- 1) Columns exist:
--    SELECT column_name FROM information_schema.columns
--     WHERE table_name='market_vendors' AND column_name LIKE 'revoked%';  -- expect 2
-- 2) Nothing was reclassified — every existing row is still pending or approved:
--    SELECT COUNT(*) FROM market_vendors WHERE revoked_at IS NOT NULL;    -- expect 0
-- 3) State breakdown for a market:
--    SELECT approved, (revoked_at IS NOT NULL) AS revoked, COUNT(*)
--      FROM market_vendors WHERE market_id = '<market>' GROUP BY 1,2;
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- ALTER TABLE public.market_vendors
--   DROP COLUMN IF EXISTS revoked_at,
--   DROP COLUMN IF EXISTS revoked_by;
-- NOTIFY pgrst, 'reload schema';
