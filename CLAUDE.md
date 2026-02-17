# Claude Code Project Rules

## STOP - READ THESE FILES FIRST

1. **This file (`CLAUDE.md`)** - Mandatory rules and processes
2. **`apps/web/.claude/current_task.md`** - CRITICAL: Current task context (if exists)
3. **`CLAUDE_CONTEXT.md`** - App overview, architecture, lessons learned
4. **`supabase/SCHEMA_SNAPSHOT.md`** - Current database schema (source of truth)

---

## Data-First Policy - NO ASSUMPTIONS

**CRITICAL: Never make assumptions when data is available.**

When you need information (schema, configuration, business rules, etc.):

1. **Hypothesize** - Where might this data live? (schema snapshot, config files, existing code)
2. **Look** - Actually read the file/query the source
3. **Confirm** - Verify you found the correct data
4. **Use** - Only then proceed with the actual data

### If Data Is NOT Available:
- **STOP** and ask the user before making any assumption
- Explicitly state: "I need to assume X because I cannot find this data. Is this acceptable?"
- Wait for confirmation before proceeding

### Why This Matters:
- Assumptions waste time and tokens when data exists
- Wrong assumptions cause bugs that cost business
- Example: Hard-coding 24hr cutoff when `cutoff_hours` column existed in the database

### Common Data Sources (check these first):
- `.claude/current_task.md` - Current session state and context
- `supabase/SCHEMA_SNAPSHOT.md` - Database structure (source of truth)
- Existing code in the same feature area
- Type definitions and interfaces
- API route implementations

### When to Verify vs When to Hypothesize

**The test:** Can I verify it with tools I already have, or with a single SQL query the user can run in their current context?

**ALWAYS verify (takes seconds to a minute):**
- Database schema → query or read schema snapshot
- Code/config in the repo → Read, Grep, Glob tools
- Error history → query error_resolutions table
- Existing data → SQL query user can paste and run

**Educated hypothesis OK (requires context-switching):**
- External dashboard logs (Stripe, Vercel, Supabase dashboard, etc.)
- Manual testing through UI flows
- Runtime behavior that requires deployment + testing
- Third-party API behavior

**When making a hypothesis:**
- State it clearly as a hypothesis, not a fact
- Explain the reasoning
- Note what would confirm or refute it

---

## CONTEXT PRESERVATION SYSTEM - CRITICAL

**Problem:** Conversation context gets summarized/compressed without warning. After compression, Claude loses access to detailed reasoning, decisions, and data that informed the current work. This causes repeated mistakes and inconsistent fixes.

**Solution:** Maintain a working document that persists across context compression.

### MANDATORY: Before Starting Multi-Step Tasks

If a task involves more than 2-3 steps, or requires referencing multiple data points:

1. **CREATE** `apps/web/.claude/current_task.md` with:
   ```markdown
   # Current Task: [Brief Title]
   Started: [Date]

   ## Goal
   [What we're trying to accomplish]

   ## Key Decisions Made
   - [Decision 1]: [WHY this decision was made]
   - [Decision 2]: [WHY]

   ## Critical Context (DO NOT FORGET)
   - [Important fact that must not be lost]
   - [Business rule or constraint]
   - [Technical detail that affects implementation]

   ## What's Been Completed
   - [ ] Step 1
   - [x] Step 2 (completed)

   ## What's Remaining
   - [ ] Next step
   - [ ] Final step

   ## Files Modified
   - `path/to/file.ts` - [what was changed]

   ## Gotchas / Watch Out For
   - [Thing that caused problems]
   - [Edge case to remember]
   ```

2. **UPDATE** this file AS YOU WORK, not at the end

3. **After context compression:** The system message will say "This session is being continued from a previous conversation." When you see this:
   - IMMEDIATELY read `apps/web/.claude/current_task.md`
   - Resume work using that context
   - Do NOT make assumptions about prior decisions
   - **MUST SAY TO USER**: "I've read current_task.md. Current task: [title]. Status: [X of Y items complete]. Key context: [1-2 critical points]." This confirms to the user you have the context.

