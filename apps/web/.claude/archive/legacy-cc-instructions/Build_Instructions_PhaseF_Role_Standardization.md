# Build Instructions - Phase F: Standardize Role Checking

**Date:** January 11, 2026  
**Priority:** High - Fixes admin access issues  
**Estimated Time:** 1-2 hours

---

## Overview

The codebase has two role columns causing inconsistency:
- `role` (enum) - legacy, single value
- `roles` (array) - flexible, allows multiple roles

**Decision:** Standardize on `roles` (array) because users can legitimately be multiple things (admin + buyer, vendor + buyer, etc.)

---

## Current Problem

```sql
-- What we have now for admin user:
role = 'admin'        -- Set by Chet
roles = '{buyer}'     -- Set at signup, doesn't include admin
```

Code checking `roles` array doesn't see admin. Code checking `role` enum works.

---

## The Fix

1. All code checks `roles` array (not `role` enum)
2. Stop writing to `role` column
3. Keep `role` column for now (cleanup later)

---

## Part 1: Search and Identify

Before making changes, find all files using role checks.

**Search the codebase for these patterns:**
```bash
# In project root, run:
grep -r "profile?.role" src/
grep -r "userProfile?.role" src/
grep -r "\.role ===" src/
grep -r "\.role !==" src/
grep -r "role:" src/app/
grep -r "role =" src/
```

Document all files found for updating.

---

## Part 2: Update Admin Checks

### Pattern to Use

```typescript
// OLD (checking enum):
if (profile?.role === 'admin')

// NEW (checking array):
if (profile?.roles?.includes('admin'))

// SAFEST (check both during transition):
const isAdmin = profile?.role === 'admin' || profile?.roles?.includes('admin')
```

### Files to Update (Created in Phase E)

**File:** `src/app/[vertical]/admin/page.tsx`
```typescript
// Find:
if (profile?.role !== 'admin')
// Or:
const isAdmin = userProfile?.roles?.includes('admin')

// Replace with:
const isAdmin = profile?.role === 'admin' || profile?.roles?.includes('admin')
if (!isAdmin) {
  redirect(`/${params.vertical}/dashboard`)
}
```

**File:** `src/app/[vertical]/admin/layout.tsx`
```typescript
// Same pattern - check both role and roles
const isAdmin = profile?.role === 'admin' || profile?.roles?.includes('admin')
if (!isAdmin) {
  redirect(`/${params.vertical}/dashboard`)
}
```

**File:** `src/app/[vertical]/admin/VendorManagement.tsx`
```typescript
// If there are any role checks here, update them
```

**File:** `src/app/api/admin/vendors/[id]/approve/route.ts`
```typescript
// Find the admin check and update:
const isAdmin = profile?.role === 'admin' || profile?.roles?.includes('admin')
if (!isAdmin) {
  return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
}
```

**File:** `src/app/api/admin/vendors/[id]/reject/route.ts`
```typescript
// Same pattern
const isAdmin = profile?.role === 'admin' || profile?.roles?.includes('admin')
if (!isAdmin) {
  return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
}
```

---

## Part 3: Update Dashboard Role Checks

**File:** `src/app/[vertical]/dashboard/page.tsx`

```typescript
// Find admin section check (added in Phase D):
{userProfile?.role === 'admin' && (

// Update to:
{(userProfile?.role === 'admin' || userProfile?.roles?.includes('admin')) && (
```

---

## Part 4: Update Any Other Role Checks

Search results from Part 1 may reveal other files. Common patterns to update:

### Buyer Checks
```typescript
// OLD:
if (profile?.role === 'buyer')

// NEW:
if (profile?.roles?.includes('buyer'))
```

### Vendor Checks  
```typescript
// OLD:
if (profile?.role === 'vendor')

// NEW:
if (profile?.roles?.includes('vendor'))
```

### Verifier Checks
```typescript
// OLD:
if (profile?.role === 'verifier')

// NEW:
if (profile?.roles?.includes('verifier'))
```

---

## Part 5: Update Signup Flow

When new users sign up, ensure `roles` array is set correctly.

**File:** Find signup handler (likely `src/app/api/auth/signup/route.ts` or similar)

```typescript
// When creating user_profile, set roles array:
const { error } = await supabase
  .from('user_profiles')
  .insert({
    user_id: user.id,
    display_name: displayName,
    roles: ['buyer'],  // Default role in array format
    // ... other fields
  })
```

