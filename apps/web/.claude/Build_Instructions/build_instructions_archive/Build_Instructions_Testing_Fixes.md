# Build Instructions - Testing Fixes

**Date:** January 6, 2026  
**Priority:** High - Blocking issues from E2E testing

---

## Fix 1: FK Constraint (CRITICAL - Apply to Staging)

The `vendor_profiles_user_id_fkey` references wrong column. Already fixed on Dev manually.

**Create migration:** `supabase/migrations/20260106_HHMMSS_001_fix_vendor_profiles_fk.sql`

```sql
-- =============================================================================
-- Migration: Fix vendor_profiles FK constraint
-- =============================================================================
-- Purpose: FK was referencing user_profiles.id instead of user_profiles.user_id
-- Applied to: [x] Dev (manual fix) | [ ] Staging
-- =============================================================================

-- Drop the bad FK
ALTER TABLE vendor_profiles 
DROP CONSTRAINT IF EXISTS vendor_profiles_user_id_fkey;

-- Recreate with correct reference
ALTER TABLE vendor_profiles 
ADD CONSTRAINT vendor_profiles_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES user_profiles(user_id);
```

**Apply to Staging immediately.**

---

## Fix 2: Vertical Homepage Route

**Problem:** `/fireworks` goes to vendor-signup instead of branded homepage

**Check:** `src/app/[vertical]/page.tsx` - This file should exist from Phase 9.

If missing, create it. If exists, check for redirect logic that's sending to vendor-signup.

**Expected behavior:**
- `/fireworks` → Fireworks branded homepage with "Browse" and "Become a Vendor" buttons
- `/farmers_market` → Farmers Market branded homepage

**File to check/fix:** `src/app/[vertical]/page.tsx`

Look for any `redirect()` calls that might be sending users away.

---

## Fix 3: Vendor Signup Page Branding

**Problem:** `/[vertical]/vendor-signup` shows black/white instead of vertical branding

**File:** `src/app/[vertical]/vendor-signup/page.tsx` (or similar)

**Fix:** Ensure page loads branding like other pages:

```typescript
// At top of component
const config = await getVerticalConfig(vertical)
const branding = config?.branding

// In JSX, use branding colors:
style={{
  backgroundColor: branding?.colors.background || '#fff',
  color: branding?.colors.text || '#333'
}}
```

Check that `getVerticalConfig` is being called and branding is applied to the page container and form elements.

---

## Fix 4: Add Home Navigation

**Problem:** No "Home" link on signup, login, logout redirect pages

**Files to update:**
- `src/app/[vertical]/signup/page.tsx`
- `src/app/[vertical]/login/page.tsx`
- `src/app/[vertical]/forgot-password/page.tsx`
- `src/app/[vertical]/reset-password/page.tsx`

**Add to each page** (in the nav or as a link):

```typescript
<Link
  href="/"
  style={{
    color: branding.colors.primary,
    textDecoration: 'none'
  }}
>
  ← Home
</Link>
```

Or add a simple nav bar:

```typescript
<nav style={{
  padding: '15px 40px',
  borderBottom: `1px solid ${branding.colors.secondary}`
}}>
  <Link href="/" style={{ marginRight: 20, color: branding.colors.text }}>
    Home
  </Link>
  <Link href={`/${vertical}`} style={{ color: branding.colors.primary, fontWeight: 600 }}>
    {branding.brand_name}
  </Link>
</nav>
```

---

## Fix 5: Homepage Sign Up Button - Vertical Choice

**Problem:** Main homepage "Sign Up" button goes directly to `/fireworks/signup` instead of letting user choose

**File:** `src/app/page.tsx`

**Option A - Remove generic signup, keep vertical-specific buttons:**

Remove the generic "Sign Up" button from nav. Users choose vertical from marketplace cards.

**Option B - Add vertical selection modal/page:**

Create `/signup` page that asks "Which marketplace?" before redirecting.

**Simplest fix (Option A):**

In `src/app/page.tsx`, change nav to:

```typescript
{user ? (
  <Link href="/dashboard">Dashboard</Link>
) : (
  <Link href="#marketplaces">Get Started</Link>  // Scrolls to marketplace cards
)}
```

Or just remove the Sign Up button from main nav entirely - the marketplace cards have signup buttons.

---

## Testing Checklist After Fixes

- [ ] `/fireworks` loads branded homepage (not vendor-signup)
- [ ] `/farmers_market` loads branded homepage
- [ ] `/fireworks/vendor-signup` shows fireworks branding (orange theme)
- [ ] `/farmers_market/vendor-signup` shows farmers market branding (green theme)
- [ ] Login page has "Home" link
- [ ] Signup page has "Home" link
- [ ] Forgot password page has "Home" link
- [ ] Homepage signup button behavior is clear (either removed or goes to choice)
- [ ] Vendor signup works (FK fix applied to Staging)

---

**Estimated time:** 1-2 hours
