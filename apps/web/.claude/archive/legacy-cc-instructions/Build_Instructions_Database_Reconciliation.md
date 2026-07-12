# Build Instructions - Database Reconciliation

**Date:** January 10, 2026  
**Priority:** Critical - Must complete before any other work  
**Run on:** Dev first, then Staging

---

## Background

Earlier today, Chet applied direct database fixes for:
- Adding `public.` prefix to all function table references
- Wrapping `auth.uid()` in `(select auth.uid())` for performance
- Creating audit_log table
- Fixing join patterns

Phase A work may have overwritten some of these. This reconciliation ensures all functions follow the correct patterns.

---

## Required Patterns (All Functions Must Follow)

```sql
-- Pattern 1: Schema prefix on ALL table references
FROM public.table_name  -- CORRECT
FROM table_name         -- WRONG

-- Pattern 2: Optimized auth call
WHERE user_id = (select auth.uid())  -- CORRECT (evaluated once)
WHERE user_id = auth.uid()           -- WRONG (evaluated per row)

-- Pattern 3: Security settings
SECURITY DEFINER
SET search_path = ''
```

---

## Part 1: Fix All Functions

Run this COMPLETE SQL block in Dev, then Staging:

```sql
-- =============================================================================
-- DATABASE RECONCILIATION - January 10, 2026
-- Run on: Dev first, then Staging
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. has_role (user_role enum version)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(check_role user_role)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_id = (select auth.uid())
        AND role = check_role
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. has_role (text version - for compatibility)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(check_role text)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN public.has_role(check_role::user_role);
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. is_admin
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN public.has_role('admin'::user_role);
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. is_verifier
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_verifier()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN public.has_role('verifier'::user_role);
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. get_user_vendor_ids
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_vendor_ids()
RETURNS SETOF UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT vp.id FROM public.vendor_profiles vp
    LEFT JOIN public.user_profiles up ON vp.user_id = up.user_id
    LEFT JOIN public.organizations o ON vp.organization_id = o.id
    WHERE up.user_id = (select auth.uid())
       OR o.owner_user_id = (SELECT user_id FROM public.user_profiles WHERE user_id = (select auth.uid()));
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. user_owns_vendor
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_owns_vendor(vendor_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.vendor_profiles vp
        LEFT JOIN public.user_profiles up ON vp.user_id = up.user_id
        LEFT JOIN public.organizations o ON vp.organization_id = o.id
        WHERE vp.id = vendor_id
        AND (
            up.user_id = (select auth.uid())
            OR o.owner_user_id = (SELECT user_id FROM public.user_profiles WHERE user_id = (select auth.uid()))
        )
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. get_vendor_order_ids (CC's new function - needs optimization)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_vendor_order_ids()
RETURNS SETOF UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT oi.order_id
    FROM public.order_items oi
    JOIN public.listings l ON oi.listing_id = l.id
    JOIN public.vendor_profiles vp ON l.vendor_profile_id = vp.id
    WHERE vp.user_id = (select auth.uid());
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. get_buyer_order_ids (CC's new function - needs optimization)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_buyer_order_ids()
RETURNS SETOF UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT id FROM public.orders
    WHERE buyer_user_id = (select auth.uid());
END;
$$;

-- -----------------------------------------------------------------------------
-- 9. track_vendor_status_change
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.track_vendor_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO public.audit_log (
            user_id,
            action,
            table_name,
            record_id,
            old_data,
            new_data
        )
        SELECT
            up.user_id,
            'vendor_status_change',
            'vendor_profiles',
            NEW.id,
            jsonb_build_object('status', OLD.status),
            jsonb_build_object('status', NEW.status)
        FROM public.user_profiles up
        WHERE up.user_id = (select auth.uid());
    END IF;
    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 10. notify_transaction_status_change
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_transaction_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_buyer_user_id UUID;
    v_vendor_user_id UUID;
    v_listing_name TEXT;
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        v_buyer_user_id := NEW.buyer_user_id;

        SELECT vp.user_id INTO v_vendor_user_id
        FROM public.vendor_profiles vp
        WHERE vp.id = NEW.vendor_profile_id;

        SELECT l.listing_data->>'stand_name' INTO v_listing_name
        FROM public.listings l
        WHERE l.id = NEW.listing_id;

        IF v_listing_name IS NULL THEN
            SELECT l.listing_data->>'booth_name' INTO v_listing_name
            FROM public.listings l
            WHERE l.id = NEW.listing_id;
        END IF;

        IF v_buyer_user_id IS NOT NULL THEN
            INSERT INTO public.notifications (user_id, type, title, message, data)
            VALUES (
                v_buyer_user_id,
                'transaction_update',
                'Transaction Updated',
                'Your transaction status changed to: ' || NEW.status,
                jsonb_build_object(
                    'transaction_id', NEW.id,
                    'old_status', OLD.status,
                    'new_status', NEW.status,
                    'listing_name', v_listing_name
                )
            );
        END IF;

        IF NEW.status = 'initiated' AND v_vendor_user_id IS NOT NULL THEN
            INSERT INTO public.notifications (user_id, type, title, message, data)
            VALUES (
                v_vendor_user_id,
                'new_transaction',
                'New Reservation Request',
                'You have a new reservation request',
                jsonb_build_object(
                    'transaction_id', NEW.id,
                    'listing_name', v_listing_name
                )
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 11. get_listing_fields
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_listing_fields(v_id TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT config->'listing_fields'
    FROM public.verticals
    WHERE vertical_id = v_id AND is_active = true;
$$;

-- -----------------------------------------------------------------------------
-- 12. get_vendor_fields
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_vendor_fields(v_id TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT config->'vendor_fields'
    FROM public.verticals
    WHERE vertical_id = v_id AND is_active = true;
$$;

-- -----------------------------------------------------------------------------
-- 13. get_vertical_config
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_vertical_config(v_id TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT config FROM public.verticals WHERE vertical_id = v_id AND is_active = true;
$$;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

SELECT 'Functions Check' as check_type;
SELECT proname, 
       CASE WHEN prosrc LIKE '%public.%' THEN 'OK' ELSE 'MISSING PREFIX' END as has_prefix,
       CASE WHEN prosrc LIKE '%(select auth.uid())%' OR prosrc NOT LIKE '%auth.uid()%' 
            THEN 'OK' ELSE 'NEEDS OPTIMIZATION' END as auth_optimized
FROM pg_proc 
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'has_role', 'is_admin', 'is_verifier',
    'get_user_vendor_ids', 'user_owns_vendor',
    'get_vendor_order_ids', 'get_buyer_order_ids',
    'track_vendor_status_change', 'notify_transaction_status_change',
    'get_listing_fields', 'get_vendor_fields', 'get_vertical_config'
  )
ORDER BY proname;
```