---

## Part 6: Update Role Assignment Functions

### Adding a Role
```typescript
// To add admin role to existing user:
const { error } = await supabase
  .from('user_profiles')
  .update({ 
    roles: [...currentRoles, 'admin']
  })
  .eq('user_id', userId)

// Or using SQL:
// UPDATE user_profiles SET roles = array_append(roles, 'admin') WHERE user_id = 'xxx';
```

### Checking Multiple Roles
```typescript
// User is admin AND vendor:
const isAdminVendor = profile?.roles?.includes('admin') && profile?.roles?.includes('vendor')

// User has ANY of these roles:
const hasAccess = ['admin', 'verifier'].some(r => profile?.roles?.includes(r))
```

---

## Part 7: Create Helper Function (Optional but Recommended)

**File:** `src/lib/auth/roles.ts`

```typescript
export type UserRole = 'buyer' | 'vendor' | 'admin' | 'verifier'

export function hasRole(profile: { role?: string; roles?: string[] } | null, role: UserRole): boolean {
  if (!profile) return false
  // Check both columns during transition
  return profile.role === role || profile.roles?.includes(role) || false
}

export function hasAnyRole(profile: { role?: string; roles?: string[] } | null, roles: UserRole[]): boolean {
  if (!profile) return false
  return roles.some(r => hasRole(profile, r))
}

export function isAdmin(profile: { role?: string; roles?: string[] } | null): boolean {
  return hasRole(profile, 'admin')
}

export function isBuyer(profile: { role?: string; roles?: string[] } | null): boolean {
  return hasRole(profile, 'buyer')
}

export function isVendor(profile: { role?: string; roles?: string[] } | null): boolean {
  return hasRole(profile, 'vendor')
}
```

**Then use throughout codebase:**
```typescript
import { isAdmin, hasRole } from '@/lib/auth/roles'

if (isAdmin(profile)) {
  // admin access
}

if (hasRole(profile, 'vendor')) {
  // vendor access
}
```

---

## Part 8: Database Functions (If Any)

Check if any database functions check role. From earlier reconciliation, these might need updates:

**`has_role` function** - Already checks array with `check_role = ANY(roles)`

**`is_admin` function** - Verify it works with array:
```sql
-- Check current implementation:
SELECT prosrc FROM pg_proc WHERE proname = 'is_admin';
```

If it checks `role` enum instead of `roles` array, update it.

---

## Testing Checklist

### Admin Access
- [ ] jennifer@8fifteenconsulting.com can access /farmers_market/admin
- [ ] Non-admin users are redirected

### Role Checks
- [ ] Dashboard shows admin section for admin users
- [ ] Vendor section shows for users with 'vendor' in roles
- [ ] Buyer features work for users with 'buyer' in roles

### API Routes
- [ ] Admin approve/reject APIs work
- [ ] Non-admins get 403 error

### Signup
- [ ] New user gets roles: ['buyer'] by default

---

## Commit Strategy

```bash
# After creating helper
git add -A
git commit -m "Add role checking helper functions"

# After updating all files
git add -A
git commit -m "Standardize role checks to use roles array

- Update all admin checks to use roles array
- Update dashboard role checks
- Maintain backward compatibility with role enum
- Create hasRole/isAdmin helper functions"

# Push
git push origin main
```

---

## Future Cleanup (Not Now)

Once everything is working with `roles` array:
1. Migrate any remaining `role` enum values to `roles` array
2. Remove `role` column from database
3. Remove fallback checks for `role` enum

But NOT in this phase - just standardize the checks first.

---

## Session Summary Template

```markdown
# Session Summary - Phase F: Role Standardization

**Date:** [DATE]
**Duration:** [TIME]

## Completed
- [ ] Created role helper functions
- [ ] Updated admin page checks
- [ ] Updated admin layout checks
- [ ] Updated admin API routes
- [ ] Updated dashboard role checks
- [ ] Updated signup flow
- [ ] Searched and fixed all other role checks

## Files Modified
[List all files changed]

## Testing Results
- Admin access: ✅/❌
- Dashboard sections: ✅/❌
- API routes: ✅/❌
- New user signup: ✅/❌

## Notes
[Any issues encountered]
```
