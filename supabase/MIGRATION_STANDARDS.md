# Migration Versioning & Tracking Standards

**CRITICAL: Read this EVERY time you create or modify a migration**

---

## Migration File Naming with Timestamps

### Standard Format
```
supabase/migrations/YYYYMMDD_HHMMSS_NNN_description.sql
```

**Components:**
- `YYYYMMDD` - Date (e.g., 20260105)
- `HHMMSS` - Time in 24hr format (e.g., 143022 for 2:30:22 PM)
- `NNN` - Sequence number for same timestamp (001, 002, 003)
- `description` - Brief description with underscores

**Examples:**
```
20260105_143022_001_user_profile_trigger.sql
20260105_143045_002_user_profiles_rls.sql
20260105_150330_001_add_email_index.sql
```

### Why Include Timestamp?
- **Uniqueness:** No confusion between versions
- **Ordering:** Supabase applies in chronological order
- **Tracking:** Easy to see when migration was created
- **Debugging:** Know exactly which version is where

---

## Migration File Header (REQUIRED)

**Every migration file MUST start with this header:**

```sql
-- =============================================================================
-- Migration: [Brief description]
-- =============================================================================
-- Created: YYYY-MM-DD HH:MM:SS [Timezone]
-- Modified: YYYY-MM-DD HH:MM:SS [Timezone] (if applicable)
-- Author: Claude Code
-- 
-- Purpose:
-- [Detailed explanation of what this migration does and why]
--
-- Dependencies:
-- [List any migrations this depends on, or "None"]
--
-- Applied to:
-- [ ] Dev (vawpviatqalicckkqchs) - Date: ___________
-- [ ] Staging (vfknvsxfgcwqmlkuzhnq) - Date: ___________
--
-- Rollback:
-- [SQL to undo this migration if needed, or "N/A"]
-- =============================================================================
```

**Example:**
```sql
-- =============================================================================
-- Migration: Create user profile auto-generation trigger
-- =============================================================================
-- Created: 2026-01-05 14:30:22 CST
-- Author: Claude Code
-- 
-- Purpose:
-- Automatically creates a user_profiles entry when a new user signs up via
-- Supabase Auth. This ensures every authenticated user has a corresponding
-- profile in our public.user_profiles table.
--
-- Dependencies:
-- Requires user_profiles table from migration 20260103_001_initial_schema.sql
--
-- Applied to:
-- [ ] Dev (vawpviatqalicckkqchs) - Date: ___________
-- [ ] Staging (vfknvsxfgcwqmlkuzhnq) - Date: ___________
--
-- Rollback:
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP FUNCTION IF EXISTS create_profile_for_user();
-- =============================================================================

CREATE OR REPLACE FUNCTION create_profile_for_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Function body...
END;
$$;
```

---

## When Migration is Modified

**If you need to fix/update a migration:**

### Option A: Create New Migration (Preferred)
```
Original: 20260105_143022_001_user_profile_trigger.sql
Fix:      20260105_151500_001_fix_user_profile_trigger.sql
```

**In new file header:**
```sql
-- Purpose:
-- Fixes issue in 20260105_143022_001_user_profile_trigger.sql where...
-- This migration supersedes the previous version.
```

### Option B: Update Existing (Only if not yet applied to Staging)
```sql
-- Modified: 2026-01-05 15:15:00 CST
-- 
-- Changes:
-- - Fixed issue where full_name wasn't being pulled from metadata
-- - Added error handling for missing email
```

**Update filename timestamp:**
```
Old: 20260105_143022_001_user_profile_trigger.sql
New: 20260105_151500_001_user_profile_trigger.sql
```

**NEVER modify a migration that's already applied to Staging**

---

## Migration Tracking Log

**Create file:** `supabase/migrations/MIGRATION_LOG.md`

**CC must update this file with EVERY migration:**

