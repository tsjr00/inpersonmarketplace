# RLS Policy Workflow

**Loaded only when working on RLS policies.** Cross-references `apps/web/.claude/rules/verification-discipline.md` (schema gate) and `apps/web/docs/error-resolution-workflow.md` (query before fixing).

---

## RLS Policy Changes — Mandatory Process

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
- Minimize policies per table — use `FOR ALL` when the same logic applies

### 5. Avoid Recursion

- NEVER call `is_platform_admin()` in policies on `user_profiles` (causes recursion)
- Use `service_role` grants for admin operations instead of RLS policies
- Use `SECURITY DEFINER` helper functions that bypass RLS when querying RLS-protected tables

### 6. One Migration, Complete Fix

Don't create incremental policy fixes. If policies need fixing:

1. Audit ALL policies on ALL affected tables
2. Create ONE comprehensive migration that drops all and recreates correctly
3. Test thoroughly before committing

---

## SECURITY DEFINER Function Rules

All `SECURITY DEFINER` functions MUST include `SET search_path = public`:

```sql
CREATE OR REPLACE FUNCTION function_name()
RETURNS ... AS $$
  -- function body
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

Without `SET search_path = public`, functions are vulnerable to search path injection attacks.

---

## Default-Deny Pattern (Market Manager v1)

For tables that should only be accessible via service-role (no authenticated client access), enable RLS with NO policies:

```sql
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;
-- intentionally no CREATE POLICY statements
```

This default-denies everything except `service_role`. API routes that need to read/write must use `createServiceClient()` with auth verified upstream.

**Example:** Migration 137 enabled RLS on all 4 market manager tables with no policies. All API routes under `src/app/api/market-manager/` use service client. Server components that read these tables must also use service client (via `createServiceClient()`), with auth verified upstream by `isMarketManager()`.
