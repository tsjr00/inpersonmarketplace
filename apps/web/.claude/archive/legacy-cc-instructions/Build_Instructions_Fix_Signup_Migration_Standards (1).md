# Build Instructions - Fix Signup Error & Migration Standards

**Session Date:** January 5, 2026  
**Created by:** Chet (Claude Chat)  
**Folder:** .claude\Build_Instructions\  
**Priority:** CRITICAL - Blocks user registration

---

## Problem
Signup pages show "Database error saving new user" when trying to create account.

**Likely causes:**
1. User profile auto-create trigger missing or broken
2. Supabase Auth RLS policies not configured
3. Auth settings need configuration

---

## Part 1: Fix Signup Error

### Step 1: Check if Trigger Exists

**In Supabase SQL Editor (Dev):**

```sql
-- Check if trigger exists
SELECT 
  t.tgname as trigger_name,
  p.proname as function_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE t.tgrelid = 'auth.users'::regclass;
```

**Expected:** Should see trigger `on_auth_user_created` calling function `create_profile_for_user`

**If empty:** Trigger doesn't exist (proceed to Step 2)

### Step 2: Create User Profile Trigger

**This trigger auto-creates user_profiles entry when user signs up**

**Create migration file:** `supabase/migrations/20260105_HHMMSS_001_user_profile_trigger.sql`

**Full path:** `C:\FastWrks-Fireworks\BuildApp\supabase\migrations\20260105_HHMMSS_001_user_profile_trigger.sql`

**Replace HHMMSS with current time (e.g., 143022 for 2:30:22 PM)**

```sql
-- =============================================================================
-- Migration: Create user profile auto-generation trigger
-- =============================================================================
-- Created: 2026-01-05 HH:MM:SS CST (use actual time)
-- Author: Claude Code
-- 
-- Purpose:
-- Automatically creates a user_profiles entry when a new user signs up via
-- Supabase Auth. This ensures every authenticated user has a corresponding
-- profile in our public.user_profiles table.
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

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION create_profile_for_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_profiles (
    user_id,
    email,
    full_name,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_profile_for_user();

-- Add comment
COMMENT ON FUNCTION create_profile_for_user() IS 
'Automatically creates a user_profile record when a new user signs up via Supabase Auth';
```

**After creating file:**
1. Update MIGRATION_LOG.md with new entry (mark Dev as ❌, Staging as ❌)
2. Apply to Dev
3. Update migration file header with Dev date/time
4. Update MIGRATION_LOG.md (mark Dev as ✅ with timestamp)
5. Test
6. Apply to Staging
7. Update migration file header with Staging date/time
8. Update MIGRATION_LOG.md (mark Staging as ✅ with timestamp)

### Step 3: Configure RLS Policies for user_profiles

**Create migration file:** `supabase/migrations/20260105_HHMMSS_002_user_profiles_rls.sql`

**Full path:** `C:\FastWrks-Fireworks\BuildApp\supabase\migrations\20260105_HHMMSS_002_user_profiles_rls.sql`

**Use timestamp AFTER the previous migration (e.g., if trigger was 143022, use 143045 or later)**

```sql
-- =============================================================================
-- Migration: RLS policies for user_profiles table
-- =============================================================================
-- Created: 2026-01-05 HH:MM:SS CST (use actual time)
-- Author: Claude Code
-- 
-- Purpose:
-- Implements Row Level Security policies for user_profiles table to ensure:
-- - Users can read their own profile
-- - Users can update their own profile
-- - Service role can insert profiles (for trigger)
-- - Authenticated users can insert their own profile (fallback)
--
-- Dependencies:
-- Requires user_profiles table from 20260103_001_initial_schema.sql
--
-- Applied to:
-- [ ] Dev (vawpviatqalicckkqchs) - Date: ___________
-- [ ] Staging (vfknvsxfgcwqmlkuzhnq) - Date: ___________
--
-- Rollback:
-- DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
-- DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
-- DROP POLICY IF EXISTS "Service role can insert profiles" ON user_profiles;
-- DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
-- ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
-- =============================================================================

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own profile
CREATE POLICY "Users can read own profile"
ON user_profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
ON user_profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Allow trigger to insert (service role)
CREATE POLICY "Service role can insert profiles"
ON user_profiles
FOR INSERT
TO service_role
WITH CHECK (true);

-- Policy: Allow authenticated users to insert their own profile (if trigger fails)
CREATE POLICY "Users can insert own profile"
ON user_profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
```

**After creating file:**
1. Update MIGRATION_LOG.md with new entry
2. Follow same apply/update process as Step 2

