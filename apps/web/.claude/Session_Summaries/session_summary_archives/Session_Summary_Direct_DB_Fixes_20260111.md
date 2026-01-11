# Session Summary - Direct Database Fixes (Chet & Tracy)

**Date:** January 10-11, 2026  
**Type:** Direct SQL fixes via Supabase SQL Editor  
**Purpose:** Document database changes made outside of CC build sessions

---

## Overview

During planning and testing coordination between Chet (Claude Chat) and Tracy, several database issues were discovered and fixed directly via Supabase SQL Editor. These fixes were applied to both Dev and Staging databases.

---

## Fix 1: Function Schema Prefixes

### Problem
All functions had `search_path = ''` for security, but referenced tables without `public.` prefix, causing "relation does not exist" errors.

### Functions Fixed (13 total)

| Function | Change |
|----------|--------|
| track_vendor_status_change | Added `public.` prefix to all tables |
| get_listing_fields | Added `public.` prefix |
| get_vendor_fields | Added `public.` prefix |
| get_vertical_config | Added `public.` prefix |
| has_role (user_role) | Added `public.` prefix |
| has_role (text) | Added `public.` prefix |
| get_user_vendor_ids | Added `public.` prefix, fixed join |
| user_owns_vendor | Added `public.` prefix, fixed join |
| notify_transaction_status_change | Added `public.` prefix |
| get_vendor_order_ids | Added `public.` prefix (CC's function) |
| get_buyer_order_ids | Added `public.` prefix (CC's function) |
| is_admin | Added explicit cast `'admin'::public.user_role` |
| is_verifier | Added admin OR check |

### Additional Fixes
- Changed `auth.uid()` to `(select auth.uid())` for performance
- Fixed join pattern: `vp.user_id = up.user_id` (not `up.id`)
- Dropped obsolete `has_role(text, text[])` function

### Applied To
- Dev: ✅
- Staging: ✅

---

## Fix 2: audit_log Table Creation

### Problem
The `track_vendor_status_change` trigger referenced `audit_log` table that didn't exist in Dev.

### Solution
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

### Applied To
- Dev: ✅
- Staging: ✅ (already existed)

---

## Fix 3: Admin User Setup

### Problem
No admin user existed in the system.

### Solution
Created admin user jennifer@8fifteenconsulting.com in both environments.

**Dev Database:**
```sql
UPDATE public.user_profiles 
SET role = 'admin'::public.user_role
WHERE user_id = '3319a4d3-a7f2-4b3d-bf09-39148b48cd7f';

UPDATE public.user_profiles 
SET roles = array_append(roles, 'admin')
WHERE user_id = '3319a4d3-a7f2-4b3d-bf09-39148b48cd7f';
```

**Staging Database:**
```sql
-- First confirmed email manually in Supabase Auth
UPDATE public.user_profiles 
SET role = 'admin'::public.user_role
WHERE user_id = 'ad950165-9eb4-4044-84dc-b92d51566517';

UPDATE public.user_profiles 
SET roles = array_append(roles, 'admin')
WHERE user_id = 'ad950165-9eb4-4044-84dc-b92d51566517';
```

### Result
| Environment | Email | user_id | role | roles |
|-------------|-------|---------|------|-------|
| Dev | jennifer@8fifteenconsulting.com | 3319a4d3-... | admin | {buyer,admin} |
| Staging | jennifer@8fifteenconsulting.com | ad950165-... | admin | {buyer,admin} |

---

## Fix 4: audit_log Foreign Key Trigger Fix

### Problem
When approving vendors, error: "insert or update on table audit_log violates foreign key constraint audit_log_user_id_fkey"

### Root Cause
- `audit_log.user_id` references `user_profiles.id` (internal record ID)
- Trigger was inserting `user_profiles.user_id` (auth.uid())
- These are different UUIDs

### Solution
```sql
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
            up.id,  -- Changed from up.user_id to up.id (the FK target)
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
```

### Applied To
- Dev: ✅
- Staging: ✅

---

## Fix 5: Categories Config Update

### Problem
Categories in browse page didn't match create listing form.
- Config had: Produce, Meat, Dairy, Baked Goods, Prepared Foods, Other
- Test listings had: Produce, Preserves, Dairy
- "Preserves" wasn't in config

### Solution
```sql
UPDATE public.verticals
SET config = jsonb_set(
  config,
  '{listing_fields}',
  '[
    {"key":"booth_name","type":"text","label":"Booth Name","required":true},
    {"key":"product_categories","type":"multi_select","label":"Product Categories","options":["Produce","Meat","Dairy","Eggs","Baked Goods","Prepared Foods","Preserves","Honey","Plants","Crafts","Other"],"required":true},
    {"key":"products_overview","type":"textarea","label":"Products Offered","required":true},
    {"key":"price_level","type":"select","label":"Typical Price Level","options":["Budget","Mid","Premium"],"required":false},
    {"key":"pickup_notes","type":"textarea","label":"Pickup Instructions","required":false}
  ]'::jsonb
)
WHERE vertical_id = 'farmers_market';
```

### Applied To
- Dev: ✅
- Staging: ⏳ (needs to be run)

---

## Fix 6: Test Data Creation

### Test Vendor Approved
```sql
UPDATE vendor_profiles 
SET status = 'approved'
WHERE id = '4cb0f36c-efaf-47fc-9273-800b0af445ad';
```

### Test Listings Created
3 listings for StandardVendor (farmers_market):
- Fresh Tomatoes - $5.99 - Produce
- Local Honey - $12.99 - Preserves  
- Farm Fresh Eggs - $6.99 - Dairy

---

## Verification Queries

### Check Functions Have Correct Patterns
```sql
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

### Check Admin User
```sql
SELECT user_id, role, roles 
FROM public.user_profiles 
WHERE role = 'admin' OR 'admin' = ANY(roles);
```

---

## Notes for CC

1. **Do not recreate these functions** without the `public.` prefix
2. **Do not modify audit_log trigger** without understanding FK relationship
3. **Role checks must examine both** `role` (enum) AND `roles` (array)
4. **Categories config was expanded** - verify browse page pulls from config

---

## Outstanding Issues for Phase G

| Issue | Description | Status |
|-------|-------------|--------|
| User roles display | Admin/users shows 'user' for everyone | Needs fix |
| Browse categories source | Verify pulls from config, not distinct listings | Needs verification |
| Vendor notification on approval | Vendor should be notified when approved | Future |
| Active/inactive users | Track last_login, mark dormant after X weeks | Future |

---

*Summary created by Chet (Claude Chat) for coordination with CC (Claude Code)*
