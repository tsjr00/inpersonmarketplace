# Build Instructions - Fix Vendor Signup Forms (URGENT)

**Session Date:** January 3, 2026  
**Created by:** Chet (Claude Chat)  
**Folder:** .claude\Build_Instructions\  
**Priority:** CRITICAL - Blocks all testing

---

## Problem Summary

Testing revealed vendor signup forms are broken:
- **Fireworks signup:** Loads but no form fields render (blank)
- **Farmers Market signup:** Runtime error / page crash
- **Homepage:** Works correctly (verticals load from database)

---

## Root Cause

Dynamic form component not compatible with new Supabase data structure. Likely issues:
1. API route `/api/vertical/[id]/route.ts` returns different format
2. Client component fetch logic broken
3. Form field rendering broken
4. Missing error handling

---

## Tasks

### 1. Debug API Route

**File:** `src/app/api/vertical/[id]/route.ts`

**Check:**
- Does it successfully query Supabase?
- What data structure is it returning?
- Is it returning the full vertical config JSON?
- Check console/network tab for errors

**Expected response format:**
```json
{
  "vertical_id": "fireworks",
  "name_public": "Fireworks Marketplace",
  "config_data": {
    "vendor_fields": [
      { "id": "business_name", "type": "text", ... },
      ...
    ],
    ...
  }
}
```

**Fix if needed:**
- Query should get `config_data` JSONB column
- Response should match what form component expects
- Add error handling and logging

### 2. Debug Dynamic Signup Page

**File:** `src/app/[vertical]/vendor-signup/page.tsx`

**Check:**
- Does `fetch(/api/vertical/${vertical})` work?
- What does the response data look like?
- Is form field array being extracted correctly?
- Are form fields rendering?

**Common issues:**
- Data path changed (e.g., `data.config_data.vendor_fields` vs `data.vendor_fields`)
- Missing null checks
- Async/await errors
- Component not re-rendering

**Add debugging:**
```typescript
console.log('Fetched vertical data:', data)
console.log('Vendor fields:', vendorFields)
```

### 3. Check Form Field Renderer

**In the same file, check the render logic:**

**Ensure:**
- `vendor_fields` array exists and has data
- Field types are being handled correctly
- All field type cases implemented (text, email, phone, etc.)
- Form state management working

### 4. Fix Data Structure Mismatch

**Most likely issue:** Database stores config differently than component expects

**Database structure (from migration):**
- `verticals` table has `config_data` JSONB column
- Contains full vertical JSON config

**Component expects:**
- Direct access to fields like `vendor_fields`
- May need to extract from `config_data.vendor_fields`

**Fix options:**

**Option A - Update API to flatten:**
```typescript
// In /api/vertical/[id]/route.ts
return NextResponse.json({
  ...vertical.config_data,  // Spread config_data to top level
  vertical_id: vertical.vertical_id,
  name_public: vertical.name_public
})
```

**Option B - Update component to handle nested:**
```typescript
// In [vertical]/vendor-signup/page.tsx
const vendorFields = data.config_data?.vendor_fields || []
```

### 5. Add Error Handling

**In dynamic signup page:**
```typescript
try {
  const res = await fetch(`/api/vertical/${vertical}`)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const data = await res.json()
  
  if (!data) {
    throw new Error('No data returned')
  }
  
  // Use data...
} catch (error) {
  console.error('Failed to load vertical:', error)
  return <div>Error loading marketplace configuration</div>
}
```

### 6. Test Each Fix

After each change:
```bash
# Restart dev server
npm run dev
```

**Test both:**
- http://localhost:3002/fireworks/vendor-signup
- http://localhost:3002/farmers_market/vendor-signup

**Expected:**
- Forms render with all fields
- No runtime errors
- Submit button functional (even if submit not fully working yet)

### 7. Delete Legacy Fireworks Page (Once Forms Work)

**After signup forms work:**
```
Delete: src/app/fireworks/vendor-signup/page.tsx
```

**Verify:** 
- `/fireworks/vendor-signup` still works (uses dynamic route)
- No references to deleted file

---

## Debugging Strategy

### Step-by-Step Debugging

1. **Check Network Tab:**
   - Open browser DevTools → Network
   - Visit signup page
   - Look for `/api/vertical/fireworks` request
   - Check response data structure

2. **Check Console:**
   - Open browser DevTools → Console
   - Look for errors
   - Add console.logs to see data flow

3. **Check Supabase:**
   - Open Supabase Dev dashboard
   - Go to Table Editor → `verticals`
   - Verify data exists
   - Check `config_data` JSONB structure

4. **Compare with Homepage:**
   - Homepage works and fetches verticals
   - Look at how homepage fetches data
   - Apply same pattern to signup page

### Most Likely Quick Fix

**If form fields not rendering:**

In `src/app/[vertical]/vendor-signup/page.tsx`, change:
```typescript
// FROM (might be this):
const vendorFields = data.vendor_fields || []

// TO (probably needs to be this):
const vendorFields = data.config_data?.vendor_fields || []
```

**If API not returning data:**

In `src/app/api/vertical/[id]/route.ts`, ensure:
```typescript
const vertical = await getVerticalById(params.id)

if (!vertical) {
  return NextResponse.json({ error: 'Vertical not found' }, { status: 404 })
}

// Return the config_data properly
return NextResponse.json({
  ...vertical.config_data,  // Spread to top level
  vertical_id: vertical.vertical_id,
  name_public: vertical.name_public
})
```

---

## Session Summary Requirements

When fixed, create summary:

1. **Copy template from:** `.claude\Build_Instructions\Session_Summary_Template.md`
2. **Save as:** `.claude\Session_Summaries\Session_Summary_2026-01-03_Fix_Vendor_Signup.md`

### Key Sections

**Tasks Completed:**
- [ ] Identified root cause of form rendering issue
- [ ] Fixed API route data structure
- [ ] Fixed form component data extraction
- [ ] Added error handling
- [ ] Tested both signup forms
- [ ] Deleted legacy fireworks page

**Changes Made:**
- List files modified
- Explain data structure changes
- Note any debugging additions

**Testing & Verification:**
- Both signup forms load
- Fields render correctly
- No runtime errors
- Submit button visible

**Issues Encountered:**
- Describe the root cause found
- How it was fixed
- Why it happened

**Next Steps:**
- Authentication implementation (Phase 2)
- Form validation
- Connect signup to user accounts

---

## Important Notes

**Don't modify database schema** - The schema is correct, this is a data structure mismatch issue in the application code.

**Keep fixes minimal** - Just get forms rendering again, don't add features yet.

**Test thoroughly** - Both verticals must work before proceeding to authentication.

---

**Estimated Time:** 30-60 minutes  
**Complexity:** Medium (debugging required)  
**Priority:** CRITICAL
