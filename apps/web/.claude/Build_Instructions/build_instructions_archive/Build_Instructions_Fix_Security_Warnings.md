# Build Instructions - Fix Supabase Security Warnings

**Priority:** High - Security  
**Warnings:** 18 total

---

## Summary of Issues

1. **15 functions** missing `search_path` setting (SQL injection risk)
2. **2 RLS policies** too permissive (`WITH CHECK (true)`)
3. **1 auth setting** - leaked password protection disabled

---

## Part 1: Fix Function Search Paths

**Create migration:** `supabase/migrations/20260106_HHMMSS_001_fix_function_search_paths.sql`

```sql
-- =============================================================================
-- Migration: Fix function search_path security warnings
-- =============================================================================
-- Purpose: Set search_path to prevent SQL injection via schema manipulation
-- Applied to: [ ] Dev | [ ] Staging
-- =============================================================================

-- Fix all functions by setting search_path = ''
-- This forces fully qualified table names and prevents search_path attacks

ALTER FUNCTION public.create_profile_for_user() SET search_path = '';
ALTER FUNCTION public.track_vendor_status_change() SET search_path = '';
ALTER FUNCTION public.notify_transaction_status_change() SET search_path = '';
ALTER FUNCTION public.sync_verification_status() SET search_path = '';
ALTER FUNCTION public.get_vertical_config(text) SET search_path = '';
ALTER FUNCTION public.get_vendor_fields(text) SET search_path = '';
ALTER FUNCTION public.get_listing_fields(text) SET search_path = '';
ALTER FUNCTION public.user_owns_vendor(uuid) SET search_path = '';
ALTER FUNCTION public.has_role(text) SET search_path = '';
ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.is_admin() SET search_path = '';
ALTER FUNCTION public.is_verifier() SET search_path = '';
ALTER FUNCTION public.get_user_vendor_ids() SET search_path = '';
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
ALTER FUNCTION public.soft_delete() SET search_path = '';

-- Verify
DO $$
DECLARE
  unsafe_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unsafe_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proconfig IS NULL
    AND p.prokind = 'f';
  
  RAISE NOTICE 'Functions without search_path: %', unsafe_count;
END $$;
```

---

## Part 2: Fix RLS Policies

**Create migration:** `supabase/migrations/20260106_HHMMSS_002_fix_rls_policies.sql`

```sql
-- =============================================================================
-- Migration: Fix overly permissive RLS policies
-- =============================================================================
-- Purpose: Replace WITH CHECK (true) with proper conditions
-- Applied to: [ ] Dev | [ ] Staging
-- =============================================================================

-- Fix audit_log: Only service_role should insert
DROP POLICY IF EXISTS "System can insert audit entries" ON public.audit_log;

CREATE POLICY "Service role can insert audit entries"
ON public.audit_log
FOR INSERT
TO service_role
WITH CHECK (true);

-- Fix notifications: Only service_role or system should insert
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

CREATE POLICY "Service role can create notifications"
ON public.notifications
FOR INSERT
TO service_role
WITH CHECK (true);

-- Alternative: Allow authenticated users to create their own notifications
CREATE POLICY "Users can create own notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Verify
SELECT tablename, policyname, roles, cmd, with_check
FROM pg_policies
WHERE tablename IN ('audit_log', 'notifications');
```

---

## Part 3: Enable Leaked Password Protection

**In Supabase Dashboard (both Dev & Staging):**

1. Go to **Authentication** → **Settings**
2. Scroll to **Password Security**
3. Enable **"Leaked password protection"**
4. Save

This checks passwords against HaveIBeenPwned database.

---

## Apply Order

1. Run Part 1 migration (Dev)
2. Run Part 2 migration (Dev)
3. Enable leaked password protection (Dev)
4. Verify warnings cleared in Dev
5. Repeat for Staging

---

## Verification

After applying, re-run Supabase linter:
- Dashboard → Database → Linter
- Should show 0 security warnings

---

**Estimated time:** 15-20 minutes