### Step 4: Configure Supabase Auth Settings

**In Supabase Dashboard → Authentication → Settings:**

1. **Email Auth**
   - Enable: ✅ Enabled
   
2. **Email Confirmations**
   - For Dev: ❌ Disable (faster testing)
   - For Production: ✅ Enable later
   
3. **Site URL**
   - Dev: `http://localhost:3002`
   - Staging: `https://inpersonmarketplace.vercel.app`
   
4. **Redirect URLs** (Add these)
   ```
   http://localhost:3002/**
   https://inpersonmarketplace.vercel.app/**
   ```

5. **Email Templates** (optional for now)
   - Can customize later

### Step 5: Apply Migrations

**Apply to Dev:**
```bash
# In Supabase SQL Editor
# Run migration 001 (trigger)
# Run migration 002 (RLS policies)
```

**Apply to Staging:**
```bash
# Repeat same migrations in Staging SQL Editor
```

### Step 6: Test Signup Flow

**After migrations applied:**

1. **Visit:** http://localhost:3002/fireworks/signup
2. **Fill form:**
   - Full Name: Test User
   - Email: test@example.com
   - Password: test123
   - Confirm: test123
3. **Submit**
4. **Should:** Redirect to dashboard (no error)

**Verify in Supabase:**
```sql
-- Check user created
SELECT * FROM auth.users WHERE email = 'test@example.com';

-- Check profile auto-created
SELECT * FROM user_profiles WHERE email = 'test@example.com';
```

### Step 7: Debug if Still Failing

**If signup still fails, check:**

1. **Browser console** - any JavaScript errors?
2. **Network tab** - what's the API response?
3. **Supabase logs** - any database errors?

**Get detailed error:**

Update `src/app/[vertical]/signup/page.tsx`:

```typescript
// In handleSignup, after signup:
const { data, error } = await supabase.auth.signUp({...})

if (error) {
  console.error('Signup error details:', error)  // Add this
  setError(error.message)
  setLoading(false)
  return
}
```

---

## Part 2: Migration Standards & Tracking System

**CRITICAL: Read MIGRATION_STANDARDS.md before creating any migrations**

### First: Create Migration Tracking System

**Copy these files to project ROOT supabase folder:**
1. `MIGRATION_STANDARDS.md` → `C:\FastWrks-Fireworks\BuildApp\supabase\MIGRATION_STANDARDS.md`
2. `MIGRATION_LOG.md` → `C:\FastWrks-Fireworks\BuildApp\supabase\migrations\MIGRATION_LOG.md`

**These files are now REQUIRED references for all migration work**

**Note:** CC already writes migrations to `BuildApp\supabase\migrations\` (root level) - this is CORRECT for monorepos.

### Migration File Creation Standards

**CRITICAL: From now on, ALL database changes must be in migration files with timestamps.**

### Migration File Standards

#### File Naming Convention
```
supabase/migrations/YYYYMMDD_NNN_description.sql

Examples:
20260105_001_user_profile_trigger.sql
20260105_002_user_profiles_rls.sql
20260106_001_add_email_index.sql
```

#### File Template
```sql
-- Migration: [Short description]
-- Created: YYYY-MM-DD
-- Purpose: [Detailed explanation of what and why]

-- [SQL statements]

-- Comments for documentation
COMMENT ON [object] IS '[Description]';
```

#### File Location
```
apps/web/supabase/migrations/
```

### When to Create Migration Files

**Always create migration file for:**
- Creating/modifying tables
- Creating/modifying indexes
- Creating/modifying constraints
- Creating/modifying functions
- Creating/modifying triggers
- Creating/modifying RLS policies
- Updating configuration data (verticals table)
- ANY schema changes

**Never just show SQL on screen unless:**
- It's a temporary debugging query
- It's a one-time data check
- User specifically asks to see SQL first

### Migration Workflow

**Standard Process:**
1. **Create migration file** with proper naming
2. **Test in Dev** - apply via SQL Editor
3. **Verify results** - check tables/data
4. **Apply to Staging** - same SQL
5. **Document in session summary** - note migrations created

**Emergency/Quick Fix:**
1. Still create the file
2. Mark as "hotfix" in filename if needed
3. Document why it was rushed

### Example: Adding a New Index

**Bad (Don't do this):**
```
[Just shows SQL in session summary]
CREATE INDEX idx_listings_vendor ON listings(vendor_id);
```

**Good (Always do this):**
```
1. Create file: 20260105_003_add_listings_vendor_index.sql
2. File contains:
   -- Migration: Add index on listings.vendor_id
   -- Created: 2026-01-05
   -- Purpose: Improve query performance for vendor's listings lookup
   
   CREATE INDEX IF NOT EXISTS idx_listings_vendor 
   ON listings(vendor_id);
   
   COMMENT ON INDEX idx_listings_vendor IS 
   'Improves performance when fetching all listings for a vendor';