4. **When task is complete:**
   - Archive important learnings to `CLAUDE_CONTEXT.md` or `error_resolutions` table
   - Delete or clear `current_task.md`

### Why This Exists
Claude has NO warning before context compression and NO memory after it happens. This file is the ONLY way to preserve critical context across compression events.

---

## Context Compaction Recovery Protocol

**After EVERY context compaction, before resuming work:**

### Step 1: Read Context Files
- [ ] Read `.claude/current_task.md` for session state
- [ ] Read `CLAUDE.md` for project rules
- [ ] Read `CLAUDE_CONTEXT.md` for architecture overview

### Step 2: Verify Schema Snapshot
- [ ] Check if schema changes were in progress before compaction
- [ ] If ANY database work was happening, ask user to run schema verification queries:
  ```sql
  -- Core tables
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name IN ('order_items', 'orders', 'cart_items')
  ORDER BY table_name, ordinal_position;
  ```
- [ ] Update `supabase/SCHEMA_SNAPSHOT.md` if discrepancies found

### Step 3: Update Schema Snapshot After Database Changes
**MANDATORY:** After ANY successful migration or schema change, do BOTH of these:

**A. Add changelog entry** (always — takes 30 seconds):
- Add a row to the Change Log table in `supabase/SCHEMA_SNAPSHOT.md`
- Include: date, migration file, what changed

**B. Regenerate structured tables** (required when migrations add/alter columns, tables, FKs, functions, or indexes):
- Ask user to run `supabase/REFRESH_SCHEMA.sql` in the Supabase SQL Editor
- User pastes results back
- Claude rebuilds the structured tables in `SCHEMA_SNAPSHOT.md`
- **DO NOT skip this step** — a changelog entry alone is NOT sufficient. The structured column/FK/index tables are what Claude actually reads when making decisions. Stale tables cause wrong assumptions and bugs.

**If user declines or defers the refresh:**
- Note in `current_task.md`: "Schema snapshot structured tables are STALE — last verified [date]"
- This ensures the next session knows to request a refresh

### Why This Matters:
- Schema snapshot is the LOCAL SOURCE OF TRUTH for database structure
- GitHub is our remote source but we need a local source to keep things fast
- Migration files may not reflect actual database state
- Interrupted sessions can leave documentation incomplete
- Future Claude sessions will make wrong decisions with stale data
- **Changelog entries without table regeneration caused 20+ gaps in Sessions 24-29**

---

## STOP - READ THIS NEXT

**Before fixing ANY error, you MUST:**
1. Create a TodoWrite with first item: "Query error_resolutions for similar issues"
2. Actually run the query below (or ask user to run it)
3. Review results before proposing ANY fix
4. Document your fix attempt in error_resolutions when done

**This is not optional. Skipping this step wastes time repeating failed approaches.**

---

## Error Resolution System - MANDATORY NEXT STEP

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

## Git & Deployment Workflow - STAGING FIRST

**CRITICAL: Never push directly to `origin/main` (production) without staging verification.**

### The Workflow

1. **Develop & commit** on `main` locally
2. **Merge main → `staging`**, push staging to origin
   ```bash
   git checkout staging && git merge main --no-edit && git push origin staging && git checkout main
   ```
3. **Wait for Vercel preview deployment** to complete
4. **User tests on staging URL** (`inpersonmarketplace-git-staging-...vercel.app`)
5. **Only after user confirms staging looks good:** push `main` to origin
   ```bash
   git push origin main
   ```

### Rules

- **NEVER `git push origin main`** without user confirming staging is verified
- After each commit, proactively ask: "Want me to push to staging for testing?"
- If multiple commits are batched, merge all to staging at once
- Staging deploys to Vercel Preview → Supabase Staging
- Production deploys to Vercel Production → Supabase Prod

