# Debug Instructions - Signup Error Investigation

**Priority:** CRITICAL - Blocks all user registration  
**Error:** "Database error saving new user"  
**Vertical:** Both fireworks and farmers_market affected

---

## Step 1: Add Detailed Error Logging to Signup

**Modify:** `src/app/[vertical]/signup/page.tsx`

**Find the handleSignup function and update error handling:**

```typescript
const handleSignup = async (e: React.FormEvent) => {
  e.preventDefault()
  setError('')
  setLoading(true)

  if (password !== confirmPassword) {
    setError('Passwords do not match')
    setLoading(false)
    return
  }

  if (password.length < 6) {
    setError('Password must be at least 6 characters')
    setLoading(false)
    return
  }

  console.log('=== SIGNUP ATTEMPT ===')
  console.log('Email:', email)
  console.log('Full Name:', fullName)
  console.log('Vertical:', vertical)

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        preferred_vertical: vertical,
      },
    },
  })

  console.log('=== SIGNUP RESPONSE ===')
  console.log('Data:', data)
  console.log('Error:', error)

  if (error) {
    console.error('=== SIGNUP ERROR DETAILS ===')
    console.error('Error message:', error.message)
    console.error('Error name:', error.name)
    console.error('Error status:', error.status)
    console.error('Full error object:', JSON.stringify(error, null, 2))
    
    setError(error.message)
    setLoading(false)
    return
  }

  if (data.user) {
    console.log('=== USER CREATED ===')
    console.log('User ID:', data.user.id)
    console.log('User email:', data.user.email)
    
    setSuccess(true)
    setTimeout(() => {
      router.push(`/${vertical}/dashboard`)
      router.refresh()
    }, 2000)
  }
}
```

---

## Step 2: Test Signup and Capture Console Output

**Actions:**
1. Restart dev server: `npm run dev`
2. Open browser DevTools (F12)
3. Go to Console tab
4. Visit: http://localhost:3002/fireworks/signup
5. Fill form with test data
6. Click Sign Up
7. **Copy ALL console output** (everything after "=== SIGNUP ATTEMPT ===")

**Report back:**
- Full console output
- Any red errors in console
- Exact error message shown

---

## Step 3: Check Browser Network Tab

**Actions:**
1. Open DevTools → Network tab
2. Click Sign Up
3. Find the POST request to Supabase
4. Click on it
5. Go to Response tab

**Report back:**
- HTTP status code
- Full response body
- Any error details in response

---

## Step 4: Verify Trigger Exists in Database

**In Supabase Dev SQL Editor, run:**

```sql
-- Check if trigger exists
SELECT 
  t.tgname as trigger_name,
  p.proname as function_name,
  t.tgenabled as enabled
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE t.tgrelid = 'auth.users'::regclass
  AND t.tgname = 'on_auth_user_created';
```

**Expected:** 1 row showing:
- trigger_name: on_auth_user_created
- function_name: create_profile_for_user
- enabled: O (meaning enabled)

**Report back:**
- Number of rows returned
- Exact values if row exists
- Screenshot if no rows

---

## Step 5: Test Trigger Function Manually

**In Supabase Dev SQL Editor, run:**

```sql
-- Test the function directly
DO $$
DECLARE
  test_user_id uuid := gen_random_uuid();
  test_email text := 'trigger-test@example.com';
BEGIN
  -- Try to insert into user_profiles manually
  INSERT INTO public.user_profiles (
    user_id,
    email,
    full_name,
    created_at,
    updated_at
  )
  VALUES (
    test_user_id,
    test_email,
    'Trigger Test User',
    NOW(),
    NOW()
  );
  
  RAISE NOTICE 'Insert successful for user_id: %', test_user_id;
  
  -- Clean up test data
  DELETE FROM public.user_profiles WHERE user_id = test_user_id;
  RAISE NOTICE 'Test data cleaned up';
END $$;
```

**Expected:** "Insert successful" message

**Report back:**
- Success or error message
- If error, exact error text

---

## Step 6: Check Function Definition

**In Supabase Dev SQL Editor, run:**

```sql
-- Get the actual function code
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'create_profile_for_user';
```

**Report back:**
- Does query return anything?
- If yes, paste the function definition
- If no, function doesn't exist

---

## Step 7: Check RLS Policies on user_profiles

**In Supabase Dev SQL Editor, run:**

```sql
-- Check RLS policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'user_profiles';
```

**Report back:**
- Number of policies found
- List of policy names
- Screenshot of results

---

## Step 8: Check if RLS is Blocking

**In Supabase Dev SQL Editor, run:**

```sql
-- Try to insert directly as service role
INSERT INTO public.user_profiles (
  user_id,
  email,
  full_name,
  created_at,
  updated_at
)
VALUES (
  gen_random_uuid(),
  'manual-test@example.com',
  'Manual Test User',
  NOW(),
  NOW()
)
RETURNING *;

-- Check if it was inserted
SELECT * FROM user_profiles WHERE email = 'manual-test@example.com';

-- Clean up
DELETE FROM user_profiles WHERE email = 'manual-test@example.com';
```

