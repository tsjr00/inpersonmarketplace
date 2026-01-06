# Build Instructions - Fix Form Submission & Validation

**Session Date:** January 4, 2026  
**Created by:** Chet (Claude Chat)  
**Folder:** .claude\Build_Instructions\  
**Priority:** CRITICAL - Blocks all vendor signups

---

## Problem Summary

Testing revealed three issues:
1. **CRITICAL:** Database constraint blocks all submissions
   - Error: "vendor_owner_check" constraint violation
   - Cause: Schema requires user_id OR organization_id
   - Impact: Cannot save any vendor signups
2. **Important:** Phone field accepts text input
3. **Minor:** Fireworks config has unwanted permit year checkboxes

---

## Tasks

### 1. Fix Database Constraint (CRITICAL)

**Problem:** Migration 001 created constraint requiring user_id OR organization_id:
```sql
CONSTRAINT vendor_owner_check 
CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL)
```

**Fix:** Create new migration to relax constraint temporarily

**Create:** `apps/web/supabase/migrations/20260104_001_allow_anonymous_vendors.sql`

```sql
-- Migration: Allow anonymous vendor signups (temporary until auth)
-- Created: 2026-01-04
-- Purpose: Remove vendor_owner_check to allow signups without user_id

-- Drop the existing constraint
ALTER TABLE vendor_profiles
DROP CONSTRAINT IF EXISTS vendor_owner_check;

-- Add comment explaining temporary state
COMMENT ON TABLE vendor_profiles IS 
'Vendor profile data. Note: user_id and organization_id are nullable temporarily 
to allow anonymous signups. When auth is implemented, profiles will be claimed 
by matching email addresses.';

-- Add index on email for future matching
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_email 
ON vendor_profiles ((profile_data->>'email'));

COMMENT ON INDEX idx_vendor_profiles_email IS 
'For matching anonymous profiles to user accounts on signup via email';
```

**Apply migration:**
```bash
# Apply to Dev
supabase db push --project-ref vawpviatqalicckkqchs

# Verify no errors

# Apply to Staging
supabase db push --project-ref vfknvsxfgcwqmlkuzhnq
```

**Alternative (if Supabase CLI unavailable):**
1. Open Supabase Dev dashboard → SQL Editor
2. Paste migration SQL
3. Run
4. Repeat for Staging dashboard

### 2. Add Phone Field Validation

**File:** `src/app/[vertical]/vendor-signup/page.tsx`

**Find the phone input rendering (likely in form field mapping):**

```typescript
// Current (accepts any text):
case 'phone':
  return (
    <input
      type="tel"  // Should be 'tel' not 'text'
      name={field.id}
      required={field.required}
    />
  )
```

**Update to:**
```typescript
case 'phone':
  return (
    <input
      type="tel"
      name={field.id}
      required={field.required}
      pattern="[0-9]{3}-?[0-9]{3}-?[0-9]{4}"
      title="Phone number format: 555-555-5555 or 5555555555"
      placeholder="555-555-5555"
    />
  )
```

**Additional improvements:**
- Add `inputMode="tel"` for mobile keyboards
- Consider formatting library like `react-phone-number-input` (future)

### 3. Remove Permit Year Checkboxes from Fireworks Config

**File:** `config/verticals/fireworks.json`

**Find and remove the permit_years field:**

```json
// REMOVE this field:
{
  "id": "permit_years",
  "label": "Permit Year(s)",
  "type": "multi_select",
  "options": [
    {"value": "2023", "label": "2023"},
    {"value": "2024", "label": "2024"},
    {"value": "2025", "label": "2025"}
  ],
  "required": false
}
```

**Why remove:**
- Not needed for initial signup
- Can be derived from permit document upload
- Adds unnecessary friction

**Note:** If this data is needed later, add to admin verification flow, not signup form

### 4. Update Database Seed Data (If Needed)

If you've already run migrations and need to update the seeded fireworks config in the database:

**Run in Supabase SQL Editor (Dev & Staging):**
```sql
-- Get current config
SELECT config_data FROM verticals WHERE vertical_id = 'fireworks';

-- If permit_years field exists in vendor_fields, update it
-- (Manual update - copy config, remove field, update)
```

**Or:** Re-run seed migration after updating fireworks.json

### 5. Add Form-Level Validation (Enhancement)

**File:** `src/app/[vertical]/vendor-signup/page.tsx`