```markdown
# Migration Application Log

## Legend
- ✅ Applied successfully
- ❌ Failed / Not yet applied
- 🔄 In progress
- ⚠️ Needs attention

---

## Current Status

| Migration File | Dev Status | Dev Date | Staging Status | Staging Date | Notes |
|----------------|------------|----------|----------------|--------------|-------|
| 20260103_001_initial_schema.sql | ✅ | 2026-01-03 | ✅ | 2026-01-03 | Initial tables |
| 20260103_002_rls_policies.sql | ✅ | 2026-01-03 | ✅ | 2026-01-03 | RLS policies |
| 20260103_003_functions_triggers.sql | ✅ | 2026-01-03 | ✅ | 2026-01-03 | Auto-update triggers |
| 20260103_004_seed_data.sql | ✅ | 2026-01-03 | ✅ | 2026-01-03 | Seed verticals |
| 20260104_001_allow_anonymous_vendors.sql | ✅ | 2026-01-04 | ✅ | 2026-01-04 | Remove constraint |
| 20260104_002_remove_permit_years.sql | ✅ | 2026-01-04 | ✅ | 2026-01-04 | Clean config |
| 20260104_003_vendor_vertical_constraint.sql | ✅ | 2026-01-05 | ✅ | 2026-01-05 | Unique constraint |

---

## Pending Migrations (Not Yet Applied)

| Migration File | Target Environments | Priority | Blocker |
|----------------|---------------------|----------|---------|
| [None currently] | - | - | - |

---

## Failed/Rolled Back Migrations

| Migration File | Environment | Date | Reason | Resolution |
|----------------|-------------|------|--------|------------|
| [None yet] | - | - | - | - |

---

## Notes
- Dev project: vawpviatqalicckkqchs (InPersonMarketplace)
- Staging project: vfknvsxfgcwqmlkuzhnq (InPersonMarketplace-Staging)
- Always apply to Dev first, test, then apply to Staging
- Update this log immediately after applying each migration
```

---

## Checking Migration Status in Supabase

### Method 1: Check Applied Migrations (Supabase CLI)
```bash
# If using Supabase CLI
supabase migration list --project-ref vawpviatqalicckkqchs
```

### Method 2: Visual Check in Dashboard
1. Go to Supabase Dashboard → SQL Editor
2. Click "History" or "Recent Queries"
3. Check timestamps on migration queries
4. Cross-reference with migration files

### Method 3: Query Migration Table (if exists)
```sql
-- Some Supabase projects track migrations in a table
SELECT * FROM supabase_migrations.schema_migrations 
ORDER BY version DESC;
```

### Method 4: Check Object Comments
```sql
-- Check comments on objects to see when created
SELECT 
  obj_description(oid) as comment,
  relname as table_name
FROM pg_class 
WHERE relkind = 'r' 
AND relnamespace = 'public'::regnamespace;
```

---

## Workflow: Creating New Migration

### Step 1: Generate Timestamp
```
Current time: 2026-01-05 15:30:45
Filename timestamp: 20260105_153045
```

### Step 2: Create File with Header
```sql
-- =============================================================================
-- Migration: [Your description]
-- =============================================================================
-- Created: 2026-01-05 15:30:45 CST
-- Author: Claude Code
-- [Rest of header...]
```

### Step 3: Write Migration SQL

### Step 4: Apply to Dev
- Open Supabase Dev SQL Editor
- Run migration
- Note exact timestamp when applied

### Step 5: Update Migration Log
```markdown
| 20260105_153045_001_description.sql | ✅ | 2026-01-05 15:35 | ❌ | - | Applied to Dev |
```

### Step 6: Update Migration File Header
```sql
-- Applied to:
-- [x] Dev (vawpviatqalicckkqchs) - Date: 2026-01-05 15:35
-- [ ] Staging (vfknvsxfgcwqmlkuzhnq) - Date: ___________
```

### Step 7: Test in Dev

### Step 8: Apply to Staging
- Open Supabase Staging SQL Editor
- Run SAME migration
- Note exact timestamp

### Step 9: Update Both Logs
**Migration file:**
```sql
-- Applied to:
-- [x] Dev (vawpviatqalicckkqchs) - Date: 2026-01-05 15:35
-- [x] Staging (vfknvsxfgcwqmlkuzhnq) - Date: 2026-01-05 15:42
```

**Migration log:**
```markdown
| 20260105_153045_001_description.sql | ✅ | 2026-01-05 15:35 | ✅ | 2026-01-05 15:42 | Complete |
```

---

## Rules for CC (MUST FOLLOW)

### Rule 1: Timestamp in Filename
**Every migration filename MUST include YYYYMMDD_HHMMSS**

### Rule 2: Header Required
**Every migration file MUST start with the standard header block**

### Rule 3: Update Migration Log
**MIGRATION_LOG.md MUST be updated with every migration**
- After applying to Dev
- After applying to Staging
- Document any issues

### Rule 4: Mark Applied in File
**Update the "Applied to" checklist in the migration file header**
- Check box when applied
- Add exact date/time

### Rule 5: Never Modify Applied Migrations
**If migration is on Staging, create NEW migration to fix it**

### Rule 6: Document in Session Summary
**Every migration must be listed in session summary:**
```markdown
### Migration Files Created
```
supabase/migrations/20260105_153045_001_description.sql
  Purpose: [What it does]
  Applied: ✅ Dev (2026-01-05 15:35) | ✅ Staging (2026-01-05 15:42)