**Report back:**
- Did insert work?
- If error, exact error message
- Could you see the record?

---

## Step 9: Check Supabase Auth Configuration

**In Supabase Dashboard:**
1. Go to Authentication → Settings
2. Check Email Auth section

**Report back:**
- Is "Enable email provider" turned ON?
- Is "Confirm email" turned ON or OFF?
- What's the "Site URL"?
- What are the "Redirect URLs"?

---

## Step 10: Try Creating User via Supabase Dashboard

**In Supabase Dashboard:**
1. Go to Authentication → Users
2. Click "Add User"
3. Enter:
   - Email: dashboard-test@example.com
   - Password: test123test
4. Click Create

**Report back:**
- Did user get created?
- Check Table Editor → user_profiles
- Was profile auto-created?
- If no profile, trigger isn't firing

---

## Step 11: Check Migration Was Actually Applied

**In Supabase Dev SQL Editor, run:**

```sql
-- Check if migration created the objects we expect
SELECT 
  'Functions' as object_type,
  COUNT(*) as count
FROM pg_proc
WHERE proname = 'create_profile_for_user'

UNION ALL

SELECT 
  'Triggers',
  COUNT(*)
FROM pg_trigger
WHERE tgname = 'on_auth_user_created'

UNION ALL

SELECT
  'RLS Policies',
  COUNT(*)
FROM pg_policies
WHERE tablename = 'user_profiles';
```

**Expected:**
- Functions: 1
- Triggers: 1
- RLS Policies: 4

**Report back:**
- Actual counts
- Any that show 0

---

## Step 12: Check Migration Log

**Check file:** `C:\FastWrks-Fireworks\BuildApp\supabase\migrations\MIGRATION_LOG.md`

**Report back:**
- Status for 20260105_*_user_profile_trigger.sql
- Status for 20260105_*_user_profiles_rls.sql
- Are both marked as ✅ for Dev?
- What are the timestamps?

---

## Step 13: Compare Dev and Staging

**If Dev is marked as applied, check if objects exist:**

**In Supabase Dev SQL Editor:**
```sql
-- Quick check
SELECT 
  'user_profiles table exists' as check_name,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'user_profiles') as result
UNION ALL
SELECT 
  'trigger function exists',
  EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'create_profile_for_user')
UNION ALL
SELECT
  'trigger exists',
  EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created');
```

**Expected:** All should return `true`

**Report back:**
- Which ones return true/false
- If any are false, that's the problem

---

## Priority Order for Investigation

**Do these steps in order:**
1. Step 1 & 2: Add logging and capture console output (MOST IMPORTANT)
2. Step 3: Check Network tab response
3. Step 4: Verify trigger exists
4. Step 5: Test trigger manually
5. Step 6: Check function definition
6. Step 7: Check RLS policies
7. Step 8: Test manual insert
8. Step 13: Compare objects that should exist

**Stop after finding the problem - report immediately**

---

## What I'm Looking For

### Most Likely Issues:

**Issue 1: Trigger doesn't exist**
- Step 4 returns 0 rows
- Solution: Re-run migration

**Issue 2: Function doesn't exist**
- Step 6 returns nothing
- Solution: Re-run migration

**Issue 3: RLS blocking insert**
- Step 8 fails with permission error
- Solution: Fix RLS policies

**Issue 4: Wrong Supabase project**
- .env.local points to different project
- Solution: Update environment variable

**Issue 5: Email confirmation required**
- Step 9 shows "Confirm email" is ON
- User created but can't login until confirmed
- Solution: Turn off for dev

---

## Expected Findings

**If migrations worked correctly:**
- ✅ Trigger exists and is enabled
- ✅ Function exists with correct definition
- ✅ 4 RLS policies exist
- ✅ Manual insert works
- ✅ Console shows detailed error (not generic)

**If migrations didn't apply:**
- ❌ Trigger missing (Step 4 = 0 rows)
- ❌ Function missing (Step 6 = empty)
- ❌ Console shows generic error

---

## Reporting Template

**When reporting back, use this format:**

```
STEP 1-2 RESULTS:
Console output: [paste here]

STEP 3 RESULTS:
Network response: [paste here]

STEP 4 RESULTS:
Trigger exists: Yes/No
Details: [paste query results]

[Continue for each step you complete]
```

---

## Critical Notes

- Don't skip Step 1-2 (console logging) - this is most important
- Report back after EACH step that reveals a problem
- If Step 4 shows no trigger, STOP and report immediately
- Take screenshots if queries return unexpected results
- Copy full error messages, not summaries

---

**Start with Step 1-2 and report console output before proceeding further.**