**Add validation before submission:**

```typescript
const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault()
  
  const formData = new FormData(e.currentTarget)
  const data = Object.fromEntries(formData.entries())
  
  // Validate required fields
  const missingFields = vendorFields
    .filter(f => f.required && !data[f.id])
    .map(f => f.label)
  
  if (missingFields.length > 0) {
    alert(`Please fill in required fields: ${missingFields.join(', ')}`)
    return
  }
  
  // Validate email format
  const email = data.email as string
  if (email && !email.includes('@')) {
    alert('Please enter a valid email address')
    return
  }
  
  // Validate phone format (basic)
  const phone = data.phone as string
  if (phone && !/^\d{10}$|^\d{3}-\d{3}-\d{4}$/.test(phone)) {
    alert('Please enter a valid phone number (10 digits)')
    return
  }
  
  // Submit...
  try {
    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vertical, ...data })
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Submission failed')
    }
    
    alert('Signup successful!')
    e.currentTarget.reset()
  } catch (error) {
    console.error('Submission error:', error)
    alert(`Error: ${error.message}`)
  }
}
```

### 6. Test All Changes

**After applying fixes:**

1. **Restart dev server:**
```bash
npm run dev
```

2. **Test Fireworks Signup:**
   - Visit http://localhost:3002/fireworks/vendor-signup
   - Verify NO permit year checkboxes
   - Fill form with valid data
   - Submit
   - Should succeed

3. **Test Phone Validation:**
   - Try entering text in phone field
   - Should show validation error
   - Enter valid phone (5555555555)
   - Should accept

4. **Test Farmers Market:**
   - Visit http://localhost:3002/farmers_market/vendor-signup
   - Fill and submit
   - Should succeed

5. **Verify Database:**
   - Check Supabase Dev → vendor_profiles
   - Should see new test records

---

## Session Summary Requirements

When all tasks complete, create summary:

1. **Copy template from:** `.claude\Build_Instructions\Session_Summary_Template.md`
2. **Save as:** `.claude\Session_Summaries\Session_Summary_2026-01-04_Fix_Validation.md`

### Key Sections

**Tasks Completed:**
- [ ] Created migration to remove vendor_owner_check constraint
- [ ] Applied migration to Dev and Staging
- [ ] Added phone field validation (pattern, title, placeholder)
- [ ] Removed permit_years from fireworks.json
- [ ] Added form-level validation
- [ ] Tested both signup forms
- [ ] Verified submissions save to database

**Changes Made:**
- Migration file created
- fireworks.json updated
- Form validation added
- Any other code changes

**Testing & Verification:**
- Database constraint removed
- Phone validation working
- Fireworks form has no permit years
- Both forms submit successfully
- Records appear in Supabase

**Important Information:**
- Migration applied to both environments
- Database now accepts anonymous vendor profiles
- Email indexed for future user matching

**Next Steps:**
- Authentication implementation (Phase 2)
- Email matching logic for claiming profiles
- Additional field validations as needed

---

## Important Notes

### Why Remove Constraint Temporarily

**Temporary State:**
- Allows development/testing without auth
- Enables getting user feedback on signup flow
- Profiles can be "claimed" later via email matching

**When Auth Implemented:**
- New signups will have user_id automatically
- Existing profiles matched by email
- Can add constraint back if desired (not required with RLS)

### Security Consideration

**Without user_id:**
- Anyone can create vendor profiles
- No ownership until claimed
- RLS policies won't work yet (need user_id)

**Mitigation:**
- This is dev/staging only
- Will be fixed when auth implemented
- Don't go to production without auth

### Future Enhancement

When auth is ready, add endpoint to claim profiles:
```typescript
// POST /api/vendor/claim
// Matches email from vendor_profiles to current user
// Updates user_id on match
```

---

## Troubleshooting

### If Migration Fails
- Check constraint name matches (vendor_owner_check)
- Verify no existing data violates new rules
- Check Supabase logs for details

### If Phone Validation Too Strict
- Adjust pattern to accept more formats
- Consider international numbers
- May need library for comprehensive validation

### If Form Still Won't Submit
- Check browser console for errors
- Verify API endpoint returning proper response
- Check Supabase table permissions (RLS policies)

---

**Estimated Time:** 45-60 minutes  
**Complexity:** Medium  
**Priority:** CRITICAL - Required for any testing