```
```

### Rule 7: Verify Before Proceeding
**Before creating new migration, check MIGRATION_LOG.md to see current state**

---

## Checking if Environments are Synced

**To verify Dev and Staging have same migrations:**

### Visual Check
```
1. Open MIGRATION_LOG.md
2. Scan "Dev Status" and "Staging Status" columns
3. All should show ✅ with similar dates
4. Any ❌ in Staging = environments not synced
```

### Database Check
```sql
-- In both Dev and Staging, run:
SELECT 
  tablename,
  obj_description((schemaname||'.'||tablename)::regclass) as comment
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Compare results between environments
-- Comments should match (they include migration info)
```

### Object Count Check
```sql
-- Count objects in both environments
SELECT 
  'Tables' as type, 
  COUNT(*) as count 
FROM pg_tables 
WHERE schemaname = 'public'
UNION ALL
SELECT 
  'Indexes', 
  COUNT(*) 
FROM pg_indexes 
WHERE schemaname = 'public'
UNION ALL
SELECT 
  'Functions', 
  COUNT(*) 
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public';

-- Counts should match between Dev and Staging
```

---

## Session Summary Requirements

**In every session summary, include:**

### Migration Status Section
```markdown
## Migration Status

### Migrations Created This Session
1. 20260105_153045_001_user_profile_trigger.sql
   - Purpose: Auto-create user profiles on signup
   - Applied: ✅ Dev | ✅ Staging
   
2. 20260105_154500_002_user_profiles_rls.sql
   - Purpose: RLS policies for user_profiles
   - Applied: ✅ Dev | ✅ Staging

### Environment Sync Status
- Dev and Staging: ✅ SYNCED (all migrations applied to both)
- Last verified: 2026-01-05 15:50

### Migration Log Updated
- MIGRATION_LOG.md updated with all new migrations
- All "Applied to" checkboxes marked in migration files
```

---

## Example: Complete Migration Lifecycle

### 1. Create Migration File
**Filename:** `20260105_153045_001_user_profile_trigger.sql`

```sql
-- =============================================================================
-- Migration: Create user profile auto-generation trigger
-- =============================================================================
-- Created: 2026-01-05 15:30:45 CST
-- Author: Claude Code
-- 
-- Purpose:
-- Automatically creates user_profiles entry when user signs up via Supabase Auth
--
-- Dependencies:
-- Requires user_profiles table from 20260103_001_initial_schema.sql
--
-- Applied to:
-- [ ] Dev (vawpviatqalicckkqchs) - Date: ___________
-- [ ] Staging (vfknvsxfgcwqmlkuzhnq) - Date: ___________
--
-- Rollback:
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP FUNCTION IF EXISTS create_profile_for_user();
-- =============================================================================

CREATE OR REPLACE FUNCTION create_profile_for_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_profile_for_user();
```

### 2. Apply to Dev
- Open Supabase Dev SQL Editor
- Run migration
- Success at 15:35

### 3. Update File
```sql
-- Applied to:
-- [x] Dev (vawpviatqalicckkqchs) - Date: 2026-01-05 15:35
-- [ ] Staging (vfknvsxfgcwqmlkuzhnq) - Date: ___________
```

### 4. Update Migration Log
```markdown
| 20260105_153045_001_user_profile_trigger.sql | ✅ | 2026-01-05 15:35 | ❌ | - | Dev only |
```

### 5. Test in Dev
- Verify trigger fires
- Check user_profiles created

### 6. Apply to Staging
- Open Supabase Staging SQL Editor
- Run same migration
- Success at 15:42

### 7. Update File (Final)
```sql
-- Applied to:
-- [x] Dev (vawpviatqalicckkqchs) - Date: 2026-01-05 15:35
-- [x] Staging (vfknvsxfgcwqmlkuzhnq) - Date: 2026-01-05 15:42
```

### 8. Update Migration Log (Final)
```markdown
| 20260105_153045_001_user_profile_trigger.sql | ✅ | 2026-01-05 15:35 | ✅ | 2026-01-05 15:42 | Complete |
```

### 9. Document in Session Summary
Include in session summary with all details

---

## CRITICAL REMINDERS

1. **Timestamp is not optional** - EVERY migration needs it
2. **Log is not optional** - MUST update MIGRATION_LOG.md
3. **Header is not optional** - Standard format required
4. **Apply to Dev first** - ALWAYS test before Staging
5. **Update both places** - Migration file AND log
6. **Never skip documentation** - Future you will thank you

---

**These standards are MANDATORY for all future migrations.**