3. Apply to Dev
4. Test queries
5. Apply to Staging
6. Document in session summary
```

---

## Session Summary Requirements

When complete, create summary:

1. **Copy template from:** `.claude\Build_Instructions\Session_Summary_Template.md`
2. **Save as:** `.claude\Session_Summaries\Session_Summary_2026-01-05_Fix_Signup.md`

### Key Sections

**Migration Files Created:**
```
supabase/migrations/20260105_HHMMSS_001_user_profile_trigger.sql
  Purpose: Auto-create user profiles on signup
  Applied: ✅ Dev (YYYY-MM-DD HH:MM) | ✅ Staging (YYYY-MM-DD HH:MM)
  
supabase/migrations/20260105_HHMMSS_002_user_profiles_rls.sql
  Purpose: RLS policies for user_profiles
  Applied: ✅ Dev (YYYY-MM-DD HH:MM) | ✅ Staging (YYYY-MM-DD HH:MM)
```

**MIGRATION_LOG.md Status:**
- ✅ Updated with both new migrations
- ✅ All timestamps recorded
- ✅ Dev and Staging sync status confirmed

**Migration File Headers:**
- ✅ Both files have complete headers with timestamps
- ✅ "Applied to" sections updated with actual dates
- ✅ Rollback SQL included

**Tasks Completed:**
- [ ] Checked for existing trigger
- [ ] Created user profile trigger migration WITH TIMESTAMP
- [ ] Created RLS policies migration WITH TIMESTAMP
- [ ] Updated MIGRATION_LOG.md after each apply
- [ ] Updated migration file headers after each apply
- [ ] Applied migrations to Dev
- [ ] Applied migrations to Staging
- [ ] Configured Supabase Auth settings
- [ ] Tested signup flow (both verticals)
- [ ] Verified user profiles auto-created
- [ ] Confirmed MIGRATION_STANDARDS.md is in place

**Testing Results:**
- Signup works without errors
- User created in auth.users
- Profile auto-created in user_profiles
- Dashboard loads correctly
- Both verticals tested

**Migration Standards:**
- ✅ Confirmed understanding of timestamp requirement
- ✅ Confirmed understanding of header format requirement
- ✅ Confirmed understanding of MIGRATION_LOG.md requirement
- ✅ Will follow standards for all future migrations

**Next Steps:**
- Test multi-vertical signup (same user, different verticals)
- Add middleware for session management
- Configure password reset flow

---

## Important Notes

### Why Migrations Are Critical

**Without migration files:**
- ❌ Can't recreate database state
- ❌ Can't deploy to new environments
- ❌ Can't rollback changes
- ❌ Lose track of what changed when
- ❌ Team members can't sync database

**With migration files:**
- ✅ Complete audit trail
- ✅ Version control for database
- ✅ Easy deployment to new environments
- ✅ Can rollback if needed
- ✅ Documentation of changes

### Migration Best Practices

1. **One logical change per file**
   - Good: One migration for trigger
   - Bad: Trigger + indexes + policies all in one file

2. **Idempotent when possible**
   - Use `IF EXISTS` / `IF NOT EXISTS`
   - Safe to run multiple times

3. **Include comments**
   - Why this change?
   - What does it affect?
   - Any dependencies?

4. **Test before applying to Staging**
   - Always test in Dev first
   - Verify no errors
   - Check data integrity

---

## Troubleshooting

### If Trigger Doesn't Fire
- Check trigger exists: `SELECT * FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass`
- Check function exists: `SELECT * FROM pg_proc WHERE proname = 'create_profile_for_user'`
- Check function has SECURITY DEFINER (runs with creator's permissions)

### If RLS Blocks Insert
- Check policies: `SELECT * FROM pg_policies WHERE tablename = 'user_profiles'`
- Verify service_role policy exists
- Check if RLS is enabled: `SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'user_profiles'`

### If Supabase Auth Fails
- Check browser console for CORS errors
- Verify Site URL matches your localhost
- Check Redirect URLs include wildcard `/**`
- Verify email auth is enabled

---

**Estimated Time:** 1-2 hours (includes testing)  
**Complexity:** Medium (database + auth config)  
**Priority:** CRITICAL - Required for user registration