### Environments

| Environment | Branch | URL | Supabase |
|-------------|--------|-----|----------|
| Dev | `main` (local) | localhost:3002 | Dev project |
| Staging | `staging` | Vercel Preview | Staging project |
| Production | `main` (origin) | farmersmarketing.app | Prod project |

---

## Migration File Naming
Format: `YYYYMMDD_NNN_description.sql`
- Use sequential numbers (001, 002, etc.) within each day
- Keep descriptions short but meaningful

## Commit Messages for Migrations
Include:
- What tables are affected
- What issue is being fixed
- Co-author line for Claude

## Migration File Management

### Applied Migrations Workflow

After a migration is confirmed applied to BOTH Dev AND Staging:

1. **User confirms:** "Migration [filename] applied to dev and staging"
2. **Claude updates `SCHEMA_SNAPSHOT.md`:** Ask user to run `supabase/REFRESH_SCHEMA.sql` and regenerate the structured tables. If user defers, note staleness in `current_task.md`.
3. **Claude moves the file:** `supabase/migrations/[file].sql` → `supabase/migrations/applied/[file].sql`
4. **Claude updates:** `MIGRATION_LOG.md` with ✅ status for both environments
5. **Claude commits:** With message describing what was applied

### Folder Structure
```
supabase/migrations/
├── applied/           # Confirmed applied to both Dev & Staging
│   ├── 20260103_001_initial_schema.sql
│   └── ...
├── MIGRATION_LOG.md   # Tracking log (always current)
├── README.md          # Migration standards
└── 20260205_004_new_feature.sql  # Pending migrations (not yet in both envs)
```

### Rules
- **Never move a migration** until user explicitly confirms both environments
- **Never delete migrations** - always move to applied/
- **Update MIGRATION_LOG.md** immediately when moving files
- If only applied to Dev (not Staging), leave in root folder with ✅ Dev / ❌ Staging in log

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

---

## Database Schema Reference - MANDATORY

### NEVER rely on migration files for schema information.
Migration files may not reflect the actual database state. The source of truth is the database itself.

### Schema Snapshot File
Location: `supabase/SCHEMA_SNAPSHOT.md`

This file contains the actual database schema including:
- All tables and columns
- Foreign key relationships
- RLS policies
- Indexes
- Functions
- Triggers
- Views

### Rules:

1. **Before ANY database/schema work:**
   - Read `supabase/SCHEMA_SNAPSHOT.md` first
   - If the file seems outdated or you need to verify, ask user to query the database

2. **After EVERY confirmed successful migration:**
   - **A. Add changelog entry** to `SCHEMA_SNAPSHOT.md` (date, migration file, what changed)
   - **B. Regenerate structured tables:** Ask user to run `supabase/REFRESH_SCHEMA.sql` in the SQL Editor, paste results back, then rebuild the structured tables in `SCHEMA_SNAPSHOT.md`
   - A changelog entry alone is NOT sufficient — the structured column/FK/index tables are what Claude reads when making decisions. Stale tables cause wrong assumptions and bugs.
   - If user defers the refresh, note in `current_task.md`: "Schema snapshot structured tables are STALE — last verified [date]"

3. **When in doubt, query the database:**
   Ask the user to run `supabase/REFRESH_SCHEMA.sql` (comprehensive) or these individual queries:
   ```sql
   -- Tables
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;

   -- Columns
   SELECT table_name, column_name, data_type, is_nullable
   FROM information_schema.columns WHERE table_schema = 'public'
   ORDER BY table_name, ordinal_position;

   -- Foreign Keys
   SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table
   FROM information_schema.table_constraints tc
   JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
   JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
   WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
   ```

4. **Deletion order for cleaning data:**
   Always reference `supabase/SCHEMA_SNAPSHOT.md` for foreign key relationships to determine correct deletion order. Never guess at table dependencies.
