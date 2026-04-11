-- Migration 115: Admins auto-grant buyer_tier = 'premium'
--
-- Admin accounts need to see new items as soon as they post, without the
-- early-access window that gates non-premium buyers. This migration sets
-- up a BEFORE INSERT OR UPDATE trigger that stamps buyer_tier = 'premium'
-- on any user_profiles row whose role or roles array includes an admin
-- role, and backfills existing admins.
--
-- Revocation handling: GRANT-ONLY. If an admin role is removed from a
-- user, their buyer_tier is NOT automatically dropped. This avoids
-- wiping legitimate paid premium state that might coexist with an
-- admin grant. If strict revocation is needed later, add a separate
-- AFTER UPDATE trigger that checks for role removal.
--
-- The trigger fires BEFORE INSERT OR UPDATE OF role, roles, buyer_tier
-- so it runs on:
--   - New user creation with admin role
--   - Role grant to existing user
--   - Any buyer_tier change by an admin (trigger re-asserts 'premium'
--     even if external code — e.g., Stripe webhooks — tries to change it)
-- It does NOT fire on updates to unrelated columns (display_name, etc).

CREATE OR REPLACE FUNCTION ensure_admin_premium_tier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- user_profiles.role is user_role (enum); user_profiles.roles is user_role[].
  -- Use native enum comparisons (cast string literals to user_role) and the
  -- array-overlap operator && to check if NEW.roles contains any admin role.
  -- NULL roles are NULL-safe: NULL && anything = NULL = falsy in IF context.
  IF NEW.role IN ('admin'::user_role, 'platform_admin'::user_role)
     OR NEW.roles && ARRAY['admin', 'platform_admin']::user_role[]
  THEN
    NEW.buyer_tier := 'premium';
    NEW.buyer_tier_expires_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_auto_premium_tier ON public.user_profiles;

CREATE TRIGGER trg_admin_auto_premium_tier
  BEFORE INSERT OR UPDATE OF role, roles, buyer_tier ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION ensure_admin_premium_tier();

-- Backfill existing admin accounts whose buyer_tier is not yet 'premium'.
-- This UPDATE fires the trigger above, which confirms 'premium' for each
-- row. Explicit SET also covers the case where the trigger sees a
-- non-admin-role change that wouldn't otherwise normalize the value.
UPDATE public.user_profiles
SET buyer_tier = 'premium',
    buyer_tier_expires_at = NULL
WHERE (
  role IN ('admin'::user_role, 'platform_admin'::user_role)
  OR roles && ARRAY['admin', 'platform_admin']::user_role[]
)
AND (buyer_tier IS NULL OR buyer_tier != 'premium');

-- Notify PostgREST to pick up any schema cache changes (no column changes
-- here, but trigger installation may still be cached).
NOTIFY pgrst, 'reload schema';
