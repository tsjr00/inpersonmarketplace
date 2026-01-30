# Claude Code Project Rules

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