---

## Part 2: Verify RLS Policies

After functions are fixed, check RLS policies:

```sql
SELECT 'RLS Policies Check' as check_type;
SELECT policyname, tablename,
       CASE WHEN qual LIKE '%(select auth.uid())%' 
            THEN 'OPTIMIZED' 
            WHEN qual LIKE '%auth.uid()%' THEN 'NEEDS OPTIMIZATION'
            ELSE 'NO AUTH CALL' END as status
FROM pg_policies 
WHERE schemaname = 'public'
  AND qual LIKE '%auth.uid()%'
ORDER BY status DESC, tablename, policyname;
```

If any show "NEEDS OPTIMIZATION", note them and we'll fix in Part 3.

---

## Part 3: Fix RLS Policies (If Needed)

Only run this section if Part 2 verification shows policies needing optimization.

For each policy showing "NEEDS OPTIMIZATION", the pattern is:

```sql
-- Example fix pattern:
DROP POLICY IF EXISTS "policy_name" ON public.table_name;
CREATE POLICY "policy_name" ON public.table_name
FOR [SELECT|INSERT|UPDATE|DELETE]
USING (
    -- Replace: auth.uid()
    -- With: (select auth.uid())
    user_id = (select auth.uid())
);
```

Report which policies need fixing and I'll generate the specific SQL.

---

## Expected Results

### Functions Verification
All should show:
| proname | has_prefix | auth_optimized |
|---------|------------|----------------|
| (all functions) | OK | OK |

### RLS Policies Verification
All should show either:
- `OPTIMIZED` - good
- `NO AUTH CALL` - fine (doesn't use auth)

None should show `NEEDS OPTIMIZATION`.

---

## After Completion

1. Run verification on Dev - confirm all OK
2. Run verification on Staging - confirm all OK
3. Test browse page: localhost:3002/farmers_market/browse
4. Test vendor listings: create and edit a listing
5. Test orders page: /farmers_market/vendor/dashboard/orders

---

## Commit (After Testing)

```bash
git add -A
git commit -m "Reconcile database functions - ensure schema prefixes and auth optimization

- Fix all 13 functions with public. prefix
- Optimize auth.uid() calls with (select auth.uid())
- Ensure SECURITY DEFINER and search_path = '' on all functions
- Align Dev and Staging databases"

git push origin main
```
