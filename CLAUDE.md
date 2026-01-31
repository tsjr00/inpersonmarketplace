# Claude Code Project Rules

## STOP - READ THIS FIRST

**Before fixing ANY error, you MUST:**
1. Create a TodoWrite with first item: "Query error_resolutions for similar issues"
2. Actually run the query below (or ask user to run it)
3. Review results before proposing ANY fix
4. Document your fix attempt in error_resolutions when done

**This is not optional. Skipping this step wastes time repeating failed approaches.**

---

## Error Resolution System - MANDATORY FIRST STEP

The `error_resolutions` table tracks all fix attempts and outcomes.

### STEP 1: Query Before Fixing (REQUIRED)
```sql
-- Run this FIRST for any error involving these keywords
SELECT error_code, attempted_fix, status, failure_reason, migration_file
FROM error_resolutions
WHERE
  attempted_fix ILIKE '%KEYWORD%'  -- Replace with: RLS, policy, recursion, column, schema, etc.
  OR error_code ILIKE '%KEYWORD%'
ORDER BY created_at DESC
LIMIT 20;
```

**If you cannot query the database directly, ask the user to run this query and share results.**

### AFTER Each Fix Attempt:
Document what was tried, whether it worked, and why:
```sql
INSERT INTO error_resolutions (
  error_code,
  attempted_fix,
  migration_file,
  code_changes,
  status,
  failure_reason,
  verification_method,
  created_by
) VALUES (
  'ERR_XXX_001',           -- Categorized error code
  'Description of fix',    -- What was attempted
  '20260130_007_xxx.sql',  -- Migration file if applicable
  'Summary of changes',    -- Code/policy changes made
  'verified',              -- 'pending', 'verified', 'failed', 'partial'
  NULL,                    -- Reason if failed
  'manual',                -- How it was verified
  'Claude'                 -- Who made the fix
);
```

### Error Code Categories:
- `ERR_RLS_XXX` - Row Level Security issues
- `ERR_PERF_XXX` - Performance warnings
- `ERR_SEC_XXX` - Security warnings
- `ERR_SCHEMA_XXX` - Schema/column issues
- `ERR_AUTH_XXX` - Authentication issues

### Why This Matters:
- Prevents repeating failed approaches
- Documents what works for specific error patterns
- Enables future developers (human or AI) to learn from past fixes

---

## RLS Policy Changes - MANDATORY PROCESS

Before ANY migration that touches RLS policies:

### 1. Audit Existing State
```bash
# List all policies created across all migrations
cd supabase/migrations && grep -h "CREATE POLICY" *.sql | sed 's/.*CREATE POLICY "\([^"]*\)".* ON.*\.\([a-z_]*\).*/\2: \1/' | sort | uniq -c | sort -rn
```

If a policy has been created multiple times, it indicates duplicates that need cleanup.

### 2. Check for Existing Policies on Target Tables
Before creating ANY policy, search migrations for existing policies on that table:
```bash
grep -l "public.TABLE_NAME" supabase/migrations/*.sql
```

### 3. Always DROP Before CREATE
Every `CREATE POLICY` must have a corresponding `DROP POLICY IF EXISTS` first.

### 4. Performance Rules
- ALWAYS use `(SELECT auth.uid())` instead of `auth.uid()`
- Use `SECURITY DEFINER` helper functions for complex checks to avoid recursion
- Minimize policies per table - use `FOR ALL` when the same logic applies

### 5. Avoid Recursion
- NEVER call `is_platform_admin()` in policies on `user_profiles` (causes recursion)
- Use `service_role` grants for admin operations instead of RLS policies
- Use `SECURITY DEFINER` helper functions that bypass RLS when querying RLS-protected tables

### 6. One Migration, Complete Fix
Don't create incremental policy fixes. If policies need fixing:
1. Audit ALL policies on ALL affected tables
2. Create ONE comprehensive migration that drops all and recreates correctly
3. Test thoroughly before committing

## Migration File Naming
Format: `YYYYMMDD_NNN_description.sql`
- Use sequential numbers (001, 002, etc.) within each day
- Keep descriptions short but meaningful

## Commit Messages for Migrations
Include:
- What tables are affected
- What issue is being fixed
- Co-author line for Claude

---

## New API Route Security Checklist - MANDATORY

Every new API route MUST have these elements. Check before committing:

### 1. Authentication
```typescript
const { data: { user }, error: authError } = await supabase.auth.getUser()
if (authError || !user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

### 2. Authorization
- Verify user owns the resource OR has appropriate role
- Use `src/lib/auth/admin.ts` for admin checks (centralized)
- NEVER use query params to bypass authorization (e.g., `?admin=true`)

### 3. Input Validation
- Validate all request body fields
- Check types, ranges, and formats
- Use Zod schemas for complex validation

### 4. Rate Limiting
Apply appropriate limits for sensitive operations:
- Account deletion: 3/hour
- Admin operations: 30/minute
- Auth endpoints: 5/minute
- Standard API: 60/minute

### 5. Service Client Rules
- NEVER use `createServiceClient()` without verified admin role
- Admin role must be verified from database, not query params
- Document why service client is needed

### 6. Error Tracing
- Wrap handlers in `withErrorTracing()`
- Use `traced.auth()`, `traced.validation()` for structured errors
- Include error codes following ERR_XXX_NNN pattern

---

## New Feature Pre-Merge Checklist

Before merging ANY feature:

### Security Review
- [ ] No debug endpoints in code (`/api/debug/*` must be deleted)
- [ ] Service role only used with verified admin role
- [ ] All new routes have authentication
- [ ] Input validation on all endpoints

### Performance Review
- [ ] Images use `next/image` for display (not raw `<img>`)
- [ ] Upload images use `image-resize.ts` for compression
- [ ] Database queries are batched (no N+1)
- [ ] Cache headers on public data endpoints

### Error Tracking Review
- [ ] New routes wrapped in `withErrorTracing()`
- [ ] Error codes added to ERR_XXX pattern
- [ ] Sensitive operations have rate limiting

### RLS Review (if touching database)
- [ ] Query error_resolutions for similar issues
- [ ] Check existing policies before creating new ones
- [ ] Use `(SELECT auth.uid())` not `auth.uid()`
- [ ] Test policies don't cause recursion

---

## Image Optimization Rules

**Two separate concerns - don't confuse them:**

### Upload Compression (saves storage)
- Use `src/lib/utils/image-resize.ts` in upload components
- Settings: 1200px max dimension, 80% JPEG quality
- Result: 1-2MB → 300-600KB
- Already implemented in: ListingImageUpload, MarketBoxImageUpload

### Display Optimization (saves bandwidth)
- Use `next/image` component, NOT raw `<img>` tags
- Provides: lazy loading, responsive sizing, WebP conversion
- Required on: browse pages, listing cards, market-box cards
```tsx
import Image from 'next/image'

<Image
  src={imageUrl}
  alt={description}
  width={280}
  height={200}
  loading="lazy"
/>
```

---

## SECURITY DEFINER Function Rules

All SECURITY DEFINER functions MUST include:
```sql
CREATE OR REPLACE FUNCTION function_name()
RETURNS ... AS $$
  -- function body
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

Without `SET search_path = public`, functions are vulnerable to search path injection attacks.
