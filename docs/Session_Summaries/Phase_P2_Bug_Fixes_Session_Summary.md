# Phase P-2: Bug Fixes & Performance - Session Summary

**Date:** January 15, 2026
**Phase:** P-2 - Post-Phase P Bug Fixes
**Status:** Complete
**Branch:** main (direct commits)

---

## Overview

This session addressed multiple bugs discovered during Phase P testing, plus a performance optimization for the cart. All fixes have been committed and pushed to main.

---

## Bug Fixes

### 1. Draft Vendors Not Visible in Admin List

**Problem:** Vendors with `status: 'draft'` were not appearing in the admin vendor approval list. They were stuck in limbo - unable to be reviewed or approved.

**Root Cause:** The pending vendors query only looked for `status = 'submitted'`, missing draft vendors.

**Fix:**
- `src/app/admin/vendors/pending/page.tsx` - Changed `.eq('status', 'submitted')` to `.in('status', ['submitted', 'draft'])`

---

### 2. No Approve Button for Draft Vendors

**Problem:** Even after draft vendors appeared in the list, clicking into their detail page showed no approve/reject buttons.

**Root Cause:** The button visibility logic only checked for `currentStatus === 'submitted'`.

**Fix:**
- `src/app/admin/vendors/[vendorId]/VendorActions.tsx` - Changed condition to `(currentStatus === 'submitted' || currentStatus === 'draft')`

---

### 3. Vertical Admin Missing Markets/Tier Columns

**Problem:** The vertical-level vendor management (`/[vertical]/admin`) didn't show which markets vendors belong to or their tier status, unlike the platform admin.

**Fix:**
- `src/app/[vertical]/admin/VendorManagement.tsx`:
  - Added Markets column showing market names (max 2 displayed, "+N more" for overflow)
  - Added Tier column with color-coded badges (premium=blue, featured=gold, standard=gray)
  - Fixed draft status handling (same as platform admin fix)
- `src/app/[vertical]/admin/users/page.tsx`:
  - Added Tier column for vendor users

---

### 4. Next.js Image Component Error for Supabase URLs

**Problem:** Uploading a profile image and displaying it threw error: `Invalid src prop... hostname "*.supabase.co" is not configured under images in next.config.ts`

**Root Cause:** Next.js Image component requires explicit allowlisting of external image hostnames.

**Fix:**
- `apps/web/next.config.ts` - Added remotePatterns configuration:
```typescript
images: {
  remotePatterns: [
    {
      protocol: 'https',
      hostname: '*.supabase.co',
      pathname: '/storage/v1/object/public/**',
    },
  ],
},
```

---

### 5. Profile Image Size Limit Changed (5MB → 2MB)

**Problem:** 5MB limit was too generous given the 500MB global bucket limit. Need room for product images.

**Fix:**
- `src/app/api/vendor/profile-image/route.ts` - Changed max size to 2MB with helpful error message
- `src/components/vendor/ProfileImageUpload.tsx` - Updated validation to 2MB, added Squoosh recommendation in error message

---

### 6. Allergen Info Not Displaying

**Problem:** Listings with allergen info weren't showing the allergen warning on browse page cards or detail page.

**Root Cause:**
- Browse page query didn't include `listing_data` field
- Detail page had the warning section code but it wasn't committed

**Fix:**
- `src/app/[vertical]/browse/page.tsx`:
  - Added `listing_data` to Listing interface
  - Added `listing_data` to Supabase query
  - Added allergen warning badge (yellow, top-right corner of listing card image)
- `src/app/[vertical]/listing/[listingId]/page.tsx`:
  - Committed the allergen warning section that displays below description

---

### 7. Cart Quantity Update Lag (Performance)

**Problem:** Adjusting item quantity in cart caused a long pause and the cart seemed to reload.

**Root Cause:** Double round-trip: `updateQuantity()` → API PUT → wait → `refreshCart()` → API GET → wait → UI update

**Fix:** Implemented optimistic updates in `src/lib/hooks/useCart.tsx`:

**`updateQuantity` function:**
1. Save previous state (for rollback)
2. Immediately update local state (UI responds instantly)
3. Send API request in background
4. If API fails, revert to previous state

**`removeFromCart` function:**
- Same optimistic update pattern applied

**Result:** Cart interactions now feel instant. API syncs in background.

---

## Files Modified

| File | Changes |
|------|---------|
| `src/app/admin/vendors/pending/page.tsx` | Include draft status in query |
| `src/app/admin/vendors/[vendorId]/VendorActions.tsx` | Show buttons for draft vendors |
| `src/app/[vertical]/admin/VendorManagement.tsx` | Add Markets + Tier columns, draft status fix |
| `src/app/[vertical]/admin/users/page.tsx` | Add Tier column |
| `apps/web/next.config.ts` | Add Supabase remotePatterns for images |
| `src/app/api/vendor/profile-image/route.ts` | 5MB → 2MB limit |
| `src/components/vendor/ProfileImageUpload.tsx` | 5MB → 2MB limit, Squoosh recommendation |
| `src/app/[vertical]/browse/page.tsx` | Add listing_data to query, allergen badge on cards |
| `src/app/[vertical]/listing/[listingId]/page.tsx` | Allergen warning section |
| `src/lib/hooks/useCart.tsx` | Optimistic updates for quantity/remove |

---

## Commits

1. `bc07889` - Add allergen warning display to listing cards and detail page
2. `c9128e4` - Optimize cart quantity updates with optimistic UI

*(Note: Some earlier fixes were part of Phase P commits before this session)*

---

## Testing Verification

All fixes have been tested and verified:
- [x] Draft vendors appear in admin pending list
- [x] Approve/reject buttons work for draft vendors
- [x] Vertical admin shows Markets and Tier columns
- [x] Profile images display correctly (Supabase URLs work)
- [x] 2MB image upload limit enforced with helpful error
- [x] Allergen badge shows on browse page cards
- [x] Allergen warning shows on listing detail page
- [x] Cart quantity changes are instant (no lag)

---

## Reminder: Staging Database Sync

The following SQL still needs to be run on Staging to sync with Dev:

```sql
-- Phase O migrations
ALTER TABLE markets ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_markets_active ON markets(active);
UPDATE markets SET active = false WHERE status = 'inactive';
UPDATE listings SET category = 'Dairy & Eggs' WHERE category IN ('Dairy', 'Eggs');
UPDATE listings SET category = 'Pantry' WHERE category IN ('Preserves', 'Honey');
UPDATE listings SET category = 'Home & Functional' WHERE category IN ('Crafts', 'Plants', 'Other');

-- Phase P migrations
ALTER TABLE markets ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS profile_image_url TEXT;
ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE vendor_profiles ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}'::jsonb;
UPDATE listings SET category = 'Home & Functional' WHERE category NOT IN (
  'Produce', 'Meat & Poultry', 'Dairy & Eggs', 'Baked Goods',
  'Pantry', 'Prepared Foods', 'Health & Wellness', 'Art & Decor', 'Home & Functional'
);
```

---

*Phase P-2 Bug Fixes Complete*
