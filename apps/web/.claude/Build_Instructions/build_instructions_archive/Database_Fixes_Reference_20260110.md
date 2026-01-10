# Database Fixes Applied - January 10, 2026

**Context:** These fixes were applied directly to Dev and Staging databases via Supabase SQL Editor BEFORE the Phase A build instructions were given to CC. Any CC work should preserve these changes.

---

## Issue 1: Functions Missing Schema Prefixes

### Problem
All functions had `search_path = ''` (empty) for security, but referenced tables without `public.` prefix. This caused "relation does not exist" errors.

### Functions Fixed (8 total)

All functions were updated to use `public.table_name` instead of just `table_name`:

```sql
-- 1. track_vendor_status_change
-- References: public.audit_log, public.user_profiles

-- 2. get_listing_fields  
-- References: public.verticals

-- 3. get_vendor_fields
-- References: public.verticals

-- 4. get_vertical_config
-- References: public.verticals

-- 5. has_role (user_role version)
-- References: public.user_profiles

-- 6. has_role (text, text[] version)
-- References: public.user_profiles

-- 7. get_user_vendor_ids
-- References: public.vendor_profiles, public.user_profiles, public.organizations

-- 8. user_owns_vendor
-- References: public.vendor_profiles, public.user_profiles, public.organizations

-- 9. notify_transaction_status_change
-- References: public.vendor_profiles, public.listings, public.notifications
```

### Verification Query
Run this to confirm all functions are fixed:
```sql
SELECT proname, 
       CASE WHEN prosrc LIKE '%public.%' THEN 'FIXED' ELSE 'NEEDS REVIEW' END as status
FROM pg_proc 
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'get_listing_fields',
    'get_vendor_fields', 
    'get_vertical_config',
    'has_role',
    'get_user_vendor_ids',
    'user_owns_vendor',
    'notify_transaction_status_change',
    'track_vendor_status_change'
  )
ORDER BY proname;
```

**Expected:** All should show "FIXED"

---

## Issue 2: RLS Performance Warnings (63 total)

### Problem
- `auth.uid()` was being re-evaluated per row (slow)
- Multiple permissive policies on same table/action (redundant evaluation)

### Fix Applied
1. Wrapped all `auth.uid()` calls in `(select auth.uid())` for single evaluation
2. Consolidated multiple SELECT policies into single policies with OR logic

### Tables Fixed
- user_profiles
- organizations  
- vendor_profiles
- transactions
- fulfillments
- notifications
- listings
- listing_images
- vendor_verifications
- verticals

### Verification
Check Supabase Dashboard → Database → Linter
Should show 0 performance warnings (was 63)

---

## Issue 3: Missing audit_log Table in Dev

### Problem
The `track_vendor_status_change` trigger referenced `audit_log` table, but it didn't exist in Dev database.

### Fix Applied
```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT,
  table_name TEXT,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Issue 4: Join Column Mismatch in Functions

### Problem
Some functions joined `vendor_profiles.user_id` to `user_profiles.id` instead of `user_profiles.user_id`.

### Correct Join Pattern
```sql
-- CORRECT:
vendor_profiles.user_id = user_profiles.user_id

-- WRONG:
vendor_profiles.user_id = user_profiles.id
```

### Data Model Reference
| Table | Column | Contains |
|-------|--------|----------|
| user_profiles | user_id | auth.uid() (UUID from auth.users) |
| user_profiles | id | Internal record ID (different UUID) |
| vendor_profiles | user_id | auth.uid() (matches user_profiles.user_id) |

---

## How to Verify Databases Are in Sync

Run on BOTH Dev and Staging:

```sql
-- Check all functions have public. prefix
SELECT proname, 
       CASE WHEN prosrc LIKE '%public.%' THEN 'OK' ELSE 'MISSING PREFIX' END as schema_prefix
FROM pg_proc 
WHERE pronamespace = 'public'::regnamespace
  AND prosrc LIKE '%FROM %'
ORDER BY proname;

-- Check audit_log exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_name = 'audit_log' AND table_schema = 'public'
) as audit_log_exists;

-- Check RLS policies use (select auth.uid())
SELECT policyname, 
       CASE WHEN qual LIKE '%(select auth.uid())%' OR qual LIKE '%( select auth.uid())%' 
            THEN 'OPTIMIZED' ELSE 'CHECK' END as auth_pattern
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

---

## Important for Future CC Sessions

If CC creates or modifies any database functions, ensure:

1. **All table references include `public.` prefix**
   ```sql
   -- CORRECT
   SELECT * FROM public.vendor_profiles WHERE ...
   
   -- WRONG (will fail with search_path = '')
   SELECT * FROM vendor_profiles WHERE ...
   ```

2. **Functions keep security settings**
   ```sql
   SECURITY DEFINER
   SET search_path = ''
   ```

3. **RLS policies use optimized auth pattern**
   ```sql
   -- CORRECT (evaluated once)
   WHERE user_id = (select auth.uid())
   
   -- WRONG (evaluated per row)
   WHERE user_id = auth.uid()
   ```

---

## Applied To
- **Dev Database:** ✅ All fixes applied
- **Staging Database:** ✅ All fixes applied
- **Date:** January 10, 2026
